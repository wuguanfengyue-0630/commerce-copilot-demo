import { type IsoTimestamp, toIsoTimestamp } from "../shared/clock.ts";
import type { CompanyId, ConversationId, ProposalId, StoreId, UserId } from "../shared/ids.ts";
import type { Money } from "../shared/money.ts";
import type { ActionProposalStatus } from "./action-status.ts";

export interface AfterSaleRefundPayload {
  kind: "after_sale.refund";
  orderId: string;
  amount: Money;
  reasonCode: "damaged_item";
  observedOrderVersion: string;
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

export type ActionProposal = Readonly<{
  proposalId: ProposalId;
  companyId: CompanyId;
  storeId: StoreId;
  conversationId: ConversationId;
  payload: Readonly<AfterSaleRefundPayload>;
  status: ActionProposalStatus;
  createdAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
  approval?: ActionApproval;
  executionStartedAt?: IsoTimestamp;
  executionResult?: ActionExecutionResult;
}>;

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

export function createActionProposal(input: ActionProposalInput): ActionProposal {
  return Object.freeze({
    proposalId: input.proposalId,
    companyId: input.companyId,
    storeId: input.storeId,
    conversationId: input.conversationId,
    payload: Object.freeze({ ...input.payload }),
    status: "pending_approval",
    createdAt: toIsoTimestamp(input.createdAt),
    expiresAt: toIsoTimestamp(input.expiresAt),
  });
}

export function approveProposal(
  proposal: ActionProposal,
  approver: ApprovalActor,
  approvedAt: Date | string,
): ActionProposal {
  if (proposal.status !== "pending_approval") {
    throw new ActionTransitionError("ACTION_NOT_PENDING_APPROVAL");
  }

  const normalizedApprovedAt = toIsoTimestamp(approvedAt);
  assertNotExpired(proposal, normalizedApprovedAt);

  const approvedBy = Object.freeze({ ...approver });
  const approval = Object.freeze({
    approvedBy,
    approvedAt: normalizedApprovedAt,
  });

  return Object.freeze({
    ...proposal,
    status: "approved",
    approval,
  });
}

export function markExecuting(
  proposal: ActionProposal,
  executionStartedAt: Date | string,
): ActionProposal {
  if (proposal.status !== "approved") {
    throw new ActionTransitionError("ACTION_NOT_APPROVED");
  }

  const normalizedExecutionStartedAt = toIsoTimestamp(executionStartedAt);
  assertNotExpired(proposal, normalizedExecutionStartedAt);

  return Object.freeze({
    ...proposal,
    status: "executing",
    executionStartedAt: normalizedExecutionStartedAt,
  });
}

export function markExecuted(
  proposal: ActionProposal,
  executionResult: ActionExecutionResult,
): ActionProposal {
  if (proposal.status === "executed") {
    return proposal;
  }

  if (proposal.status !== "executing") {
    throw new ActionTransitionError("ACTION_NOT_EXECUTING");
  }

  return Object.freeze({
    ...proposal,
    status: "executed",
    executionResult: Object.freeze({ ...executionResult }),
  });
}

function assertNotExpired(proposal: ActionProposal, evaluatedAt: IsoTimestamp): void {
  if (evaluatedAt >= proposal.expiresAt) {
    throw new ActionTransitionError("ACTION_EXPIRED");
  }
}
