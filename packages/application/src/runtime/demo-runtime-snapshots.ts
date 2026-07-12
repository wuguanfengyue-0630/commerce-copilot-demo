import {
  ACTION_PROPOSAL_STATUSES,
  type ActionProposal,
  type ApprovalActor,
  type AuditEvent,
  assertIssuedActionProposal,
  createAuditEvent,
  createMoney,
  type IsoTimestamp,
  type KnowledgeCitation,
  type Money,
  toIsoTimestamp,
} from "@commerce-copilot/domain";
import type {
  ApprovalDecisionRecord,
  ExecutionAttemptRecord,
  ExecutionResultRecord,
  OperationContext,
  SuggestionRecord,
} from "../ports/repositories.ts";
import type { PublishedKnowledgeEvidence } from "../ports/suggestion-generator.ts";
import { DemoRuntimeError } from "./demo-runtime-error.ts";

export function snapshotKnowledgeEvidence(
  evidence: PublishedKnowledgeEvidence,
): PublishedKnowledgeEvidence {
  const publishedAt = canonicalTimestamp(evidence.publishedAt);
  const citations = snapshotCitations(evidence.citations);
  const base = {
    companyId: evidence.companyId,
    releaseId: evidence.releaseId,
    title: requireNonBlank(evidence.title),
    status: "published" as const,
    version: requirePositiveInteger(evidence.version),
    scenario: "damaged_item" as const,
    content: requireNonBlank(evidence.content),
    refundRule: Object.freeze({
      kind: "after_sale.refund" as const,
      enabled: evidence.refundRule.enabled === true,
    }),
    publishedAt,
    citations,
  };

  return evidence.expiresAt === undefined
    ? Object.freeze(base)
    : Object.freeze({ ...base, expiresAt: canonicalTimestamp(evidence.expiresAt) });
}

export function snapshotSuggestion(
  context: OperationContext,
  record: SuggestionRecord,
): SuggestionRecord {
  assertContext(context);
  if (
    record.companyId !== context.companyId ||
    record.correlationId !== context.correlationId ||
    record.causationId !== context.causationId ||
    record.provider !== "deterministic-demo" ||
    (record.disposition !== "propose_action" && record.disposition !== "needs_human")
  ) {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }

  const actionDraft = record.actionDraft;
  if (
    (record.disposition === "propose_action" && actionDraft === undefined) ||
    (record.disposition === "needs_human" && actionDraft !== undefined)
  ) {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }

  const base = {
    suggestionId: record.suggestionId,
    companyId: record.companyId,
    storeId: record.storeId,
    conversationId: record.conversationId,
    orderId: record.orderId,
    correlationId: requireNonBlank(record.correlationId),
    causationId: requireNonBlank(record.causationId),
    provider: record.provider,
    disposition: record.disposition,
    suggestedReply: requireNonBlank(record.suggestedReply),
    citations: snapshotCitations(record.citations),
    createdAt: canonicalTimestamp(record.createdAt),
  };
  const withReason =
    record.reason === undefined ? base : { ...base, reason: requireNonBlank(record.reason) };

  if (actionDraft === undefined) {
    return Object.freeze(withReason);
  }
  if (
    actionDraft.kind !== "after_sale.refund" ||
    actionDraft.orderId !== record.orderId ||
    actionDraft.reasonCode !== "damaged_item" ||
    !isObservedStatus(actionDraft.observedOrderStatus)
  ) {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }

  return Object.freeze({
    ...withReason,
    actionDraft: Object.freeze({
      kind: "after_sale.refund",
      orderId: actionDraft.orderId,
      amount: snapshotMoney(actionDraft.amount),
      reasonCode: "damaged_item",
      observedOrderVersion: requirePositiveInteger(actionDraft.observedOrderVersion),
      observedOrderStatus: actionDraft.observedOrderStatus,
      observedRefundableAmount: snapshotMoney(actionDraft.observedRefundableAmount),
    }),
  });
}

export function assertTrustedProposal(context: OperationContext, proposal: ActionProposal): void {
  try {
    assertIssuedActionProposal(proposal);
  } catch {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }
  if (
    proposal.companyId !== context.companyId ||
    !Number.isSafeInteger(proposal.version) ||
    proposal.version < 1 ||
    !Object.isFrozen(proposal) ||
    !Object.isFrozen(proposal.payload) ||
    !ACTION_PROPOSAL_STATUSES.some((status) => status === proposal.status) ||
    canonicalTimestamp(proposal.createdAt) !== proposal.createdAt ||
    canonicalTimestamp(proposal.expiresAt) !== proposal.expiresAt ||
    proposal.createdAt >= proposal.expiresAt ||
    proposal.payload.kind !== "after_sale.refund" ||
    proposal.payload.reasonCode !== "damaged_item" ||
    !isObservedStatus(proposal.payload.observedOrderStatus)
  ) {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }

  snapshotMoney(proposal.payload.amount);
  snapshotMoney(proposal.payload.observedRefundableAmount);
}

export function snapshotApprovalDecision(
  context: OperationContext,
  decision: ApprovalDecisionRecord,
): ApprovalDecisionRecord {
  assertContext(context);
  if (
    decision.companyId !== context.companyId ||
    !Number.isSafeInteger(decision.proposalVersion) ||
    decision.proposalVersion < 1 ||
    decision.correlationId !== context.correlationId ||
    decision.causationId !== context.causationId ||
    (decision.decision !== "approved" && decision.decision !== "rejected")
  ) {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }

  const snapshot = {
    approvalDecisionId: requireNonBlank(decision.approvalDecisionId),
    companyId: decision.companyId,
    proposalId: decision.proposalId,
    proposalVersion: decision.proposalVersion,
    decision: decision.decision,
    actor: snapshotActor(decision.actor),
    correlationId: requireNonBlank(decision.correlationId),
    causationId: requireNonBlank(decision.causationId),
    decidedAt: canonicalTimestamp(decision.decidedAt),
  };
  return decision.comment === undefined
    ? Object.freeze(snapshot)
    : Object.freeze({ ...snapshot, comment: requireNonBlank(decision.comment).trim() });
}

export function snapshotExecutionAttempt(
  context: OperationContext,
  attempt: ExecutionAttemptRecord,
): ExecutionAttemptRecord {
  assertContext(context);
  if (
    attempt.companyId !== context.companyId ||
    attempt.correlationId !== context.correlationId ||
    attempt.causationId !== context.causationId ||
    !["started", "blocked", "failed", "succeeded"].some((status) => status === attempt.status)
  ) {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }

  const base = {
    executionAttemptId: requireNonBlank(attempt.executionAttemptId),
    companyId: attempt.companyId,
    proposalId: attempt.proposalId,
    idempotencyKey: requireNonBlank(attempt.idempotencyKey),
    status: attempt.status,
    correlationId: requireNonBlank(attempt.correlationId),
    causationId: requireNonBlank(attempt.causationId),
    attemptedAt: canonicalTimestamp(attempt.attemptedAt),
  };
  return attempt.reason === undefined
    ? Object.freeze(base)
    : Object.freeze({ ...base, reason: requireNonBlank(attempt.reason) });
}

export function snapshotExecutionResult(
  context: OperationContext,
  result: ExecutionResultRecord,
): ExecutionResultRecord {
  assertContext(context);
  if (
    result.companyId !== context.companyId ||
    result.correlationId !== context.correlationId ||
    result.causationId !== context.causationId ||
    result.status !== "succeeded"
  ) {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }

  return Object.freeze({
    executionId: requireNonBlank(result.executionId),
    companyId: result.companyId,
    proposalId: result.proposalId,
    idempotencyKey: requireNonBlank(result.idempotencyKey),
    status: "succeeded",
    externalReference: requireNonBlank(result.externalReference),
    startedAt: canonicalTimestamp(result.startedAt),
    correlationId: requireNonBlank(result.correlationId),
    causationId: requireNonBlank(result.causationId),
    completedAt: canonicalTimestamp(result.completedAt),
  });
}

export function snapshotAuditEvent(context: OperationContext, event: AuditEvent): AuditEvent {
  assertContext(context);
  if (
    event.companyId !== context.companyId ||
    event.correlationId !== context.correlationId ||
    event.causationId !== context.causationId
  ) {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }

  return createAuditEvent({
    auditEventId: event.auditEventId,
    companyId: event.companyId,
    correlationId: requireNonBlank(event.correlationId),
    causationId: requireNonBlank(event.causationId),
    eventType: event.eventType,
    occurredAt: canonicalTimestamp(event.occurredAt),
  });
}

export function assertContext(context: OperationContext): void {
  if (
    context === null ||
    context === undefined ||
    !isNonBlank(context.companyId) ||
    !isNonBlank(context.correlationId) ||
    !isNonBlank(context.causationId)
  ) {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_CONTEXT");
  }
}

export function canonicalTimestamp(value: IsoTimestamp): IsoTimestamp {
  try {
    const normalized = toIsoTimestamp(value);
    if (normalized !== value) {
      throw new Error("Non-canonical timestamp");
    }
    return normalized;
  } catch {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }
}

export function assertNonBlank(value: string): void {
  if (!isNonBlank(value)) {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }
}

function snapshotCitations(citations: readonly KnowledgeCitation[]): readonly KnowledgeCitation[] {
  if (!Array.isArray(citations)) {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }

  return Object.freeze(
    citations.map((citation) =>
      Object.freeze({
        releaseId: citation.releaseId,
        chunkId: citation.chunkId,
        sourceTitle: requireNonBlank(citation.sourceTitle),
        excerpt: requireNonBlank(citation.excerpt),
        version: requirePositiveInteger(citation.version),
      }),
    ),
  );
}

function snapshotActor(actor: ApprovalActor): ApprovalActor {
  if (
    actor === null ||
    actor === undefined ||
    (actor.role !== "supervisor" && actor.role !== "admin")
  ) {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }
  return Object.freeze({ userId: actor.userId, role: actor.role });
}

function snapshotMoney(money: Money): Money {
  try {
    return createMoney(money.amountMinor, money.currency);
  } catch {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }
}

function requireNonBlank(value: string): string {
  assertNonBlank(value);
  return value;
}

function isNonBlank(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function requirePositiveInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DemoRuntimeError("DEMO_RUNTIME_INVALID_RECORD");
  }
  return value;
}

function isObservedStatus(status: string): status is "paid" | "shipped" | "delivered" {
  return status === "paid" || status === "shipped" || status === "delivered";
}
