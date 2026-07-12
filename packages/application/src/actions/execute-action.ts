import {
  type ActionProposal,
  type ApprovedActionProposal,
  type Clock,
  createAuditEvent,
  createAuditEventId,
  createOrderId,
  type ExecutedActionProposal,
  type ExecutingActionProposal,
  markExecuted,
  markExecuting,
  markNeedsHuman,
  type NeedsHumanActionProposal,
  type OrderSnapshot,
  toIsoTimestamp,
} from "@commerce-copilot/domain";
import type { CommerceConnector, ExecutionResult } from "../ports/commerce-connector.ts";
import type {
  ApplicationRepositories,
  ApplicationUnitOfWork,
  ExecutionAttemptRecord,
  ExecutionResultRecord,
  OperationContext,
} from "../ports/repositories.ts";
import { RepositoryConflictError } from "../ports/repositories.ts";
import type { ApprovalCommandActor } from "./decide-approval.ts";

export const EXECUTION_ERROR_CODES = [
  "EXECUTION_INVALID_COMMAND",
  "EXECUTION_NOT_FOUND",
  "EXECUTION_ROLE_REQUIRED",
  "EXECUTION_CONFLICT",
  "EXECUTION_PERSIST_FAILED",
] as const;

export type ExecuteActionErrorCode = (typeof EXECUTION_ERROR_CODES)[number];

export class ExecuteActionError extends Error {
  readonly code: ExecuteActionErrorCode;

  constructor(code: ExecuteActionErrorCode) {
    super(code);
    this.name = "ExecuteActionError";
    this.code = code;
  }
}

export type ExecuteApprovedActionCommand = Readonly<{
  companyId: OperationContext["companyId"];
  proposalId: ExecutionResultRecord["proposalId"];
  actor: ApprovalCommandActor;
  correlationId: string;
  causationId: string;
}>;

export type ExecuteActionSucceeded = Readonly<{
  status: "succeeded";
  proposal: ExecutedActionProposal;
  executionResult: ExecutionResultRecord;
}>;

export type NeedsHumanReason =
  | "ORDER_CHANGED"
  | "ORDER_UNAVAILABLE"
  | "POLICY_CHANGED"
  | "PROPOSAL_EXPIRED"
  | "EXECUTION_UNCONFIRMED";

export type ExecuteActionNeedsHuman = Readonly<{
  status: "needs_human";
  proposal: NeedsHumanActionProposal;
  reason: NeedsHumanReason;
}>;

export type ExecuteApprovedActionResult = ExecuteActionSucceeded | ExecuteActionNeedsHuman;

export type CreateExecuteActionDependencies = Readonly<{
  repositories: ApplicationRepositories;
  unitOfWork: ApplicationUnitOfWork;
  commerceConnector: CommerceConnector;
  clock: Clock;
}>;

export interface ExecuteActionUseCase {
  execute(command: ExecuteApprovedActionCommand): Promise<ExecuteApprovedActionResult>;
}

export function createExecuteActionUseCase(
  dependencies: CreateExecuteActionDependencies,
): ExecuteActionUseCase {
  return Object.freeze({
    async execute(command: ExecuteApprovedActionCommand): Promise<ExecuteApprovedActionResult> {
      assertCommand(command);
      if (command.actor.role !== "supervisor" && command.actor.role !== "admin") {
        throw new ExecuteActionError("EXECUTION_ROLE_REQUIRED");
      }
      const context = operationContext(command);

      try {
        return await dependencies.unitOfWork.run(context, async (repositories) => {
          const proposal = await repositories.proposals.get(context, command.proposalId);
          if (proposal === null) {
            throw new ExecuteActionError("EXECUTION_NOT_FOUND");
          }
          const idempotencyKey = `refund:${proposal.proposalId}`;
          if (proposal.status === "executed") {
            return loadExecutedResult(repositories, context, proposal, idempotencyKey);
          }
          if (proposal.status === "needs_human") {
            return needsHumanResult(
              proposal,
              normalizeNeedsHumanReason(proposal.needsHuman.reason),
            );
          }
          if (proposal.status !== "approved") {
            throw new ExecuteActionError("EXECUTION_CONFLICT");
          }

          const evaluatedAt = toIsoTimestamp(dependencies.clock.now());
          const recovery = await lookupExternalResult(
            dependencies.commerceConnector,
            idempotencyKey,
            proposal.approval.approvedAt,
            proposal.expiresAt,
          );
          if (recovery.status === "unavailable") {
            return persistBlocked(
              repositories,
              context,
              proposal,
              idempotencyKey,
              evaluatedAt,
              "EXECUTION_UNCONFIRMED",
            );
          }
          if (recovery.status === "found") {
            let recoveredExecuting: ExecutingActionProposal;
            try {
              recoveredExecuting = markExecuting(proposal, recovery.result.startedAt);
            } catch {
              return persistBlocked(
                repositories,
                context,
                proposal,
                idempotencyKey,
                evaluatedAt,
                "EXECUTION_UNCONFIRMED",
              );
            }
            await persistExecutionStarted(
              repositories,
              context,
              proposal,
              recoveredExecuting,
              idempotencyKey,
              recovery.result.startedAt,
            );
            return persistSucceeded(
              repositories,
              context,
              proposal,
              recoveredExecuting,
              recovery.result,
            );
          }
          if (evaluatedAt >= proposal.expiresAt) {
            return persistBlocked(
              repositories,
              context,
              proposal,
              idempotencyKey,
              evaluatedAt,
              "PROPOSAL_EXPIRED",
            );
          }
          if (!(await hasEnabledRefundPolicy(repositories, context, proposal, evaluatedAt))) {
            return persistBlocked(
              repositories,
              context,
              proposal,
              idempotencyKey,
              evaluatedAt,
              "POLICY_CHANGED",
            );
          }

          let liveOrder: OrderSnapshot;
          try {
            liveOrder = await dependencies.commerceConnector.getOrder({
              storeId: proposal.storeId,
              orderId: createOrderId(proposal.payload.orderId),
            });
          } catch {
            return persistBlocked(
              repositories,
              context,
              proposal,
              idempotencyKey,
              evaluatedAt,
              "ORDER_UNAVAILABLE",
            );
          }
          if (!matchesObservedOrder(proposal, liveOrder)) {
            return persistBlocked(
              repositories,
              context,
              proposal,
              idempotencyKey,
              evaluatedAt,
              "ORDER_CHANGED",
            );
          }

          const executing = markExecuting(proposal, evaluatedAt);
          await persistExecutionStarted(
            repositories,
            context,
            proposal,
            executing,
            idempotencyKey,
            evaluatedAt,
          );

          const connectorResult = await executeOrRecover(
            dependencies.commerceConnector,
            proposal,
            idempotencyKey,
            evaluatedAt,
          );
          if (connectorResult === null) {
            return persistUnconfirmed(
              repositories,
              context,
              executing,
              idempotencyKey,
              evaluatedAt,
            );
          }

          return persistSucceeded(repositories, context, proposal, executing, connectorResult);
        });
      } catch (error) {
        if (error instanceof ExecuteActionError) {
          throw error;
        }
        if (error instanceof RepositoryConflictError) {
          throw new ExecuteActionError("EXECUTION_CONFLICT");
        }
        throw new ExecuteActionError("EXECUTION_PERSIST_FAILED");
      }
    },
  });
}

async function hasEnabledRefundPolicy(
  repositories: ApplicationRepositories,
  context: OperationContext,
  proposal: ApprovedActionProposal,
  evaluatedAt: ExecutionAttemptRecord["attemptedAt"],
): Promise<boolean> {
  try {
    const evidence = await repositories.publishedKnowledge.search({
      ...context,
      storeId: proposal.storeId,
      conversationId: proposal.conversationId,
      query: "damaged_item",
      evaluatedAt,
    });
    return evidence.some(
      (record) => record.refundRule.kind === proposal.payload.kind && record.refundRule.enabled,
    );
  } catch {
    return false;
  }
}

async function loadExecutedResult(
  repositories: ApplicationRepositories,
  context: OperationContext,
  proposal: ExecutedActionProposal,
  idempotencyKey: string,
): Promise<ExecuteActionSucceeded> {
  const storedResult = await repositories.executionResults.findByIdempotencyKey(
    context,
    idempotencyKey,
  );
  if (storedResult === null || storedResult.proposalId !== proposal.proposalId) {
    throw new ExecuteActionError("EXECUTION_PERSIST_FAILED");
  }
  return Object.freeze({ status: "succeeded", proposal, executionResult: storedResult });
}

async function persistExecutionStarted(
  repositories: ApplicationRepositories,
  context: OperationContext,
  proposal: ApprovedActionProposal,
  executing: ExecutingActionProposal,
  idempotencyKey: string,
  executionStartedAt: ExecutionAttemptRecord["attemptedAt"],
): Promise<void> {
  await repositories.proposals.replace(context, executing, proposal.version);
  await repositories.executionAttempts.save(
    context,
    executionAttempt(proposal, context, idempotencyKey, "started", executionStartedAt),
  );
  await repositories.auditEvents.append(
    context,
    executionAudit(
      proposal,
      context,
      "05-execution-started",
      "action.execution_started",
      executionStartedAt,
    ),
  );
}

async function persistSucceeded(
  repositories: ApplicationRepositories,
  context: OperationContext,
  proposal: ApprovedActionProposal,
  executing: ExecutingActionProposal,
  connectorResult: ExecutionResult,
): Promise<ExecuteActionSucceeded> {
  const executed = markExecuted(executing, {
    executionId: connectorResult.executionId,
    executedAt: connectorResult.completedAt,
  });
  const storedResult = executionResult(proposal, context, connectorResult);
  await repositories.proposals.replace(context, executed, executing.version);
  await repositories.executionResults.save(context, storedResult);
  await repositories.executionAttempts.save(
    context,
    executionAttempt(
      proposal,
      context,
      connectorResult.idempotencyKey,
      "succeeded",
      connectorResult.completedAt,
    ),
  );
  await repositories.auditEvents.append(
    context,
    executionAudit(
      proposal,
      context,
      "06-execution-succeeded",
      "action.execution_succeeded",
      connectorResult.completedAt,
    ),
  );
  return Object.freeze({ status: "succeeded", proposal: executed, executionResult: storedResult });
}

async function persistBlocked(
  repositories: ApplicationRepositories,
  context: OperationContext,
  proposal: ApprovedActionProposal,
  idempotencyKey: string,
  attemptedAt: ExecutionAttemptRecord["attemptedAt"],
  reason: NeedsHumanReason,
): Promise<ExecuteActionNeedsHuman> {
  const blocked = markNeedsHuman(proposal, reason, attemptedAt);
  await repositories.proposals.replace(context, blocked, proposal.version);
  await repositories.executionAttempts.save(
    context,
    executionAttempt(proposal, context, idempotencyKey, "blocked", attemptedAt, reason),
  );
  await repositories.auditEvents.append(
    context,
    executionAudit(
      proposal,
      context,
      "06-execution-blocked",
      "action.execution_blocked",
      attemptedAt,
    ),
  );
  return needsHumanResult(blocked, reason);
}

async function persistUnconfirmed(
  repositories: ApplicationRepositories,
  context: OperationContext,
  executing: ExecutingActionProposal,
  idempotencyKey: string,
  attemptedAt: ExecutionAttemptRecord["attemptedAt"],
): Promise<ExecuteActionNeedsHuman> {
  const blocked = markNeedsHuman(executing, "EXECUTION_UNCONFIRMED", attemptedAt);
  await repositories.proposals.replace(context, blocked, executing.version);
  await repositories.executionAttempts.save(
    context,
    executionAttempt(
      executing,
      context,
      idempotencyKey,
      "blocked",
      attemptedAt,
      "EXECUTION_UNCONFIRMED",
    ),
  );
  await repositories.auditEvents.append(
    context,
    executionAudit(
      executing,
      context,
      "06-execution-blocked",
      "action.execution_blocked",
      attemptedAt,
    ),
  );
  return needsHumanResult(blocked, "EXECUTION_UNCONFIRMED");
}

function needsHumanResult(
  proposal: NeedsHumanActionProposal,
  reason: NeedsHumanReason,
): ExecuteActionNeedsHuman {
  return Object.freeze({ status: "needs_human", proposal, reason });
}

type ExternalResultLookup =
  | Readonly<{ status: "found"; result: ExecutionResult }>
  | Readonly<{ status: "absent" }>
  | Readonly<{ status: "unavailable" }>;

async function lookupExternalResult(
  connector: CommerceConnector,
  idempotencyKey: string,
  earliestStartedAt: ExecutionAttemptRecord["attemptedAt"],
  latestStartedAtExclusive: ExecutionAttemptRecord["attemptedAt"],
): Promise<ExternalResultLookup> {
  try {
    const result = await connector.findActionResult(idempotencyKey);
    if (result === null) {
      return Object.freeze({ status: "absent" });
    }
    const snapshot = snapshotValidConnectorResult(
      result,
      idempotencyKey,
      earliestStartedAt,
      latestStartedAtExclusive,
    );
    return snapshot === null
      ? Object.freeze({ status: "unavailable" })
      : Object.freeze({ status: "found", result: snapshot });
  } catch {
    return Object.freeze({ status: "unavailable" });
  }
}

async function executeOrRecover(
  connector: CommerceConnector,
  proposal: ApprovedActionProposal,
  idempotencyKey: string,
  executionStartedAt: ExecutionAttemptRecord["attemptedAt"],
): Promise<ExecutionResult | null> {
  let result: ExecutionResult | null;
  try {
    result = await connector.executeAction({
      storeId: proposal.storeId,
      proposalId: proposal.proposalId,
      payload: proposal.payload,
      idempotencyKey,
      executionStartedAt,
    });
  } catch {
    try {
      result = await connector.findActionResult(idempotencyKey);
    } catch {
      return null;
    }
  }
  return snapshotValidConnectorResult(
    result,
    idempotencyKey,
    executionStartedAt,
    undefined,
    executionStartedAt,
  );
}

function snapshotValidConnectorResult(
  result: ExecutionResult | null,
  idempotencyKey: string,
  earliestStartedAt: ExecutionAttemptRecord["attemptedAt"],
  latestStartedAtExclusive?: ExecutionAttemptRecord["attemptedAt"],
  expectedStartedAt?: ExecutionAttemptRecord["attemptedAt"],
): ExecutionResult | null {
  if (
    result === null ||
    result.status !== "succeeded" ||
    result.idempotencyKey !== idempotencyKey ||
    !isNonBlank(result.executionId) ||
    !isNonBlank(result.externalReference)
  ) {
    return null;
  }
  try {
    const startedAt = toIsoTimestamp(result.startedAt);
    const completedAt = toIsoTimestamp(result.completedAt);
    if (
      startedAt !== result.startedAt ||
      completedAt !== result.completedAt ||
      startedAt < earliestStartedAt ||
      (latestStartedAtExclusive !== undefined && startedAt >= latestStartedAtExclusive) ||
      (expectedStartedAt !== undefined && startedAt !== expectedStartedAt) ||
      completedAt < startedAt
    ) {
      return null;
    }
    return Object.freeze({
      status: "succeeded",
      executionId: result.executionId,
      idempotencyKey,
      externalReference: result.externalReference,
      startedAt,
      completedAt,
    });
  } catch {
    return null;
  }
}

function matchesObservedOrder(proposal: ApprovedActionProposal, order: OrderSnapshot): boolean {
  return (
    order.companyId === proposal.companyId &&
    order.storeId === proposal.storeId &&
    order.orderId === proposal.payload.orderId &&
    order.version === proposal.payload.observedOrderVersion &&
    order.status === proposal.payload.observedOrderStatus &&
    order.refundable.amountMinor === proposal.payload.observedRefundableAmount.amountMinor &&
    order.refundable.currency === proposal.payload.observedRefundableAmount.currency &&
    proposal.payload.amount.amountMinor <= order.refundable.amountMinor &&
    proposal.payload.amount.currency === order.refundable.currency
  );
}

function executionAttempt(
  proposal: ActionProposal,
  context: OperationContext,
  idempotencyKey: string,
  status: ExecutionAttemptRecord["status"],
  attemptedAt: ExecutionAttemptRecord["attemptedAt"],
  reason?: string,
): ExecutionAttemptRecord {
  const base = {
    executionAttemptId: `attempt-${proposal.proposalId}-${status}`,
    companyId: proposal.companyId,
    proposalId: proposal.proposalId,
    idempotencyKey,
    status,
    correlationId: context.correlationId,
    causationId: context.causationId,
    attemptedAt,
  };
  return reason === undefined ? Object.freeze(base) : Object.freeze({ ...base, reason });
}

function executionResult(
  proposal: ApprovedActionProposal,
  context: OperationContext,
  result: ExecutionResult,
): ExecutionResultRecord {
  return Object.freeze({
    executionId: result.executionId,
    companyId: proposal.companyId,
    proposalId: proposal.proposalId,
    idempotencyKey: result.idempotencyKey,
    status: "succeeded",
    externalReference: result.externalReference,
    startedAt: result.startedAt,
    correlationId: context.correlationId,
    causationId: context.causationId,
    completedAt: result.completedAt,
  });
}

function executionAudit(
  proposal: ActionProposal,
  context: OperationContext,
  stage: string,
  eventType: Parameters<typeof createAuditEvent>[0]["eventType"],
  occurredAt: ExecutionAttemptRecord["attemptedAt"],
) {
  return createAuditEvent({
    auditEventId: createAuditEventId(`audit-${proposal.proposalId}-${stage}`),
    companyId: proposal.companyId,
    correlationId: context.correlationId,
    causationId: context.causationId,
    eventType,
    occurredAt,
  });
}

function assertCommand(command: ExecuteApprovedActionCommand): void {
  if (
    command === null ||
    command === undefined ||
    !isNonBlank(command.companyId) ||
    !isNonBlank(command.proposalId) ||
    !isNonBlank(command.actor?.id) ||
    !isRole(command.actor?.role) ||
    !isNonBlank(command.correlationId) ||
    !isNonBlank(command.causationId)
  ) {
    throw new ExecuteActionError("EXECUTION_INVALID_COMMAND");
  }
}

function operationContext(command: ExecuteApprovedActionCommand): OperationContext {
  return Object.freeze({
    companyId: command.companyId,
    correlationId: command.correlationId,
    causationId: command.causationId,
  });
}

function normalizeNeedsHumanReason(reason: string): NeedsHumanReason {
  return [
    "ORDER_CHANGED",
    "ORDER_UNAVAILABLE",
    "POLICY_CHANGED",
    "PROPOSAL_EXPIRED",
    "EXECUTION_UNCONFIRMED",
  ].some((candidate) => candidate === reason)
    ? (reason as NeedsHumanReason)
    : "EXECUTION_UNCONFIRMED";
}

function isRole(role: ApprovalCommandActor["role"]): boolean {
  return role === "agent" || role === "supervisor" || role === "admin";
}

function isNonBlank(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
