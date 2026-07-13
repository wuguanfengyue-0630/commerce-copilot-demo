import { ACTION_PROPOSAL_STATUSES, AUDIT_EVENT_TYPES } from "@commerce-copilot/domain";
import { z } from "zod";
import {
  capabilityStatusSchema,
  conversationRoleSchema,
  identifierSchema,
  isoDateTimeSchema,
  messageOriginSchema,
  moneySchema,
  nonBlankStringSchema,
  nonNegativeSafeIntegerSchema,
  orderStatusSchema,
  platformCapabilitySchema,
  schemaVersionSchema,
} from "./api.ts";

const positiveIntegerSchema = nonNegativeSafeIntegerSchema.min(1);

export const DEMO_NEEDS_HUMAN_REASONS = [
  "ORDER_CHANGED",
  "ORDER_UNAVAILABLE",
  "POLICY_CHANGED",
  "PROPOSAL_EXPIRED",
  "EXECUTION_UNCONFIRMED",
] as const;

export const demoNeedsHumanReasonSchema = z.enum(DEMO_NEEDS_HUMAN_REASONS);

export const conversationParamsSchema = z.strictObject({ conversationId: identifierSchema });
export const proposalParamsSchema = z.strictObject({ proposalId: identifierSchema });
export const auditQuerySchema = z.strictObject({ conversationId: identifierSchema });
export const emptyCommandBodySchema = z.union([z.undefined(), z.strictObject({})]);
export const approvalDecisionRequestSchema = z.strictObject({
  outcome: z.enum(["approved", "rejected"]),
  proposalVersion: positiveIntegerSchema,
  comment: nonBlankStringSchema.optional(),
});

export const demoActorSchema = z.strictObject({
  userId: identifierSchema,
  role: z.enum(["supervisor", "admin"]),
});
export const demoCitationSchema = z.strictObject({
  releaseId: identifierSchema,
  chunkId: identifierSchema,
  sourceTitle: nonBlankStringSchema,
  excerpt: nonBlankStringSchema,
  version: positiveIntegerSchema,
});
export const demoMessageSchema = z.strictObject({
  messageId: identifierSchema,
  role: conversationRoleSchema,
  origin: messageOriginSchema,
  content: z.string(),
  externalMessageId: identifierSchema.optional(),
  occurredAt: isoDateTimeSchema,
});
export const demoOrderSchema = z.strictObject({
  companyId: identifierSchema,
  storeId: identifierSchema,
  orderId: identifierSchema,
  version: positiveIntegerSchema,
  status: orderStatusSchema,
  total: moneySchema,
  refundable: moneySchema,
  updatedAt: isoDateTimeSchema,
});
export const demoObservedOrderSchema = z.strictObject({
  version: positiveIntegerSchema,
  status: z.enum(["paid", "shipped", "delivered"]),
  refundable: moneySchema,
});
export const demoProposalActionSchema = z.strictObject({
  kind: z.literal("after_sale.refund"),
  orderId: identifierSchema,
  amount: moneySchema,
  reasonCode: z.literal("damaged_item"),
  observedOrder: demoObservedOrderSchema,
});
export const demoSuggestionActionDraftSchema = z.strictObject({
  kind: z.literal("after_sale.refund"),
  orderId: identifierSchema,
  amount: moneySchema,
  reasonCode: z.literal("damaged_item"),
  observedOrderVersion: positiveIntegerSchema,
  observedOrderStatus: z.enum(["paid", "shipped", "delivered"]),
  observedRefundableAmount: moneySchema,
});
export const demoSuggestionSchema = z.strictObject({
  suggestionId: identifierSchema,
  companyId: identifierSchema,
  storeId: identifierSchema,
  conversationId: identifierSchema,
  orderId: identifierSchema,
  correlationId: nonBlankStringSchema,
  causationId: nonBlankStringSchema,
  provider: z.literal("deterministic-demo"),
  disposition: z.enum(["propose_action", "needs_human"]),
  suggestedReply: nonBlankStringSchema,
  citations: z.array(demoCitationSchema),
  actionDraft: demoSuggestionActionDraftSchema.nullable(),
  reason: nonBlankStringSchema.nullable(),
  createdAt: isoDateTimeSchema,
});

const demoProposalApprovalSchema = z.strictObject({
  actor: demoActorSchema,
  approvedAt: isoDateTimeSchema,
});
const demoProposalRejectionSchema = z.strictObject({
  actor: demoActorSchema,
  rejectedAt: isoDateTimeSchema,
});
const demoProposalExecutionSchema = z
  .discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("started"),
      startedAt: isoDateTimeSchema,
      executionId: identifierSchema.nullable(),
      completedAt: isoDateTimeSchema.nullable(),
    }),
    z.strictObject({
      status: z.literal("succeeded"),
      startedAt: isoDateTimeSchema,
      executionId: identifierSchema,
      completedAt: isoDateTimeSchema,
    }),
    z.strictObject({
      status: z.literal("needs_human"),
      startedAt: isoDateTimeSchema.nullable(),
      reason: demoNeedsHumanReasonSchema,
      markedAt: isoDateTimeSchema,
    }),
  ])
  .nullable();

export const demoActionProposalSchema = z.strictObject({
  proposalId: identifierSchema,
  version: positiveIntegerSchema,
  companyId: identifierSchema,
  storeId: identifierSchema,
  conversationId: identifierSchema,
  action: demoProposalActionSchema,
  status: z.enum(ACTION_PROPOSAL_STATUSES),
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  approval: demoProposalApprovalSchema.nullable(),
  rejection: demoProposalRejectionSchema.nullable(),
  execution: demoProposalExecutionSchema,
});

export const demoDecisionSchema = z.strictObject({
  proposalId: identifierSchema,
  proposalVersion: positiveIntegerSchema,
  outcome: z.enum(["approved", "rejected"]),
  actor: demoActorSchema,
  comment: nonBlankStringSchema.nullable(),
  decidedAt: isoDateTimeSchema,
});

const demoCapabilitySchema = z.strictObject({
  capability: platformCapabilitySchema,
  status: capabilityStatusSchema,
  reason: nonBlankStringSchema.optional(),
});
const demoMetricsSchema = z.strictObject({
  openConversations: nonNegativeSafeIntegerSchema,
  waitingForAgent: nonNegativeSafeIntegerSchema,
  assistantSuggestions: nonNegativeSafeIntegerSchema,
  proposalsAwaitingApproval: nonNegativeSafeIntegerSchema,
  refundedAmount: moneySchema,
  measuredAt: isoDateTimeSchema,
});
const demoIntegrationSchema = z.strictObject({
  storeId: identifierSchema,
  platform: z.literal("douyin"),
  displayName: nonBlankStringSchema,
  status: z.enum(["connected", "degraded", "disconnected"]),
  capabilities: z.array(demoCapabilitySchema),
});
const demoActiveRuleSchema = z.strictObject({
  kind: z.literal("after_sale.refund"),
  enabled: z.boolean(),
  requiresApproval: z.literal(true),
  requiredRole: z.literal("supervisor"),
});
const demoIncompleteSetupSchema = z.strictObject({
  status: z.literal("incomplete"),
  acceptedAt: z.null(),
});

const demoCompleteSetupSchema = z.strictObject({
  status: z.literal("complete"),
  acceptedAt: isoDateTimeSchema,
});

export const demoSetupStateSchema = z.discriminatedUnion("status", [
  demoIncompleteSetupSchema,
  demoCompleteSetupSchema,
]);

export const demoBootstrapResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  actor: z.strictObject({
    userId: identifierSchema,
    displayName: nonBlankStringSchema,
    role: z.literal("owner"),
  }),
  setup: demoSetupStateSchema,
  store: z.strictObject({
    companyId: identifierSchema,
    storeId: identifierSchema,
    displayName: nonBlankStringSchema,
    platform: z.literal("douyin"),
  }),
});

export const demoSetupCompleteResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  setup: demoCompleteSetupSchema,
});

export const workspaceResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  workspace: z.strictObject({
    companyId: identifierSchema,
    storeId: identifierSchema,
    metrics: demoMetricsSchema,
    integrations: z.array(demoIntegrationSchema),
    activeRules: z.array(demoActiveRuleSchema),
    messageSendMode: z.enum(["assisted", "direct"]),
    demoModel: z.strictObject({
      provider: z.literal("deterministic-demo"),
      deterministic: z.literal(true),
    }),
    evaluationSummary: z.strictObject({
      scenario: z.literal("damaged_item"),
      status: z.literal("ready"),
      score: z.number().min(0).max(1),
    }),
    setup: demoSetupStateSchema,
  }),
});

export const demoCustomerSchema = z.strictObject({
  customerId: identifierSchema,
  displayName: nonBlankStringSchema,
});
export const demoConversationSummarySchema = z.strictObject({
  companyId: identifierSchema,
  storeId: identifierSchema,
  conversationId: identifierSchema,
  customer: demoCustomerSchema,
  status: z.enum(["open", "waiting_for_agent", "resolved"]),
  lastMessagePreview: z.string(),
  unreadCount: nonNegativeSafeIntegerSchema,
  updatedAt: isoDateTimeSchema,
});
export const conversationListResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  conversations: z.array(demoConversationSummarySchema),
  generatedAt: isoDateTimeSchema,
});
export const conversationDetailSchema = demoConversationSummarySchema.extend({
  messages: z.array(demoMessageSchema),
  order: demoOrderSchema,
  latestSuggestion: demoSuggestionSchema.nullable(),
  citations: z.array(demoCitationSchema),
  proposal: demoActionProposalSchema.nullable(),
});
export const conversationDetailResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  conversation: conversationDetailSchema,
});
export const suggestionResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  suggestion: demoSuggestionSchema,
  proposal: demoActionProposalSchema.nullable(),
});
export const approvalsResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  pending: z.array(demoActionProposalSchema),
  history: z.array(demoDecisionSchema),
});
export const approvalDecisionResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  decision: demoDecisionSchema,
  proposal: demoActionProposalSchema,
});
export const executionResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("succeeded"),
    proposalId: identifierSchema,
    executionId: identifierSchema,
    externalReference: nonBlankStringSchema,
    completedAt: isoDateTimeSchema,
  }),
  z.strictObject({
    status: z.literal("needs_human"),
    proposalId: identifierSchema,
    reason: demoNeedsHumanReasonSchema,
  }),
]);
export const executionResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  result: executionResultSchema,
});
export const knowledgeResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  policies: z.array(
    z.strictObject({
      policyId: identifierSchema,
      title: nonBlankStringSchema,
      status: z.literal("published"),
      scenario: z.literal("damaged_item"),
      content: nonBlankStringSchema,
      refundRule: z.strictObject({ kind: z.literal("after_sale.refund"), enabled: z.boolean() }),
      citations: z.array(demoCitationSchema),
      release: z.strictObject({
        releaseId: identifierSchema,
        version: positiveIntegerSchema,
        publishedAt: isoDateTimeSchema,
        expiresAt: isoDateTimeSchema.nullable(),
        immutable: z.literal(true),
      }),
    }),
  ),
});
export const auditEventsResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  events: z.array(
    z.strictObject({
      auditEventId: identifierSchema,
      companyId: identifierSchema,
      correlationId: nonBlankStringSchema,
      causationId: nonBlankStringSchema,
      eventType: z.enum(AUDIT_EVENT_TYPES),
      occurredAt: isoDateTimeSchema,
    }),
  ),
});

export type ConversationParams = z.infer<typeof conversationParamsSchema>;
export type ProposalParams = z.infer<typeof proposalParamsSchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type ApprovalDecisionRequest = z.infer<typeof approvalDecisionRequestSchema>;
export type DemoDecision = z.infer<typeof demoDecisionSchema>;
export type DemoBootstrapResponse = z.infer<typeof demoBootstrapResponseSchema>;
export type DemoSetupCompleteResponse = z.infer<typeof demoSetupCompleteResponseSchema>;
export type DemoSetupState = z.infer<typeof demoSetupStateSchema>;
export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;
export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>;
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;
export type ConversationDetailResponse = z.infer<typeof conversationDetailResponseSchema>;
export type SuggestionResponse = z.infer<typeof suggestionResponseSchema>;
export type ApprovalsResponse = z.infer<typeof approvalsResponseSchema>;
export type ApprovalDecisionResponse = z.infer<typeof approvalDecisionResponseSchema>;
export type ExecutionResponse = z.infer<typeof executionResponseSchema>;
export type KnowledgeResponse = z.infer<typeof knowledgeResponseSchema>;
export type AuditEventsResponse = z.infer<typeof auditEventsResponseSchema>;
