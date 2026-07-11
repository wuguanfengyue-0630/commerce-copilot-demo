import { describe, expect, it } from "vitest";
import { ACTION_PROPOSAL_STATUSES } from "../actions/action-status.ts";
import { type AuditEventType, createAuditEvent } from "../audit/audit-event.ts";
import {
  createConversation,
  type MessageOrigin,
  type MessageRole,
} from "../conversations/conversation.ts";
import { createOrderSnapshot, type OrderStatus } from "../orders/order-snapshot.ts";
import {
  CAPABILITY_STATUSES,
  type CapabilityState,
  hasCapability,
  PLATFORM_CAPABILITIES,
} from "../platform/capabilities.ts";
import { FixedClock, toIsoTimestamp } from "./clock.ts";
import {
  type CompanyId,
  createAuditEventId,
  createCompanyId,
  createConversationId,
  createCustomerId,
  createKnowledgeChunkId,
  createKnowledgeReleaseId,
  createMessageId,
  createOrderId,
  createProposalId,
  createStoreId,
  createSuggestionId,
  createUserId,
  type StoreId,
} from "./ids.ts";
import { createMoney, type Money } from "./money.ts";

describe("branded IDs", () => {
  const idConstructors = [
    createCompanyId,
    createStoreId,
    createUserId,
    createCustomerId,
    createConversationId,
    createMessageId,
    createOrderId,
    createProposalId,
    createSuggestionId,
    createKnowledgeReleaseId,
    createKnowledgeChunkId,
    createAuditEventId,
  ] as const;

  it.each(idConstructors)("rejects a blank identifier", (createId) => {
    expect(() => createId(" \t\n ")).toThrow("ID must not be blank");
  });

  it("keeps ID types distinct at compile time", () => {
    const companyId = createCompanyId("company-1");

    // @ts-expect-error CompanyId must not be assignable to StoreId.
    const storeId: StoreId = companyId;

    expect(storeId).toBe("company-1");
  });

  it("normalizes surrounding whitespace into the same ID key", () => {
    const first = createCompanyId("  company-1\t");
    const second = createCompanyId("\ncompany-1  ");
    const companies = new Map<CompanyId, string>([[first, "matched"]]);

    expect(first).toBe("company-1");
    expect(second).toBe(first);
    expect(companies.get(second)).toBe("matched");
  });
});

describe("createMoney", () => {
  it("creates a CNY amount from minor units", () => {
    const value = createMoney(12_800, "CNY");

    expect(value).toEqual({
      amountMinor: 12_800,
      currency: "CNY",
    });
    expect(Object.isFrozen(value)).toBe(true);
    expect(() => Object.defineProperty(value, "amountMinor", { value: 1 })).toThrow();
  });

  it("cannot be forged from structurally similar objects", () => {
    // @ts-expect-error Negative structural values are not branded Money.
    const negativeMoney: Money = { amountMinor: -1, currency: "CNY" };
    // @ts-expect-error Even valid-looking structural values must come from createMoney.
    const unbrandedMoney: Money = { amountMinor: 12_800, currency: "CNY" };

    expect(negativeMoney.amountMinor).toBe(-1);
    expect(unbrandedMoney.amountMinor).toBe(12_800);
  });

  it.each([
    -1,
    1.2,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid minor-unit amount %s", (amountMinor) => {
    expect(() => createMoney(amountMinor, "CNY")).toThrow(
      "Money amountMinor must be a non-negative safe integer",
    );
  });
});

describe("hasCapability", () => {
  const states: readonly CapabilityState[] = [
    { capability: "order.read", status: "degraded", reason: "Upstream timeout" },
    { capability: "order.read", status: "available" },
    { capability: "message.send", status: "waiting_qualification" },
  ];

  it("returns true when any matching state is available", () => {
    expect(hasCapability(states, "order.read")).toBe(true);
  });

  it("returns false for matching non-available states", () => {
    expect(hasCapability(states, "message.send")).toBe(false);
  });

  it("returns false when the capability is absent", () => {
    expect(hasCapability(states, "event.verify")).toBe(false);
  });
});

describe("canonical platform capability values", () => {
  it("contains exactly the supported platform capabilities", () => {
    expect(PLATFORM_CAPABILITIES).toEqual([
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
    ]);
  });

  it("contains exactly the supported capability statuses", () => {
    expect(CAPABILITY_STATUSES).toEqual([
      "available",
      "unavailable",
      "waiting_qualification",
      "degraded",
    ]);
  });
});

describe("canonical action statuses", () => {
  it("contains only the proposal statuses shared with HTTP contracts", () => {
    expect(ACTION_PROPOSAL_STATUSES).toEqual([
      "pending_approval",
      "approved",
      "rejected",
      "expired",
      "executing",
      "executed",
      "failed",
      "needs_human",
    ]);
  });
});

describe("toIsoTimestamp", () => {
  it("normalizes Date and offset strings to UTC ISO timestamps", () => {
    expect(toIsoTimestamp(new Date("2026-07-11T01:02:03.000Z"))).toBe("2026-07-11T01:02:03.000Z");
    expect(toIsoTimestamp("2026-07-11T09:02:03+08:00")).toBe("2026-07-11T01:02:03.000Z");
  });

  it.each(["not-a-date", new Date(Number.NaN)])("rejects invalid time %s", (value) => {
    expect(() => toIsoTimestamp(value)).toThrow("Invalid timestamp");
  });
});

describe("FixedClock", () => {
  it("defensively copies both its input and returned dates", () => {
    const original = new Date("2026-07-11T01:02:03.000Z");
    const clock = new FixedClock(original);

    original.setUTCFullYear(2030);
    const firstReading = clock.now();
    firstReading.setUTCFullYear(2040);

    expect(clock.now()).toEqual(new Date("2026-07-11T01:02:03.000Z"));
    expect(clock.now()).not.toBe(firstReading);
  });
});

describe("deeply immutable domain snapshots", () => {
  const companyId = createCompanyId("company-1");
  const storeId = createStoreId("store-1");
  const conversationId = createConversationId("conversation-1");
  const occurredAt = toIsoTimestamp("2026-07-11T01:02:03.000Z");

  it("copies and freezes a conversation and its messages", () => {
    const firstMessage = {
      messageId: createMessageId("message-1"),
      conversationId,
      role: "customer" as MessageRole,
      origin: "platform" as MessageOrigin,
      content: "Original message",
      occurredAt,
    };
    const messages = [firstMessage];
    const conversation = createConversation({
      companyId,
      storeId,
      conversationId,
      customerId: createCustomerId("customer-1"),
      messages,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });

    firstMessage.content = "Mutated alias";
    messages.push({ ...firstMessage, messageId: createMessageId("message-2") });

    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0]?.content).toBe("Original message");
    expect(Object.isFrozen(conversation)).toBe(true);
    expect(Object.isFrozen(conversation.messages)).toBe(true);
    expect(Object.isFrozen(conversation.messages[0])).toBe(true);
  });

  it("copies and freezes an order snapshot", () => {
    const input = {
      companyId,
      storeId,
      orderId: createOrderId("order-1"),
      version: 1,
      status: "paid" as OrderStatus,
      total: createMoney(12_800, "CNY"),
      refundable: createMoney(12_800, "CNY"),
      updatedAt: occurredAt,
    };
    const snapshot = createOrderSnapshot(input);

    input.status = "refunded";
    input.version = 2;

    expect(snapshot.status).toBe("paid");
    expect(snapshot.version).toBe(1);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it("copies and freezes an audit event", () => {
    const input = {
      auditEventId: createAuditEventId("audit-event-1"),
      companyId,
      correlationId: "correlation-1",
      causationId: "causation-1",
      eventType: "action.proposed" as AuditEventType,
      occurredAt,
    };
    const event = createAuditEvent(input);

    input.correlationId = "mutated-correlation";

    expect(event.correlationId).toBe("correlation-1");
    expect(Object.isFrozen(event)).toBe(true);
  });
});
