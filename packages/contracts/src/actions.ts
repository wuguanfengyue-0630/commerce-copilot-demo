import { ACTION_PROPOSAL_STATUSES } from "@commerce-copilot/domain";
import { z } from "zod";

import {
  identifierSchema,
  isoDateTimeSchema,
  moneySchema,
  nonBlankStringSchema,
  nonNegativeSafeIntegerSchema,
  orderStatusSchema,
  schemaVersionSchema,
} from "./api.ts";

export const observedOrderFactsSchema = z.strictObject({
  version: nonNegativeSafeIntegerSchema,
  status: orderStatusSchema,
  total: moneySchema,
  refundable: moneySchema,
  updatedAt: isoDateTimeSchema,
});

export const refundActionPayloadSchema = z.strictObject({
  kind: z.literal("after_sale.refund"),
  orderId: identifierSchema,
  amount: moneySchema,
  reasonCode: z.literal("damaged_item"),
  observedOrder: observedOrderFactsSchema,
});

export const actionProposalStatusSchema = z.enum(ACTION_PROPOSAL_STATUSES);

export const actionProposalSchema = z.strictObject({
  proposalId: identifierSchema,
  companyId: identifierSchema,
  storeId: identifierSchema,
  conversationId: identifierSchema,
  action: refundActionPayloadSchema,
  status: actionProposalStatusSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
});

export const actionProposalResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  proposal: actionProposalSchema,
});

export const actionStatusResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  proposalId: identifierSchema,
  status: actionProposalStatusSchema,
  updatedAt: isoDateTimeSchema,
});

export const approvalDecisionSchema = z.strictObject({
  proposalId: identifierSchema,
  decision: z.enum(["approved", "rejected"]),
  decidedBy: identifierSchema,
  reason: nonBlankStringSchema.optional(),
  decidedAt: isoDateTimeSchema,
});

export const approvalDecisionResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  decision: approvalDecisionSchema,
});

export const actionExecutionResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("succeeded"),
    proposalId: identifierSchema,
    executionId: identifierSchema,
    externalReference: nonBlankStringSchema,
    completedAt: isoDateTimeSchema,
  }),
  z.strictObject({
    status: z.literal("blocked"),
    proposalId: identifierSchema,
    executionId: identifierSchema,
    reasonCode: z.enum([
      "capability_unavailable",
      "order_changed",
      "policy_violation",
      "integration_error",
    ]),
    message: nonBlankStringSchema,
    completedAt: isoDateTimeSchema,
  }),
]);

export const actionExecutionResultResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  result: actionExecutionResultSchema,
});

export type ObservedOrderFacts = z.infer<typeof observedOrderFactsSchema>;
export type RefundActionPayload = z.infer<typeof refundActionPayloadSchema>;
export type ActionProposalStatus = z.infer<typeof actionProposalStatusSchema>;
export type ActionProposal = z.infer<typeof actionProposalSchema>;
export type ActionProposalResponse = z.infer<typeof actionProposalResponseSchema>;
export type ActionStatusResponse = z.infer<typeof actionStatusResponseSchema>;
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
export type ApprovalDecisionResponse = z.infer<typeof approvalDecisionResponseSchema>;
export type ActionExecutionResult = z.infer<typeof actionExecutionResultSchema>;
export type ActionExecutionResultResponse = z.infer<typeof actionExecutionResultResponseSchema>;
