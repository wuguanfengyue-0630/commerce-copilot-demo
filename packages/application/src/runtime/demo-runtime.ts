/// <reference types="node" />

import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditEvent, AuditEventType, IsoTimestamp } from "@commerce-copilot/domain";
import type {
  ApplicationRepositories,
  ApplicationUnitOfWork,
  ApprovalDecisionRepository,
  AuditEventRepository,
  ConversationRepository,
  ExecutionAttemptRepository,
  ExecutionResultRepository,
  OperationContext,
  ProposalRepository,
  PublishedKnowledgeRepository,
  SuggestionRepository,
} from "../ports/repositories.ts";
import { RepositoryConflictError } from "../ports/repositories.ts";
import { DemoRuntimeError } from "./demo-runtime-error.ts";
import {
  assertContext,
  assertNonBlank,
  assertTrustedProposal,
  canonicalTimestamp,
  snapshotApprovalDecision,
  snapshotAuditEvent,
  snapshotExecutionAttempt,
  snapshotExecutionResult,
  snapshotSuggestion,
} from "./demo-runtime-snapshots.ts";
import { cloneState, createSeedState, type DemoState } from "./demo-runtime-state.ts";

export * from "./demo-runtime-error.ts";

export type DemoRuntime = Readonly<{
  repositories: ApplicationRepositories;
  unitOfWork: ApplicationUnitOfWork;
  reset(): void;
}>;

export function createDemoRuntime(): DemoRuntime {
  let state = createSeedState();
  let pendingTransactions = 0;
  let transactionTail: Promise<void> = Promise.resolve();
  const transactionScope = new AsyncLocalStorage<{ active: boolean }>();

  const repositories = createRepositories(
    () => state,
    () => {
      if (pendingTransactions > 0) {
        throw new DemoRuntimeError("DEMO_RUNTIME_TRANSACTION_ACTIVE");
      }
    },
  );
  const unitOfWork: ApplicationUnitOfWork = Object.freeze({
    async run<Result>(
      context: OperationContext,
      work: (repositories: ApplicationRepositories) => Promise<Result>,
    ): Promise<Result> {
      if (transactionScope.getStore()?.active === true) {
        throw new DemoRuntimeError("DEMO_RUNTIME_TRANSACTION_ACTIVE");
      }
      assertContext(context);
      pendingTransactions += 1;
      const operation = transactionTail.then(async () => {
        const stagedState = cloneState(state);
        const stagedRepositories = createRepositories(() => stagedState);
        const scope = { active: true };
        try {
          const result = await transactionScope.run(scope, () => work(stagedRepositories));
          state = stagedState;
          return result;
        } finally {
          scope.active = false;
        }
      });
      transactionTail = operation.then(
        () => undefined,
        () => undefined,
      );

      try {
        return await operation;
      } finally {
        pendingTransactions -= 1;
      }
    },
  });

  return Object.freeze({
    repositories,
    unitOfWork,
    reset(): void {
      if (pendingTransactions > 0) {
        throw new DemoRuntimeError("DEMO_RUNTIME_TRANSACTION_ACTIVE");
      }
      state = createSeedState();
    },
  });
}

function createRepositories(
  readState: () => DemoState,
  assertMutationAllowed: () => void = () => undefined,
): ApplicationRepositories {
  const repositories: ApplicationRepositories = {
    conversations: Object.freeze({
      async get(context, conversationId) {
        assertContext(context);
        const conversation = readState().conversations.get(conversationId);
        return conversation !== undefined && conversation.companyId === context.companyId
          ? conversation
          : null;
      },
    } satisfies ConversationRepository),

    publishedKnowledge: Object.freeze({
      async search(query) {
        assertContext(query);
        assertNonBlank(query.query);
        const evaluatedAt = canonicalTimestamp(query.evaluatedAt);
        const normalizedQuery = query.query.trim().toLocaleLowerCase("zh-CN");
        const records = [...readState().publishedKnowledge.values()].filter((record) => {
          const matchesCompany = record.companyId === query.companyId;
          const isLive =
            record.publishedAt <= evaluatedAt &&
            (record.expiresAt === undefined || record.expiresAt > evaluatedAt);
          const matchesQuery =
            normalizedQuery.includes(record.scenario) ||
            record.title.toLocaleLowerCase("zh-CN").includes(normalizedQuery) ||
            record.content.toLocaleLowerCase("zh-CN").includes(normalizedQuery);

          return matchesCompany && isLive && matchesQuery;
        });

        return frozenSorted(records, (left, right) =>
          compareTimestampAndId(
            left.publishedAt,
            left.releaseId,
            right.publishedAt,
            right.releaseId,
          ),
        );
      },
    } satisfies PublishedKnowledgeRepository),

    suggestions: Object.freeze({
      async save(context, record) {
        assertMutationAllowed();
        const snapshot = snapshotSuggestion(context, record);
        const suggestions = readState().suggestions;
        if (suggestions.has(snapshot.suggestionId)) {
          throw new DemoRuntimeError("DEMO_RUNTIME_CONFLICT");
        }
        suggestions.set(snapshot.suggestionId, snapshot);
      },

      async get(context, suggestionId) {
        assertContext(context);
        const record = readState().suggestions.get(suggestionId);
        return record !== undefined && record.companyId === context.companyId ? record : null;
      },

      async findByCorrelation(context, conversationId, correlationId) {
        assertContext(context);
        assertNonBlank(correlationId);
        return (
          [...readState().suggestions.values()].find(
            (record) =>
              record.companyId === context.companyId &&
              record.conversationId === conversationId &&
              record.correlationId === correlationId,
          ) ?? null
        );
      },

      async listByConversation(context, conversationId) {
        assertContext(context);
        const records = [...readState().suggestions.values()].filter(
          (record) =>
            record.companyId === context.companyId && record.conversationId === conversationId,
        );
        return frozenSorted(records, (left, right) =>
          compareTimestampAndId(
            left.createdAt,
            left.suggestionId,
            right.createdAt,
            right.suggestionId,
          ),
        );
      },
    } satisfies SuggestionRepository),

    proposals: Object.freeze({
      async save(context, proposal) {
        assertMutationAllowed();
        assertContext(context);
        assertTrustedProposal(context, proposal);
        const proposals = readState().proposals;
        if (proposal.version !== 1 || proposals.has(proposal.proposalId)) {
          throw new DemoRuntimeError("DEMO_RUNTIME_CONFLICT");
        }
        proposals.set(proposal.proposalId, proposal);
      },

      async replace(context, next, expectedVersion) {
        assertMutationAllowed();
        assertContext(context);
        assertTrustedProposal(context, next);
        const proposals = readState().proposals;
        const current = proposals.get(next.proposalId);
        if (
          current === undefined ||
          current.companyId !== context.companyId ||
          current.version !== expectedVersion ||
          next.version !== expectedVersion + 1 ||
          !sameProposalIdentityAndPayload(current, next) ||
          !isValidProposalSuccessor(current, next)
        ) {
          throw new RepositoryConflictError();
        }
        proposals.set(next.proposalId, next);
      },

      async get(context, proposalId) {
        assertContext(context);
        const proposal = readState().proposals.get(proposalId);
        return proposal !== undefined && proposal.companyId === context.companyId ? proposal : null;
      },

      async listByConversation(context, conversationId) {
        assertContext(context);
        const proposals = [...readState().proposals.values()].filter(
          (proposal) =>
            proposal.companyId === context.companyId && proposal.conversationId === conversationId,
        );
        return frozenSorted(proposals, (left, right) =>
          compareTimestampAndId(left.createdAt, left.proposalId, right.createdAt, right.proposalId),
        );
      },
    } satisfies ProposalRepository),

    approvalDecisions: Object.freeze({
      async save(context, decision) {
        assertMutationAllowed();
        const snapshot = snapshotApprovalDecision(context, decision);
        const decisions = readState().approvalDecisions;
        if (decisions.has(snapshot.approvalDecisionId)) {
          throw new DemoRuntimeError("DEMO_RUNTIME_CONFLICT");
        }
        decisions.set(snapshot.approvalDecisionId, snapshot);
      },

      async get(context, approvalDecisionId) {
        assertContext(context);
        const decision = readState().approvalDecisions.get(approvalDecisionId);
        return decision !== undefined && decision.companyId === context.companyId ? decision : null;
      },

      async listByProposal(context, proposalId) {
        assertContext(context);
        const decisions = [...readState().approvalDecisions.values()].filter(
          (decision) =>
            decision.companyId === context.companyId && decision.proposalId === proposalId,
        );
        return frozenSorted(decisions, (left, right) =>
          compareTimestampAndId(
            left.decidedAt,
            left.approvalDecisionId,
            right.decidedAt,
            right.approvalDecisionId,
          ),
        );
      },
    } satisfies ApprovalDecisionRepository),

    executionAttempts: Object.freeze({
      async save(context, attempt) {
        assertMutationAllowed();
        const snapshot = snapshotExecutionAttempt(context, attempt);
        const attempts = readState().executionAttempts;
        if (attempts.has(snapshot.executionAttemptId)) {
          throw new DemoRuntimeError("DEMO_RUNTIME_CONFLICT");
        }
        attempts.set(snapshot.executionAttemptId, snapshot);
      },

      async get(context, executionAttemptId) {
        assertContext(context);
        const attempt = readState().executionAttempts.get(executionAttemptId);
        return attempt !== undefined && attempt.companyId === context.companyId ? attempt : null;
      },

      async listByProposal(context, proposalId) {
        assertContext(context);
        const attempts = [...readState().executionAttempts.values()].filter(
          (attempt) => attempt.companyId === context.companyId && attempt.proposalId === proposalId,
        );
        return frozenSorted(attempts, (left, right) =>
          compareTimestampAndId(
            left.attemptedAt,
            left.executionAttemptId,
            right.attemptedAt,
            right.executionAttemptId,
          ),
        );
      },
    } satisfies ExecutionAttemptRepository),

    executionResults: Object.freeze({
      async save(context, result) {
        assertMutationAllowed();
        const snapshot = snapshotExecutionResult(context, result);
        const results = readState().executionResults;
        if (results.has(snapshot.idempotencyKey)) {
          throw new DemoRuntimeError("DEMO_RUNTIME_CONFLICT");
        }
        results.set(snapshot.idempotencyKey, snapshot);
      },

      async findByIdempotencyKey(context, idempotencyKey) {
        assertContext(context);
        assertNonBlank(idempotencyKey);
        const result = readState().executionResults.get(idempotencyKey);
        return result !== undefined && result.companyId === context.companyId ? result : null;
      },

      async listByProposal(context, proposalId) {
        assertContext(context);
        const results = [...readState().executionResults.values()].filter(
          (result) => result.companyId === context.companyId && result.proposalId === proposalId,
        );
        return frozenSorted(results, (left, right) =>
          compareTimestampAndId(
            left.completedAt,
            left.executionId,
            right.completedAt,
            right.executionId,
          ),
        );
      },
    } satisfies ExecutionResultRepository),

    auditEvents: Object.freeze({
      async append(context, event) {
        assertMutationAllowed();
        const snapshot = snapshotAuditEvent(context, event);
        const events = readState().auditEvents;
        if (events.has(snapshot.auditEventId)) {
          throw new DemoRuntimeError("DEMO_RUNTIME_CONFLICT");
        }
        events.set(snapshot.auditEventId, snapshot);
      },

      async list(context) {
        assertContext(context);
        const events = [...readState().auditEvents.values()].filter(
          (event) => event.companyId === context.companyId,
        );
        return frozenSorted(events, compareAuditEvents);
      },
    } satisfies AuditEventRepository),
  };

  return Object.freeze(repositories);
}

function frozenSorted<Record>(
  records: readonly Record[],
  compare: (left: Record, right: Record) => number,
): readonly Record[] {
  return Object.freeze([...records].sort(compare));
}

function compareTimestampAndId(
  leftTimestamp: IsoTimestamp,
  leftId: string,
  rightTimestamp: IsoTimestamp,
  rightId: string,
): number {
  const timestampOrder = leftTimestamp.localeCompare(rightTimestamp);
  return timestampOrder === 0 ? leftId.localeCompare(rightId) : timestampOrder;
}

function compareAuditEvents(left: AuditEvent, right: AuditEvent): number {
  const timestampOrder = left.occurredAt.localeCompare(right.occurredAt);
  if (timestampOrder !== 0) {
    return timestampOrder;
  }
  const stageOrder = auditStage(left.eventType) - auditStage(right.eventType);
  return stageOrder === 0 ? left.auditEventId.localeCompare(right.auditEventId) : stageOrder;
}

function auditStage(eventType: AuditEventType): number {
  switch (eventType) {
    case "conversation.message_ingested":
      return 0;
    case "knowledge.retrieved":
      return 1;
    case "agent.suggestion_generated":
      return 2;
    case "action.proposed":
      return 3;
    case "approval.approved":
    case "approval.rejected":
      return 4;
    case "action.execution_started":
      return 5;
    case "action.execution_succeeded":
    case "action.execution_blocked":
      return 6;
  }
}

function sameProposalIdentityAndPayload(
  current: import("@commerce-copilot/domain").ActionProposal,
  next: import("@commerce-copilot/domain").ActionProposal,
): boolean {
  return (
    current.proposalId === next.proposalId &&
    current.companyId === next.companyId &&
    current.storeId === next.storeId &&
    current.conversationId === next.conversationId &&
    current.createdAt === next.createdAt &&
    current.expiresAt === next.expiresAt &&
    current.payload.kind === next.payload.kind &&
    current.payload.orderId === next.payload.orderId &&
    current.payload.reasonCode === next.payload.reasonCode &&
    current.payload.observedOrderVersion === next.payload.observedOrderVersion &&
    current.payload.observedOrderStatus === next.payload.observedOrderStatus &&
    current.payload.amount.amountMinor === next.payload.amount.amountMinor &&
    current.payload.amount.currency === next.payload.amount.currency &&
    current.payload.observedRefundableAmount.amountMinor ===
      next.payload.observedRefundableAmount.amountMinor &&
    current.payload.observedRefundableAmount.currency ===
      next.payload.observedRefundableAmount.currency
  );
}

function isValidProposalSuccessor(
  current: import("@commerce-copilot/domain").ActionProposal,
  next: import("@commerce-copilot/domain").ActionProposal,
): boolean {
  switch (current.status) {
    case "pending_approval":
      return next.status === "approved" || next.status === "rejected";
    case "approved":
      return (
        (next.status === "executing" || next.status === "needs_human") &&
        sameApproval(current.approval, next.approval)
      );
    case "executing":
      return (
        (next.status === "executed" || next.status === "needs_human") &&
        sameApproval(current.approval, next.approval) &&
        next.executionStartedAt === current.executionStartedAt
      );
    default:
      return false;
  }
}

function sameApproval(
  current: import("@commerce-copilot/domain").ActionApproval,
  next: import("@commerce-copilot/domain").ActionApproval,
): boolean {
  return (
    current.approvedAt === next.approvedAt &&
    current.approvedBy.userId === next.approvedBy.userId &&
    current.approvedBy.role === next.approvedBy.role
  );
}
