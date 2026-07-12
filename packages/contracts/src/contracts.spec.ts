import {
  ACTION_PROPOSAL_STATUSES,
  CAPABILITY_STATUSES,
  CURRENCIES,
  MESSAGE_ORIGINS,
  MESSAGE_ROLES,
  ORDER_STATUSES,
  PLATFORM_CAPABILITIES,
} from "@commerce-copilot/domain";
import { describe, expect, it } from "vitest";
import {
  actionExecutionResultResponseSchema,
  actionProposalResponseSchema,
  actionProposalStatusSchema,
  actionStatusResponseSchema,
  approvalDecisionSchema,
  refundActionPayloadSchema,
} from "./actions.ts";
import {
  capabilityStatusSchema,
  conversationRoleSchema,
  currencySchema,
  errorEnvelopeSchema,
  identifierSchema,
  messageOriginSchema,
  moneySchema,
  orderStatusSchema,
  platformCapabilitySchema,
} from "./api.ts";
import { settingsResponseSchema } from "./settings.ts";
import {
  conversationDetailResponseSchema,
  conversationSummaryResponseSchema,
  integrationResponseSchema,
  metricsResponseSchema,
  sessionResponseSchema,
  setupResponseSchema,
} from "./workspace.ts";

const observedAt = "2026-07-11T01:02:03.000Z";
const money = { amountMinor: 12_800, currency: "CNY" } as const;

const errorEnvelope = {
  schemaVersion: 1,
  error: {
    code: "validation_error",
    message: "Request validation failed",
    details: {
      field: "amount.amountMinor",
      issue: { expected: "safe integer", received: 1.2 },
    },
  },
} as const;

const sessionResponse = {
  schemaVersion: 1,
  session: {
    companyId: "company-1",
    selectedStoreId: "store-1",
    user: {
      userId: "user-1",
      displayName: "Demo Owner",
      role: "owner",
    },
    expiresAt: observedAt,
  },
} as const;

const setupResponse = {
  schemaVersion: 1,
  setup: {
    companyId: "company-1",
    storeId: "store-1",
    storeName: "Demo Store",
    timezone: "Asia/Shanghai",
    currency: "CNY",
    completedAt: observedAt,
  },
} as const;

const metricsResponse = {
  schemaVersion: 1,
  metrics: {
    openConversations: 4,
    waitingForAgent: 1,
    assistantSuggestions: 3,
    proposalsAwaitingApproval: 1,
    refundedAmount: money,
    measuredAt: observedAt,
  },
} as const;

const integrationResponse = {
  schemaVersion: 1,
  integration: {
    storeId: "store-1",
    platform: "deterministic-demo",
    displayName: "Demo Integration",
    status: "connected",
    capabilities: [
      { capability: "order.read", status: "available" },
      { capability: "afterSale.write", status: "waiting_qualification" },
    ],
    lastCheckedAt: observedAt,
  },
} as const;

const conversationSummary = {
  companyId: "company-1",
  storeId: "store-1",
  conversationId: "conversation-1",
  customer: {
    customerId: "customer-1",
    displayName: "Customer One",
  },
  status: "open",
  lastMessagePreview: "The item arrived damaged.",
  unreadCount: 1,
  updatedAt: observedAt,
} as const;

const conversationSummaryResponse = {
  schemaVersion: 1,
  conversations: [conversationSummary],
  generatedAt: observedAt,
} as const;

const conversationDetailResponse = {
  schemaVersion: 1,
  conversation: {
    ...conversationSummary,
    messages: [
      {
        messageId: "message-1",
        role: "customer",
        origin: "platform",
        content: "The item arrived damaged.",
        externalMessageId: "platform-message-1",
        occurredAt: observedAt,
      },
      {
        messageId: "message-2",
        role: "assistant",
        origin: "ai",
        content: "I can prepare a refund proposal.",
        occurredAt: observedAt,
      },
    ],
  },
} as const;

const refundAction = {
  kind: "after_sale.refund",
  orderId: "order-1",
  amount: money,
  reasonCode: "damaged_item",
  observedOrder: {
    version: 3,
    status: "delivered",
    total: { amountMinor: 25_600, currency: "CNY" },
    refundable: money,
    updatedAt: observedAt,
  },
} as const;

const actionProposalResponse = {
  schemaVersion: 1,
  proposal: {
    proposalId: "proposal-1",
    version: 1,
    companyId: "company-1",
    storeId: "store-1",
    conversationId: "conversation-1",
    action: refundAction,
    status: "pending_approval",
    createdAt: observedAt,
    expiresAt: "2026-07-11T01:12:03.000Z",
  },
} as const;

const approvalDecision = {
  proposalId: "proposal-1",
  decision: "approved",
  decidedBy: "user-1",
  reason: "Verified against the demo refund rule.",
  decidedAt: observedAt,
} as const;

const settingsResponse = {
  schemaVersion: 1,
  capabilityMatrix: {
    storeId: "store-1",
    entries: [
      { capability: "order.read", status: "available" },
      {
        capability: "afterSale.write",
        status: "waiting_qualification",
        reason: "Platform qualification is pending.",
      },
    ],
    evaluatedAt: observedAt,
  },
  model: {
    mode: "deterministic-demo",
    state: "ready",
    seed: "commerce-copilot-demo-v1",
    temperature: 0,
    updatedAt: observedAt,
  },
  refundRule: {
    kind: "after_sale.refund",
    enabled: true,
    maximumRefund: money,
    reasonCode: "damaged_item",
    requiresHumanApproval: true,
    eligibleOrderStatuses: ["delivered"],
    executionMode: "simulated",
  },
  evaluation: {
    scenarioCount: 12,
    passedCount: 12,
    failedCount: 0,
    lastEvaluatedAt: observedAt,
  },
} as const;

describe("shared API schemas", () => {
  it("derives every shared enum from the domain canonical tuples", () => {
    expect(currencySchema.options).toEqual(CURRENCIES);
    expect(platformCapabilitySchema.options).toEqual(PLATFORM_CAPABILITIES);
    expect(capabilityStatusSchema.options).toEqual(CAPABILITY_STATUSES);
    expect(conversationRoleSchema.options).toEqual(MESSAGE_ROLES);
    expect(messageOriginSchema.options).toEqual(MESSAGE_ORIGINS);
    expect(orderStatusSchema.options).toEqual(ORDER_STATUSES);

    for (const capability of PLATFORM_CAPABILITIES) {
      expect(platformCapabilitySchema.safeParse(capability).success).toBe(true);
    }
  });

  it("normalizes identifier whitespace at the HTTP boundary", () => {
    const first = identifierSchema.parse("  order-1\t");
    const second = identifierSchema.parse("\norder-1  ");
    const orders = new Map([[first, "matched"]]);

    expect(first).toBe("order-1");
    expect(second).toBe(first);
    expect(orders.get(second)).toBe("matched");
  });

  it("parses the uniform error envelope with JSON details", () => {
    const result = errorEnvelopeSchema.parse(errorEnvelope);

    expect(result.error.code).toBe("validation_error");
  });

  it("requires schemaVersion 1 on error responses", () => {
    const { schemaVersion: _schemaVersion, ...withoutVersion } = errorEnvelope;

    expect(errorEnvelopeSchema.safeParse(withoutVersion).success).toBe(false);
    expect(errorEnvelopeSchema.safeParse({ ...errorEnvelope, schemaVersion: 2 }).success).toBe(
      false,
    );
  });

  it("rejects unknown keys throughout the API contract", () => {
    expect(moneySchema.safeParse({ ...money, amountYuan: 128 }).success).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({
        ...errorEnvelope,
        debug: true,
      }).success,
    ).toBe(false);
  });

  it.each([
    -1,
    1.2,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects unsafe Money amount %s", (amountMinor) => {
    expect(moneySchema.safeParse({ amountMinor, currency: "CNY" }).success).toBe(false);
  });

  it("rejects unknown capability, role, and origin values", () => {
    expect(platformCapabilitySchema.safeParse("customer.export").success).toBe(false);
    expect(conversationRoleSchema.safeParse("moderator").success).toBe(false);
    expect(messageOriginSchema.safeParse("connector").success).toBe(false);
  });
});

describe("workspace schemas", () => {
  it("parses all minimum workspace responses", () => {
    const examples = [
      [sessionResponseSchema, sessionResponse],
      [setupResponseSchema, setupResponse],
      [metricsResponseSchema, metricsResponse],
      [integrationResponseSchema, integrationResponse],
      [conversationSummaryResponseSchema, conversationSummaryResponse],
      [conversationDetailResponseSchema, conversationDetailResponse],
    ] as const;

    for (const [schema, example] of examples) {
      expect(schema.safeParse(example).success).toBe(true);
    }
  });

  it("requires schemaVersion 1 on successful responses", () => {
    const { schemaVersion: _schemaVersion, ...withoutVersion } = sessionResponse;

    expect(sessionResponseSchema.safeParse(withoutVersion).success).toBe(false);
    expect(sessionResponseSchema.safeParse({ ...sessionResponse, schemaVersion: 2 }).success).toBe(
      false,
    );
  });

  it("requires ISO datetime strings at the HTTP boundary", () => {
    expect(
      sessionResponseSchema.safeParse({
        ...sessionResponse,
        session: { ...sessionResponse.session, expiresAt: "11 July 2026" },
      }).success,
    ).toBe(false);
  });

  it("rejects unknown message roles and origins in conversation details", () => {
    const [firstMessage, ...remainingMessages] = conversationDetailResponse.conversation.messages;

    expect(
      conversationDetailResponseSchema.safeParse({
        ...conversationDetailResponse,
        conversation: {
          ...conversationDetailResponse.conversation,
          messages: [{ ...firstMessage, role: "moderator" }, ...remainingMessages],
        },
      }).success,
    ).toBe(false);
    expect(
      conversationDetailResponseSchema.safeParse({
        ...conversationDetailResponse,
        conversation: {
          ...conversationDetailResponse.conversation,
          messages: [{ ...firstMessage, origin: "connector" }, ...remainingMessages],
        },
      }).success,
    ).toBe(false);
  });
});

describe("action schemas", () => {
  it("requires a positive proposal version", () => {
    expect(actionProposalResponseSchema.safeParse(actionProposalResponse).success).toBe(true);
    expect(
      actionProposalResponseSchema.safeParse({
        ...actionProposalResponse,
        proposal: { ...actionProposalResponse.proposal, version: 0 },
      }).success,
    ).toBe(false);
  });

  it("requires a positive observed order version", () => {
    expect(
      refundActionPayloadSchema.safeParse({
        ...refundAction,
        observedOrder: { ...refundAction.observedOrder, version: 0 },
      }).success,
    ).toBe(false);
  });

  it("accepts only canonical proposal statuses", () => {
    expect(actionProposalStatusSchema.options).toEqual(ACTION_PROPOSAL_STATUSES);

    for (const status of ACTION_PROPOSAL_STATUSES) {
      expect(actionProposalStatusSchema.safeParse(status).success).toBe(true);
    }

    expect(actionProposalStatusSchema.safeParse("succeeded").success).toBe(false);
    expect(actionProposalStatusSchema.safeParse("blocked").success).toBe(false);
  });

  it("parses refund payloads and proposal/status/decision/result DTOs", () => {
    const examples = [
      [refundActionPayloadSchema, refundAction],
      [actionProposalResponseSchema, actionProposalResponse],
      [
        actionStatusResponseSchema,
        {
          schemaVersion: 1,
          proposalId: "proposal-1",
          status: "approved",
          updatedAt: observedAt,
        },
      ],
      [approvalDecisionSchema, approvalDecision],
      [
        actionExecutionResultResponseSchema,
        {
          schemaVersion: 1,
          result: {
            status: "succeeded",
            proposalId: "proposal-1",
            executionId: "execution-1",
            externalReference: "demo-refund-1",
            completedAt: observedAt,
          },
        },
      ],
    ] as const;

    for (const [schema, example] of examples) {
      expect(schema.safeParse(example).success).toBe(true);
    }
  });
});

describe("settings schemas", () => {
  it("parses an explicit deterministic demo configuration", () => {
    expect(settingsResponseSchema.safeParse(settingsResponse).success).toBe(true);
  });

  it("rejects unknown capabilities in the capability matrix", () => {
    expect(
      settingsResponseSchema.safeParse({
        ...settingsResponse,
        capabilityMatrix: {
          ...settingsResponse.capabilityMatrix,
          entries: [{ capability: "customer.export", status: "available" }],
        },
      }).success,
    ).toBe(false);
  });
});
