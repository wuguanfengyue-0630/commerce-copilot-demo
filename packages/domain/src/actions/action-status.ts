export const ACTION_PROPOSAL_STATUSES = [
  "pending_approval",
  "approved",
  "rejected",
  "expired",
  "executing",
  "executed",
  "failed",
  "needs_human",
] as const;

export type ActionProposalStatus = (typeof ACTION_PROPOSAL_STATUSES)[number];
