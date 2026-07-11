import type { IsoTimestamp } from "@commerce-copilot/domain";
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

  const repositories = createRepositories(() => state);
  const unitOfWork: ApplicationUnitOfWork = Object.freeze({
    async run<Result>(
      context: OperationContext,
      work: (repositories: ApplicationRepositories) => Promise<Result>,
    ): Promise<Result> {
      assertContext(context);
      pendingTransactions += 1;
      const operation = transactionTail.then(async () => {
        const stagedState = cloneState(state);
        const stagedRepositories = createRepositories(() => stagedState);
        const result = await work(stagedRepositories);
        state = stagedState;
        return result;
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

function createRepositories(readState: () => DemoState): ApplicationRepositories {
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
        assertContext(context);
        assertTrustedProposal(context, proposal);
        readState().proposals.set(proposal.proposalId, proposal);
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
        return frozenSorted(events, (left, right) =>
          compareTimestampAndId(
            left.occurredAt,
            left.auditEventId,
            right.occurredAt,
            right.auditEventId,
          ),
        );
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
