import type { ApiResponseOptions } from "@nestjs/swagger";
import { z } from "zod";

const identifier = z.string().trim().min(1);

export class ConversationParamsDto {
  static readonly schema = z.strictObject({ conversationId: identifier });
  readonly conversationId!: string;
}

export class ProposalParamsDto {
  static readonly schema = z.strictObject({ proposalId: identifier });
  readonly proposalId!: string;
}

export class AuditQueryDto {
  static readonly schema = z.strictObject({ conversationId: identifier });
  readonly conversationId!: string;
}

export class ApprovalDecisionDto {
  static readonly schema = z.strictObject({
    outcome: z.enum(["approved", "rejected"]),
    proposalVersion: z.number().int().positive(),
    comment: z.string().trim().min(1).optional(),
  });

  readonly outcome!: "approved" | "rejected";
  readonly proposalVersion!: number;
  readonly comment?: string;
}

export const emptyCommandBodySchema = z.union([z.undefined(), z.strictObject({})]);

type Schema = Readonly<Record<string, unknown>>;
type SwaggerSchema = Extract<ApiResponseOptions, { schema: unknown }>["schema"];

export function asOpenApiSchema(schema: Schema): SwaggerSchema {
  return schema as SwaggerSchema;
}

function objectSchema<const Properties extends Readonly<Record<string, Schema>>>(
  properties: Properties,
  required: readonly (keyof Properties & string)[],
) {
  return {
    type: "object" as const,
    additionalProperties: false,
    required,
    properties,
  };
}

function arraySchema(items: Schema) {
  return { type: "array" as const, items };
}

function nullableSchema(schema: Schema) {
  return { ...schema, nullable: true as const };
}

const idSchema = { type: "string" as const, minLength: 1 };
const stringSchema = { type: "string" as const };
const dateTimeSchema = { type: "string" as const, format: "date-time" };
const positiveIntegerSchema = { type: "integer" as const, minimum: 1 };
const nonNegativeIntegerSchema = { type: "integer" as const, minimum: 0 };
const booleanSchema = { type: "boolean" as const };
const currencySchema = { type: "string" as const, enum: ["CNY"] };
const needsHumanReasonValues = [
  "ORDER_CHANGED",
  "ORDER_UNAVAILABLE",
  "POLICY_CHANGED",
  "PROPOSAL_EXPIRED",
  "EXECUTION_UNCONFIRMED",
];
const needsHumanReasonSchema = {
  type: "string" as const,
  enum: needsHumanReasonValues,
};

const moneySchema = objectSchema(
  { amountMinor: nonNegativeIntegerSchema, currency: currencySchema },
  ["amountMinor", "currency"],
);

const actorSchema = objectSchema(
  {
    userId: idSchema,
    role: { type: "string" as const, enum: ["supervisor", "admin"] },
  },
  ["userId", "role"],
);

const citationSchema = objectSchema(
  {
    releaseId: idSchema,
    chunkId: idSchema,
    sourceTitle: stringSchema,
    excerpt: stringSchema,
    version: positiveIntegerSchema,
  },
  ["releaseId", "chunkId", "sourceTitle", "excerpt", "version"],
);

const messageSchema = objectSchema(
  {
    messageId: idSchema,
    role: { type: "string" as const, enum: ["customer", "agent", "assistant", "system"] },
    origin: { type: "string" as const, enum: ["platform", "human", "ai", "system"] },
    content: stringSchema,
    externalMessageId: idSchema,
    occurredAt: dateTimeSchema,
  },
  ["messageId", "role", "origin", "content", "occurredAt"],
);

const orderSchema = objectSchema(
  {
    companyId: idSchema,
    storeId: idSchema,
    orderId: idSchema,
    version: positiveIntegerSchema,
    status: {
      type: "string" as const,
      enum: ["paid", "shipped", "delivered", "cancelled", "refunded"],
    },
    total: moneySchema,
    refundable: moneySchema,
    updatedAt: dateTimeSchema,
  },
  ["companyId", "storeId", "orderId", "version", "status", "total", "refundable", "updatedAt"],
);

const observedOrderSchema = objectSchema(
  {
    version: positiveIntegerSchema,
    status: { type: "string" as const, enum: ["paid", "shipped", "delivered"] },
    refundable: moneySchema,
  },
  ["version", "status", "refundable"],
);

const proposalActionSchema = objectSchema(
  {
    kind: { type: "string" as const, enum: ["after_sale.refund"] },
    orderId: idSchema,
    amount: moneySchema,
    reasonCode: { type: "string" as const, enum: ["damaged_item"] },
    observedOrder: observedOrderSchema,
  },
  ["kind", "orderId", "amount", "reasonCode", "observedOrder"],
);

const suggestionActionDraftSchema = objectSchema(
  {
    kind: { type: "string" as const, enum: ["after_sale.refund"] },
    orderId: idSchema,
    amount: moneySchema,
    reasonCode: { type: "string" as const, enum: ["damaged_item"] },
    observedOrderVersion: positiveIntegerSchema,
    observedOrderStatus: { type: "string" as const, enum: ["paid", "shipped", "delivered"] },
    observedRefundableAmount: moneySchema,
  },
  [
    "kind",
    "orderId",
    "amount",
    "reasonCode",
    "observedOrderVersion",
    "observedOrderStatus",
    "observedRefundableAmount",
  ],
);

const suggestionSchema = objectSchema(
  {
    suggestionId: idSchema,
    companyId: idSchema,
    storeId: idSchema,
    conversationId: idSchema,
    orderId: idSchema,
    correlationId: idSchema,
    causationId: idSchema,
    provider: { type: "string" as const, enum: ["deterministic-demo"] },
    disposition: { type: "string" as const, enum: ["propose_action", "needs_human"] },
    suggestedReply: stringSchema,
    citations: arraySchema(citationSchema),
    actionDraft: nullableSchema(suggestionActionDraftSchema),
    reason: nullableSchema(stringSchema),
    createdAt: dateTimeSchema,
  },
  [
    "suggestionId",
    "companyId",
    "storeId",
    "conversationId",
    "orderId",
    "correlationId",
    "causationId",
    "provider",
    "disposition",
    "suggestedReply",
    "citations",
    "actionDraft",
    "reason",
    "createdAt",
  ],
);

const proposalApprovalSchema = objectSchema({ actor: actorSchema, approvedAt: dateTimeSchema }, [
  "actor",
  "approvedAt",
]);
const proposalRejectionSchema = objectSchema({ actor: actorSchema, rejectedAt: dateTimeSchema }, [
  "actor",
  "rejectedAt",
]);
const startedExecutionSchema = objectSchema(
  {
    status: { type: "string" as const, enum: ["started"] },
    startedAt: dateTimeSchema,
    executionId: nullableSchema(idSchema),
    completedAt: nullableSchema(dateTimeSchema),
  },
  ["status", "startedAt", "executionId", "completedAt"],
);
const succeededProposalExecutionSchema = objectSchema(
  {
    status: { type: "string" as const, enum: ["succeeded"] },
    startedAt: dateTimeSchema,
    executionId: idSchema,
    completedAt: dateTimeSchema,
  },
  ["status", "startedAt", "executionId", "completedAt"],
);
const needsHumanProposalExecutionSchema = objectSchema(
  {
    status: { type: "string" as const, enum: ["needs_human"] },
    startedAt: nullableSchema(dateTimeSchema),
    reason: needsHumanReasonSchema,
    markedAt: dateTimeSchema,
  },
  ["status", "startedAt", "reason", "markedAt"],
);
const proposalExecutionSchema = {
  type: "object" as const,
  oneOf: [
    startedExecutionSchema,
    succeededProposalExecutionSchema,
    needsHumanProposalExecutionSchema,
  ],
  nullable: true as const,
};

const proposalSchema = objectSchema(
  {
    proposalId: idSchema,
    version: positiveIntegerSchema,
    companyId: idSchema,
    storeId: idSchema,
    conversationId: idSchema,
    action: proposalActionSchema,
    status: {
      type: "string" as const,
      enum: [
        "pending_approval",
        "approved",
        "rejected",
        "expired",
        "executing",
        "executed",
        "failed",
        "needs_human",
      ],
    },
    createdAt: dateTimeSchema,
    expiresAt: dateTimeSchema,
    approval: nullableSchema(proposalApprovalSchema),
    rejection: nullableSchema(proposalRejectionSchema),
    execution: proposalExecutionSchema,
  },
  [
    "proposalId",
    "version",
    "companyId",
    "storeId",
    "conversationId",
    "action",
    "status",
    "createdAt",
    "expiresAt",
    "approval",
    "rejection",
    "execution",
  ],
);

const decisionSchema = objectSchema(
  {
    proposalId: idSchema,
    proposalVersion: positiveIntegerSchema,
    outcome: { type: "string" as const, enum: ["approved", "rejected"] },
    actor: actorSchema,
    comment: nullableSchema(stringSchema),
    decidedAt: dateTimeSchema,
  },
  ["proposalId", "proposalVersion", "outcome", "actor", "comment", "decidedAt"],
);

const capabilitySchema = objectSchema(
  {
    capability: {
      type: "string" as const,
      enum: [
        "store.authorize",
        "store.token.refresh",
        "catalog.product.read",
        "order.read",
        "logistics.read",
        "afterSale.read",
        "afterSale.write",
        "message.receive",
        "message.send",
        "event.subscribe",
        "event.verify",
      ],
    },
    status: {
      type: "string" as const,
      enum: ["available", "unavailable", "waiting_qualification", "degraded"],
    },
    reason: stringSchema,
  },
  ["capability", "status"],
);

const metricsSchema = objectSchema(
  {
    openConversations: nonNegativeIntegerSchema,
    waitingForAgent: nonNegativeIntegerSchema,
    assistantSuggestions: nonNegativeIntegerSchema,
    proposalsAwaitingApproval: nonNegativeIntegerSchema,
    refundedAmount: moneySchema,
    measuredAt: dateTimeSchema,
  },
  [
    "openConversations",
    "waitingForAgent",
    "assistantSuggestions",
    "proposalsAwaitingApproval",
    "refundedAmount",
    "measuredAt",
  ],
);
const integrationSchema = objectSchema(
  {
    storeId: idSchema,
    platform: { type: "string" as const, enum: ["douyin"] },
    displayName: stringSchema,
    status: { type: "string" as const, enum: ["connected", "degraded", "disconnected"] },
    capabilities: arraySchema(capabilitySchema),
  },
  ["storeId", "platform", "displayName", "status", "capabilities"],
);
const activeRuleSchema = objectSchema(
  {
    kind: { type: "string" as const, enum: ["after_sale.refund"] },
    enabled: booleanSchema,
    requiresApproval: { type: "boolean" as const, enum: [true] },
    requiredRole: { type: "string" as const, enum: ["supervisor"] },
  },
  ["kind", "enabled", "requiresApproval", "requiredRole"],
);
const demoModelSchema = objectSchema(
  {
    provider: { type: "string" as const, enum: ["deterministic-demo"] },
    deterministic: { type: "boolean" as const, enum: [true] },
  },
  ["provider", "deterministic"],
);
const evaluationSummarySchema = objectSchema(
  {
    scenario: { type: "string" as const, enum: ["damaged_item"] },
    status: { type: "string" as const, enum: ["ready"] },
    score: { type: "number" as const, minimum: 0, maximum: 1 },
  },
  ["scenario", "status", "score"],
);
const setupSchema = objectSchema(
  {
    status: { type: "string" as const, enum: ["incomplete", "complete"] },
    acceptedAt: nullableSchema(dateTimeSchema),
  },
  ["status", "acceptedAt"],
);
const workspaceSchema = objectSchema(
  {
    companyId: idSchema,
    storeId: idSchema,
    metrics: metricsSchema,
    integrations: arraySchema(integrationSchema),
    activeRules: arraySchema(activeRuleSchema),
    messageSendMode: { type: "string" as const, enum: ["assisted", "direct"] },
    demoModel: demoModelSchema,
    evaluationSummary: evaluationSummarySchema,
    setup: setupSchema,
  },
  [
    "companyId",
    "storeId",
    "metrics",
    "integrations",
    "activeRules",
    "messageSendMode",
    "demoModel",
    "evaluationSummary",
    "setup",
  ],
);

const customerSchema = objectSchema({ customerId: idSchema, displayName: stringSchema }, [
  "customerId",
  "displayName",
]);
const conversationSummaryProperties = {
  companyId: idSchema,
  storeId: idSchema,
  conversationId: idSchema,
  customer: customerSchema,
  status: { type: "string" as const, enum: ["open", "waiting_for_agent", "resolved"] },
  lastMessagePreview: stringSchema,
  unreadCount: nonNegativeIntegerSchema,
  updatedAt: dateTimeSchema,
};
const conversationSummarySchema = objectSchema(conversationSummaryProperties, [
  "companyId",
  "storeId",
  "conversationId",
  "customer",
  "status",
  "lastMessagePreview",
  "unreadCount",
  "updatedAt",
]);
const conversationDetailSchema = objectSchema(
  {
    ...conversationSummaryProperties,
    messages: arraySchema(messageSchema),
    order: orderSchema,
    latestSuggestion: nullableSchema(suggestionSchema),
    citations: arraySchema(citationSchema),
    proposal: nullableSchema(proposalSchema),
  },
  [
    "companyId",
    "storeId",
    "conversationId",
    "customer",
    "status",
    "lastMessagePreview",
    "unreadCount",
    "updatedAt",
    "messages",
    "order",
    "latestSuggestion",
    "citations",
    "proposal",
  ],
);

const auditEventSchema = objectSchema(
  {
    auditEventId: idSchema,
    companyId: idSchema,
    correlationId: idSchema,
    causationId: idSchema,
    eventType: {
      type: "string" as const,
      enum: [
        "conversation.message_ingested",
        "knowledge.retrieved",
        "agent.suggestion_generated",
        "action.proposed",
        "approval.approved",
        "approval.rejected",
        "action.execution_started",
        "action.execution_succeeded",
        "action.execution_blocked",
      ],
    },
    occurredAt: dateTimeSchema,
  },
  ["auditEventId", "companyId", "correlationId", "causationId", "eventType", "occurredAt"],
);

const refundRuleSchema = objectSchema(
  { kind: { type: "string" as const, enum: ["after_sale.refund"] }, enabled: booleanSchema },
  ["kind", "enabled"],
);
const knowledgeReleaseSchema = objectSchema(
  {
    releaseId: idSchema,
    version: positiveIntegerSchema,
    publishedAt: dateTimeSchema,
    expiresAt: nullableSchema(dateTimeSchema),
    immutable: { type: "boolean" as const, enum: [true] },
  },
  ["releaseId", "version", "publishedAt", "expiresAt", "immutable"],
);
const knowledgePolicySchema = objectSchema(
  {
    policyId: idSchema,
    title: stringSchema,
    status: { type: "string" as const, enum: ["published"] },
    scenario: { type: "string" as const, enum: ["damaged_item"] },
    content: stringSchema,
    refundRule: refundRuleSchema,
    citations: arraySchema(citationSchema),
    release: knowledgeReleaseSchema,
  },
  ["policyId", "title", "status", "scenario", "content", "refundRule", "citations", "release"],
);

const schemaVersionProperty = { type: "integer" as const, enum: [1] };
function versionedSchema<const Properties extends Readonly<Record<string, Schema>>>(
  properties: Properties,
  required: readonly (keyof Properties & string)[],
) {
  return objectSchema({ schemaVersion: schemaVersionProperty, ...properties }, [
    "schemaVersion",
    ...required,
  ]);
}

export const approvalDecisionOpenApiSchema = objectSchema(
  {
    outcome: { type: "string" as const, enum: ["approved", "rejected"] },
    proposalVersion: positiveIntegerSchema,
    comment: { type: "string" as const, minLength: 1 },
  },
  ["outcome", "proposalVersion"],
);

export const workspaceResponseOpenApiSchema = versionedSchema({ workspace: workspaceSchema }, [
  "workspace",
]);
export const conversationsResponseOpenApiSchema = versionedSchema(
  { conversations: arraySchema(conversationSummarySchema), generatedAt: dateTimeSchema },
  ["conversations", "generatedAt"],
);
export const conversationDetailResponseOpenApiSchema = versionedSchema(
  { conversation: conversationDetailSchema },
  ["conversation"],
);
export const suggestionResponseOpenApiSchema = versionedSchema(
  { suggestion: suggestionSchema, proposal: nullableSchema(proposalSchema) },
  ["suggestion", "proposal"],
);
export const approvalsResponseOpenApiSchema = versionedSchema(
  { pending: arraySchema(proposalSchema), history: arraySchema(decisionSchema) },
  ["pending", "history"],
);
export const decisionResponseOpenApiSchema = versionedSchema(
  { decision: decisionSchema, proposal: proposalSchema },
  ["decision", "proposal"],
);
const succeededExecutionResultSchema = objectSchema(
  {
    status: { type: "string" as const, enum: ["succeeded"] },
    proposalId: idSchema,
    executionId: idSchema,
    externalReference: stringSchema,
    completedAt: dateTimeSchema,
  },
  ["status", "proposalId", "executionId", "externalReference", "completedAt"],
);
const needsHumanExecutionResultSchema = objectSchema(
  {
    status: { type: "string" as const, enum: ["needs_human"] },
    proposalId: idSchema,
    reason: needsHumanReasonSchema,
  },
  ["status", "proposalId", "reason"],
);
export const executionResponseOpenApiSchema = versionedSchema(
  { result: { oneOf: [succeededExecutionResultSchema, needsHumanExecutionResultSchema] } },
  ["result"],
);
export const knowledgeResponseOpenApiSchema = versionedSchema(
  { policies: arraySchema(knowledgePolicySchema) },
  ["policies"],
);
export const auditResponseOpenApiSchema = versionedSchema(
  { events: arraySchema(auditEventSchema) },
  ["events"],
);
