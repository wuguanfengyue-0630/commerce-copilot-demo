import type { OrderSnapshot } from "../orders/order-snapshot.ts";
import { type IsoTimestamp, toIsoTimestamp } from "../shared/clock.ts";
import type { CompanyId, ConversationId, ProposalId, StoreId, UserId } from "../shared/ids.ts";
import { createMoney, type Money } from "../shared/money.ts";
import { ACTION_PROPOSAL_STATUSES, type ActionProposalStatus } from "./action-status.ts";

declare const actionProposalStateBrand: unique symbol;

const issuedProposalStates = new WeakMap<object, ActionProposalStatus>();

export interface AfterSaleRefundPayload {
  kind: "after_sale.refund";
  orderId: string;
  amount: Money;
  reasonCode: "damaged_item";
  observedOrderVersion: OrderSnapshot["version"];
  observedOrderStatus: "paid" | "shipped" | "delivered";
  observedRefundableAmount: Money;
}

export type ApprovalActor = Readonly<{
  userId: UserId;
  role: "supervisor" | "admin";
}>;

export type ActionApproval = Readonly<{
  approvedBy: ApprovalActor;
  approvedAt: IsoTimestamp;
}>;

export type ActionExecutionResult = Readonly<{
  executionId: string;
  executedAt: IsoTimestamp;
}>;

type ActionProposalBase = Readonly<{
  version: number;
  proposalId: ProposalId;
  companyId: CompanyId;
  storeId: StoreId;
  conversationId: ConversationId;
  payload: Readonly<AfterSaleRefundPayload>;
  createdAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
}>;

type ProposalStateSeal<Status extends ActionProposalStatus> = Readonly<{
  [actionProposalStateBrand]: Status;
}>;

export type PendingActionProposal = Readonly<
  ActionProposalBase &
    ProposalStateSeal<"pending_approval"> & {
      status: "pending_approval";
    }
>;

export type ApprovedActionProposal = Readonly<
  ActionProposalBase &
    ProposalStateSeal<"approved"> & {
      status: "approved";
      approval: ActionApproval;
    }
>;

export type ExecutingActionProposal = Readonly<
  ActionProposalBase &
    ProposalStateSeal<"executing"> & {
      status: "executing";
      approval: ActionApproval;
      executionStartedAt: IsoTimestamp;
    }
>;

export type ExecutedActionProposal = Readonly<
  ActionProposalBase &
    ProposalStateSeal<"executed"> & {
      status: "executed";
      approval: ActionApproval;
      executionStartedAt: IsoTimestamp;
      executionResult: ActionExecutionResult;
    }
>;

export type RejectedActionProposal = Readonly<
  ActionProposalBase &
    ProposalStateSeal<"rejected"> & {
      status: "rejected";
      rejection: Readonly<{
        rejectedBy: ApprovalActor;
        rejectedAt: IsoTimestamp;
      }>;
    }
>;

export type NeedsHumanActionProposal = Readonly<
  ActionProposalBase &
    ProposalStateSeal<"needs_human"> & {
      status: "needs_human";
      approval: ActionApproval;
      executionStartedAt?: IsoTimestamp;
      needsHuman: Readonly<{
        reason: string;
        markedAt: IsoTimestamp;
      }>;
    }
>;

type ClosedActionProposalStatus = Exclude<
  ActionProposalStatus,
  "pending_approval" | "approved" | "rejected" | "executing" | "executed" | "needs_human"
>;

export type ClosedActionProposal = {
  [Status in ClosedActionProposalStatus]: Readonly<
    ActionProposalBase &
      ProposalStateSeal<Status> & {
        status: Status;
      }
  >;
}[ClosedActionProposalStatus];

export type ActionProposal =
  | PendingActionProposal
  | ApprovedActionProposal
  | ExecutingActionProposal
  | ExecutedActionProposal
  | RejectedActionProposal
  | NeedsHumanActionProposal
  | ClosedActionProposal;

export type ActionProposalInput = Readonly<{
  proposalId: ProposalId;
  companyId: CompanyId;
  storeId: StoreId;
  conversationId: ConversationId;
  payload: AfterSaleRefundPayload;
  createdAt: Date | string;
  expiresAt: Date | string;
}>;

export const ACTION_TRANSITION_ERROR_CODES = [
  "ACTION_EXPIRED",
  "ACTION_INVALID_PROPOSAL",
  "ACTION_NOT_APPROVED",
  "ACTION_NOT_EXECUTING",
  "ACTION_NOT_PENDING_APPROVAL",
] as const;

export type ActionTransitionErrorCode = (typeof ACTION_TRANSITION_ERROR_CODES)[number];

export class ActionTransitionError extends Error {
  readonly code: ActionTransitionErrorCode;

  constructor(code: ActionTransitionErrorCode) {
    super(code);
    this.name = "ActionTransitionError";
    this.code = code;
  }
}

export function createActionProposal(input: ActionProposalInput): PendingActionProposal {
  const createdAt = normalizeTimestamp(input.createdAt);
  const expiresAt = normalizeTimestamp(input.expiresAt);
  if (createdAt >= expiresAt) {
    throw new ActionTransitionError("ACTION_INVALID_PROPOSAL");
  }

  const amount = snapshotMoney(input.payload.amount);
  const observedRefundableAmount = snapshotMoney(input.payload.observedRefundableAmount);
  const payload = Object.freeze({
    kind: input.payload.kind,
    orderId: input.payload.orderId,
    amount,
    reasonCode: input.payload.reasonCode,
    observedOrderVersion: input.payload.observedOrderVersion,
    observedOrderStatus: input.payload.observedOrderStatus,
    observedRefundableAmount,
  });

  return sealProposal(
    {
      proposalId: input.proposalId,
      companyId: input.companyId,
      storeId: input.storeId,
      conversationId: input.conversationId,
      payload,
      version: 1,
      status: "pending_approval",
      createdAt,
      expiresAt,
    },
    "pending_approval",
  );
}

function snapshotMoney(money: Money): Money {
  try {
    return createMoney(money.amountMinor, money.currency);
  } catch {
    throw new ActionTransitionError("ACTION_INVALID_PROPOSAL");
  }
}

export function approveProposal(
  proposal: ActionProposal,
  approver: ApprovalActor,
  approvedAt: Date | string,
): ApprovedActionProposal {
  assertIssuedActionProposal(proposal);

  if (proposal.status !== "pending_approval") {
    throw new ActionTransitionError("ACTION_NOT_PENDING_APPROVAL");
  }

  assertValidApprover(approver);
  const normalizedApprovedAt = normalizeTimestamp(approvedAt);
  if (normalizedApprovedAt < proposal.createdAt) {
    throw new ActionTransitionError("ACTION_INVALID_PROPOSAL");
  }
  assertNotExpired(proposal, normalizedApprovedAt);

  const approvedBy = Object.freeze({
    userId: approver.userId,
    role: approver.role,
  });
  const approval = Object.freeze({
    approvedBy,
    approvedAt: normalizedApprovedAt,
  });

  return sealProposal(
    {
      ...proposalBase(proposal),
      version: proposal.version + 1,
      status: "approved",
      approval,
    },
    "approved",
  );
}

export function rejectProposal(
  proposal: ActionProposal,
  reviewer: ApprovalActor,
  rejectedAt: Date | string,
): RejectedActionProposal {
  assertIssuedActionProposal(proposal);
  if (proposal.status !== "pending_approval") {
    throw new ActionTransitionError("ACTION_NOT_PENDING_APPROVAL");
  }
  assertValidApprover(reviewer);
  const normalizedRejectedAt = normalizeTimestamp(rejectedAt);
  if (normalizedRejectedAt < proposal.createdAt) {
    throw new ActionTransitionError("ACTION_INVALID_PROPOSAL");
  }
  assertNotExpired(proposal, normalizedRejectedAt);
  const rejectedBy = Object.freeze({ userId: reviewer.userId, role: reviewer.role });
  const rejection = Object.freeze({ rejectedBy, rejectedAt: normalizedRejectedAt });
  return sealProposal(
    {
      ...proposalBase(proposal),
      version: proposal.version + 1,
      status: "rejected",
      rejection,
    },
    "rejected",
  );
}

export function markExecuting(
  proposal: ActionProposal,
  executionStartedAt: Date | string,
): ExecutingActionProposal {
  assertIssuedActionProposal(proposal);

  if (proposal.status !== "approved") {
    throw new ActionTransitionError("ACTION_NOT_APPROVED");
  }

  assertValidApproval(proposal);
  const normalizedExecutionStartedAt = normalizeTimestamp(executionStartedAt);
  if (
    normalizedExecutionStartedAt < proposal.createdAt ||
    normalizedExecutionStartedAt < proposal.approval.approvedAt
  ) {
    throw new ActionTransitionError("ACTION_INVALID_PROPOSAL");
  }
  assertNotExpired(proposal, normalizedExecutionStartedAt);

  return sealProposal(
    {
      ...proposalBase(proposal),
      version: proposal.version + 1,
      status: "executing",
      approval: proposal.approval,
      executionStartedAt: normalizedExecutionStartedAt,
    },
    "executing",
  );
}

export function markExecuted(
  proposal: ActionProposal,
  executionResult: ActionExecutionResult,
): ExecutedActionProposal {
  assertIssuedActionProposal(proposal);

  if (proposal.status === "executed") {
    return proposal;
  }

  if (proposal.status !== "executing") {
    throw new ActionTransitionError("ACTION_NOT_EXECUTING");
  }

  assertValidExecutionResult(executionResult, proposal.executionStartedAt);
  const frozenExecutionResult = Object.freeze({
    executionId: executionResult.executionId,
    executedAt: executionResult.executedAt,
  });

  return sealProposal(
    {
      ...proposalBase(proposal),
      version: proposal.version + 1,
      status: "executed",
      approval: proposal.approval,
      executionStartedAt: proposal.executionStartedAt,
      executionResult: frozenExecutionResult,
    },
    "executed",
  );
}

export function markNeedsHuman(
  proposal: ActionProposal,
  reason: string,
  markedAt: Date | string,
): NeedsHumanActionProposal {
  assertIssuedActionProposal(proposal);
  if (proposal.status !== "approved" && proposal.status !== "executing") {
    throw new ActionTransitionError(
      proposal.status === "pending_approval" ? "ACTION_NOT_APPROVED" : "ACTION_NOT_EXECUTING",
    );
  }
  const normalizedMarkedAt = normalizeTimestamp(markedAt);
  const earliest =
    proposal.status === "executing" ? proposal.executionStartedAt : proposal.approval.approvedAt;
  if (typeof reason !== "string" || reason.trim().length === 0 || normalizedMarkedAt < earliest) {
    throw new ActionTransitionError("ACTION_INVALID_PROPOSAL");
  }
  const snapshot = {
    ...proposalBase(proposal),
    version: proposal.version + 1,
    status: "needs_human" as const,
    approval: proposal.approval,
    needsHuman: Object.freeze({ reason: reason.trim(), markedAt: normalizedMarkedAt }),
  };
  return proposal.status === "executing"
    ? sealProposal({ ...snapshot, executionStartedAt: proposal.executionStartedAt }, "needs_human")
    : sealProposal(snapshot, "needs_human");
}

function proposalBase(proposal: ActionProposal): ActionProposalBase {
  return {
    version: proposal.version,
    proposalId: proposal.proposalId,
    companyId: proposal.companyId,
    storeId: proposal.storeId,
    conversationId: proposal.conversationId,
    payload: proposal.payload,
    createdAt: proposal.createdAt,
    expiresAt: proposal.expiresAt,
  };
}

function sealProposal<Status extends ActionProposalStatus, Snapshot extends { status: Status }>(
  snapshot: Snapshot,
  status: Status,
): Readonly<Snapshot & ProposalStateSeal<Status>> {
  const sealedSnapshot = Object.freeze(snapshot);
  issuedProposalStates.set(sealedSnapshot, status);

  return sealedSnapshot as Readonly<Snapshot & ProposalStateSeal<Status>>;
}

export function assertIssuedActionProposal(proposal: ActionProposal): void {
  const hasCanonicalStatus = ACTION_PROPOSAL_STATUSES.some((status) => status === proposal.status);
  const issuedStatus = issuedProposalStates.get(proposal);

  if (
    !Object.isFrozen(proposal) ||
    !Number.isSafeInteger(proposal.version) ||
    proposal.version < 1 ||
    !hasCanonicalStatus ||
    issuedStatus === undefined ||
    issuedStatus !== proposal.status
  ) {
    throw new ActionTransitionError("ACTION_INVALID_PROPOSAL");
  }
}

function assertValidApprover(approver: ApprovalActor): void {
  if (
    approver === null ||
    approver === undefined ||
    (approver.role !== "supervisor" && approver.role !== "admin") ||
    typeof approver.userId !== "string" ||
    approver.userId.trim().length === 0
  ) {
    throw new ActionTransitionError("ACTION_INVALID_PROPOSAL");
  }
}

function assertValidApproval(proposal: ApprovedActionProposal): void {
  const approval = proposal.approval;
  const approvedBy = approval?.approvedBy;

  if (
    approval === undefined ||
    approvedBy === undefined ||
    !Object.isFrozen(approval) ||
    !Object.isFrozen(approvedBy) ||
    (approvedBy.role !== "supervisor" && approvedBy.role !== "admin") ||
    typeof approvedBy.userId !== "string" ||
    approvedBy.userId.trim().length === 0 ||
    typeof approval.approvedAt !== "string" ||
    !isCanonicalTimestamp(approval.approvedAt) ||
    approval.approvedAt < proposal.createdAt ||
    approval.approvedAt >= proposal.expiresAt
  ) {
    throw new ActionTransitionError("ACTION_INVALID_PROPOSAL");
  }
}

function isCanonicalTimestamp(value: string): boolean {
  try {
    return toIsoTimestamp(value) === value;
  } catch {
    return false;
  }
}

function normalizeTimestamp(value: Date | string): IsoTimestamp {
  try {
    return toIsoTimestamp(value);
  } catch {
    throw new ActionTransitionError("ACTION_INVALID_PROPOSAL");
  }
}

function assertValidExecutionResult(
  executionResult: ActionExecutionResult,
  executionStartedAt: IsoTimestamp,
): void {
  if (
    executionResult === null ||
    executionResult === undefined ||
    typeof executionResult.executionId !== "string" ||
    executionResult.executionId.trim().length === 0 ||
    typeof executionResult.executedAt !== "string" ||
    !isCanonicalTimestamp(executionResult.executedAt) ||
    executionResult.executedAt < executionStartedAt
  ) {
    throw new ActionTransitionError("ACTION_INVALID_PROPOSAL");
  }
}

function assertNotExpired(proposal: ActionProposal, evaluatedAt: IsoTimestamp): void {
  if (evaluatedAt >= proposal.expiresAt) {
    throw new ActionTransitionError("ACTION_EXPIRED");
  }
}
