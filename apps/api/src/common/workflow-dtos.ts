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

export const approvalDecisionOpenApiSchema = {
  type: "object" as const,
  additionalProperties: false,
  required: ["outcome", "proposalVersion"],
  properties: {
    outcome: { type: "string" as const, enum: ["approved", "rejected"] },
    proposalVersion: { type: "integer" as const, minimum: 1 },
    comment: { type: "string" as const, minLength: 1 },
  },
};

export const versionedResponseSchema = {
  type: "object" as const,
  required: ["schemaVersion"],
  properties: { schemaVersion: { type: "integer" as const, enum: [1] } },
};

const idProperty = { type: "string" as const, minLength: 1 };
const moneyProperty = {
  type: "object" as const,
  required: ["amountMinor", "currency"],
  properties: {
    amountMinor: { type: "integer" as const, minimum: 0 },
    currency: { type: "string" as const, enum: ["CNY"] },
  },
};
const proposalProperty = {
  type: "object" as const,
  required: ["proposalId", "version", "status", "action"],
  properties: {
    proposalId: idProperty,
    version: { type: "integer" as const, minimum: 1 },
    status: { type: "string" as const },
    action: {
      type: "object" as const,
      required: ["kind", "orderId", "amount", "observedOrder"],
      properties: {
        kind: { type: "string" as const, enum: ["after_sale.refund"] },
        orderId: idProperty,
        amount: moneyProperty,
        observedOrder: {
          type: "object" as const,
          properties: {
            version: { type: "integer" as const, minimum: 1 },
            status: { type: "string" as const, enum: ["delivered"] },
            refundable: moneyProperty,
          },
        },
      },
    },
  },
};

export const workspaceResponseOpenApiSchema = {
  ...versionedResponseSchema,
  required: ["schemaVersion", "workspace"],
  properties: {
    ...versionedResponseSchema.properties,
    workspace: {
      type: "object" as const,
      required: [
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
      properties: {
        companyId: idProperty,
        storeId: idProperty,
        metrics: { type: "object" as const },
        integrations: { type: "array" as const, items: { type: "object" as const } },
        activeRules: { type: "array" as const, items: { type: "object" as const } },
        messageSendMode: { type: "string" as const, enum: ["assisted", "direct"] },
        demoModel: {
          type: "object" as const,
          properties: { provider: { type: "string" as const } },
        },
        evaluationSummary: { type: "object" as const },
        setup: { type: "object" as const },
      },
    },
  },
};

const conversationSummaryProperty = {
  type: "object" as const,
  required: ["companyId", "storeId", "conversationId", "customer", "status", "updatedAt"],
  properties: {
    companyId: idProperty,
    storeId: idProperty,
    conversationId: idProperty,
    customer: {
      type: "object" as const,
      properties: { customerId: idProperty, displayName: { type: "string" as const } },
    },
    status: { type: "string" as const },
    updatedAt: { type: "string" as const, format: "date-time" },
  },
};

export const conversationsResponseOpenApiSchema = {
  ...versionedResponseSchema,
  required: ["schemaVersion", "conversations", "generatedAt"],
  properties: {
    ...versionedResponseSchema.properties,
    conversations: { type: "array" as const, items: conversationSummaryProperty },
    generatedAt: { type: "string" as const, format: "date-time" },
  },
};

export const conversationDetailResponseOpenApiSchema = {
  ...versionedResponseSchema,
  required: ["schemaVersion", "conversation"],
  properties: {
    ...versionedResponseSchema.properties,
    conversation: {
      ...conversationSummaryProperty,
      properties: {
        ...conversationSummaryProperty.properties,
        messages: { type: "array" as const, items: { type: "object" as const } },
        order: { type: "object" as const },
        latestSuggestion: { oneOf: [{ type: "object" as const }, { type: "null" as const }] },
        citations: { type: "array" as const, items: { type: "object" as const } },
        proposal: { oneOf: [proposalProperty, { type: "null" as const }] },
      },
    },
  },
};

export const suggestionResponseOpenApiSchema = {
  ...versionedResponseSchema,
  required: ["schemaVersion", "suggestion", "proposal"],
  properties: {
    ...versionedResponseSchema.properties,
    suggestion: {
      type: "object" as const,
      required: [
        "suggestionId",
        "conversationId",
        "provider",
        "disposition",
        "suggestedReply",
        "citations",
      ],
      properties: {
        suggestionId: idProperty,
        conversationId: idProperty,
        provider: { type: "string" as const, enum: ["deterministic-demo"] },
        disposition: { type: "string" as const, enum: ["propose_action", "needs_human"] },
        suggestedReply: { type: "string" as const },
        citations: { type: "array" as const, items: { type: "object" as const } },
      },
    },
    proposal: { oneOf: [proposalProperty, { type: "null" as const }] },
  },
};

export const approvalsResponseOpenApiSchema = {
  ...versionedResponseSchema,
  required: ["schemaVersion", "pending", "history"],
  properties: {
    ...versionedResponseSchema.properties,
    pending: { type: "array" as const, items: proposalProperty },
    history: { type: "array" as const, items: { type: "object" as const } },
  },
};

export const decisionResponseOpenApiSchema = {
  ...versionedResponseSchema,
  required: ["schemaVersion", "decision", "proposal"],
  properties: {
    ...versionedResponseSchema.properties,
    decision: {
      type: "object" as const,
      properties: { outcome: { type: "string" as const, enum: ["approved", "rejected"] } },
    },
    proposal: proposalProperty,
  },
};

export const executionResponseOpenApiSchema = {
  ...versionedResponseSchema,
  required: ["schemaVersion", "result"],
  properties: {
    ...versionedResponseSchema.properties,
    result: {
      type: "object" as const,
      required: ["status", "proposalId"],
      properties: {
        status: { type: "string" as const, enum: ["succeeded", "needs_human"] },
        proposalId: idProperty,
        executionId: idProperty,
        externalReference: { type: "string" as const },
        completedAt: { type: "string" as const, format: "date-time" },
        reason: { type: "string" as const },
      },
    },
  },
};

export const knowledgeResponseOpenApiSchema = {
  ...versionedResponseSchema,
  required: ["schemaVersion", "policies"],
  properties: {
    ...versionedResponseSchema.properties,
    policies: {
      type: "array" as const,
      items: {
        type: "object" as const,
        required: ["policyId", "status", "release"],
        properties: {
          policyId: idProperty,
          status: { type: "string" as const, enum: ["published"] },
          release: {
            type: "object" as const,
            properties: {
              releaseId: idProperty,
              version: { type: "integer" as const },
              immutable: { type: "boolean" as const },
            },
          },
        },
      },
    },
  },
};

export const auditResponseOpenApiSchema = {
  ...versionedResponseSchema,
  required: ["schemaVersion", "events"],
  properties: {
    ...versionedResponseSchema.properties,
    events: {
      type: "array" as const,
      items: {
        type: "object" as const,
        required: ["auditEventId", "eventType", "occurredAt"],
        properties: {
          auditEventId: idProperty,
          eventType: { type: "string" as const },
          occurredAt: { type: "string" as const, format: "date-time" },
        },
      },
    },
  },
};
