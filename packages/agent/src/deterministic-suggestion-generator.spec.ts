import type {
  PublishedKnowledgeEvidence,
  SuggestionGenerationContext,
} from "@commerce-copilot/application";
import {
  createCompanyId,
  createConversation,
  createConversationId,
  createCustomerId,
  createKnowledgeChunkId,
  createKnowledgeReleaseId,
  createMessageId,
  createMoney,
  createOrderId,
  createOrderSnapshot,
  createStoreId,
  toIsoTimestamp,
} from "@commerce-copilot/domain";
import { describe, expect, it } from "vitest";
import { createDeterministicSuggestionGenerator } from "./deterministic-suggestion-generator.ts";

const companyId = createCompanyId("company-demo");
const storeId = createStoreId("store-douyin-demo");
const conversationId = createConversationId("conversation-damaged-item-1");
const orderId = createOrderId("order-delivered-12800");
const evaluatedAt = toIsoTimestamp("2026-07-11T02:00:00.000Z");

type UngroundedCase =
  | "missing_order"
  | "missing_citation"
  | "expired_policy"
  | "unpublished_policy"
  | "irrelevant_scenario";

function groundedRefundContext(): SuggestionGenerationContext {
  return Object.freeze({
    companyId,
    storeId,
    conversation: createConversation({
      companyId,
      storeId,
      conversationId,
      customerId: createCustomerId("customer-demo-1"),
      messages: [
        {
          messageId: createMessageId("message-damaged-item-1"),
          conversationId,
          role: "customer",
          origin: "platform",
          content: "商品破损，申请退款",
          occurredAt: toIsoTimestamp("2026-07-11T01:00:00.000Z"),
        },
      ],
      createdAt: toIsoTimestamp("2026-07-11T01:00:00.000Z"),
      updatedAt: toIsoTimestamp("2026-07-11T01:00:00.000Z"),
    }),
    order: createOrderSnapshot({
      companyId,
      storeId,
      orderId,
      version: 1,
      status: "delivered",
      total: createMoney(12_800, "CNY"),
      refundable: createMoney(12_800, "CNY"),
      updatedAt: toIsoTimestamp("2026-07-11T01:00:00.000Z"),
    }),
    publishedKnowledge: Object.freeze([publishedDamagedItemEvidence()]),
    evaluatedAt,
  });
}

function publishedDamagedItemEvidence(): PublishedKnowledgeEvidence {
  const releaseId = createKnowledgeReleaseId("knowledge-release-damaged-item-v1");

  return Object.freeze({
    companyId,
    releaseId,
    title: "破损商品退款政策",
    status: "published",
    version: 1,
    scenario: "damaged_item",
    content: "订单已送达且商品破损时，可建议提交不超过可退金额的退款申请，须经主管审批。",
    refundRule: Object.freeze({ kind: "after_sale.refund", enabled: true }),
    publishedAt: toIsoTimestamp("2026-07-11T01:00:00.000Z"),
    expiresAt: toIsoTimestamp("2026-08-11T00:00:00.000Z"),
    citations: Object.freeze([
      Object.freeze({
        releaseId,
        chunkId: createKnowledgeChunkId("knowledge-chunk-damaged-item-v1-1"),
        sourceTitle: "破损商品退款政策",
        excerpt: "商品破损可提交退款申请，须经主管审批。",
        version: 1,
      }),
    ]),
  });
}

function ungroundedContext(caseName: UngroundedCase): SuggestionGenerationContext {
  const grounded = groundedRefundContext();

  if (caseName === "missing_order") {
    return Object.freeze({
      companyId: grounded.companyId,
      storeId: grounded.storeId,
      conversation: grounded.conversation,
      publishedKnowledge: grounded.publishedKnowledge,
      evaluatedAt: grounded.evaluatedAt,
    });
  }

  if (caseName === "irrelevant_scenario") {
    return Object.freeze({
      ...grounded,
      conversation: createConversation({
        ...grounded.conversation,
        messages: [
          {
            messageId: createMessageId("message-logistics-1"),
            conversationId,
            role: "customer",
            origin: "platform",
            content: "请问物流到哪里了？",
            occurredAt: toIsoTimestamp("2026-07-11T01:00:00.000Z"),
          },
        ],
      }),
    });
  }

  const evidence = publishedDamagedItemEvidence();
  if (caseName === "missing_citation") {
    return Object.freeze({
      ...grounded,
      publishedKnowledge: Object.freeze([
        Object.freeze({ ...evidence, citations: Object.freeze([]) }),
      ]),
    });
  }

  if (caseName === "expired_policy") {
    return Object.freeze({
      ...grounded,
      publishedKnowledge: Object.freeze([
        Object.freeze({
          ...evidence,
          expiresAt: toIsoTimestamp("2026-07-11T02:00:00.000Z"),
        }),
      ]),
    });
  }

  return Object.freeze({
    ...grounded,
    publishedKnowledge: Object.freeze([
      Object.freeze({
        ...evidence,
        status: "draft",
      }) as never,
    ]),
  });
}

describe("deterministic suggestion generator evidence gate", () => {
  const generator = createDeterministicSuggestionGenerator();

  it("creates a refund draft only with live order facts and a published citation", async () => {
    const result = await generator.generate(groundedRefundContext());

    expect(result.disposition).toBe("propose_action");
    expect(result.citations).toHaveLength(1);
    expect(result.actionDraft?.kind).toBe("after_sale.refund");
  });

  it.each([
    "missing_order",
    "missing_citation",
    "expired_policy",
  ] as const)("hands off when evidence is %s", async (caseName) => {
    const result = await generator.generate(ungroundedContext(caseName));

    expect(result.disposition).toBe("needs_human");
    expect(result.actionDraft).toBeUndefined();
  });

  it.each([
    "unpublished_policy",
    "irrelevant_scenario",
  ] as const)("hands off for %s", async (caseName) => {
    const result = await generator.generate(ungroundedContext(caseName));

    expect(result.disposition).toBe("needs_human");
    expect(result.actionDraft).toBeUndefined();
    expect(result.citations).toHaveLength(0);
  });

  it("returns exact grounded facts without claiming the refund or message already happened", async () => {
    const context = groundedRefundContext();
    const result = await generator.generate(context);

    expect(result.provider).toBe("deterministic-demo");
    expect(result).not.toHaveProperty("confidence");
    expect(result.citations).toEqual(context.publishedKnowledge[0]?.citations);
    expect(result.actionDraft).toEqual({
      kind: "after_sale.refund",
      orderId: "order-delivered-12800",
      amount: { amountMinor: 12_800, currency: "CNY" },
      reasonCode: "damaged_item",
      observedOrderVersion: "1",
      observedOrderStatus: "delivered",
      observedRefundableAmount: { amountMinor: 12_800, currency: "CNY" },
    });
    expect(result.suggestedReply).toContain("破损商品退款政策");
    expect(result.suggestedReply).toMatch(/建议|可提交/);
    expect(result.suggestedReply).toContain("需审批");
    expect(result.suggestedReply).not.toMatch(/已退款|已到账|已发送|退款成功/);
  });

  it("snapshots and deeply freezes both input-derived evidence and output", async () => {
    const mutableCitation = {
      releaseId: createKnowledgeReleaseId("knowledge-release-damaged-item-v1"),
      chunkId: createKnowledgeChunkId("knowledge-chunk-damaged-item-v1-1"),
      sourceTitle: "破损商品退款政策",
      excerpt: "商品破损可提交退款申请，须经主管审批。",
      version: 1,
    };
    const mutableEvidence = {
      ...publishedDamagedItemEvidence(),
      citations: [mutableCitation],
    };
    const context = {
      ...groundedRefundContext(),
      publishedKnowledge: [mutableEvidence],
    } as SuggestionGenerationContext;

    const result = await generator.generate(context);
    mutableCitation.sourceTitle = "篡改来源";
    mutableCitation.excerpt = "退款已经到账";
    mutableEvidence.citations.length = 0;

    expect(result.citations[0]).toMatchObject({
      sourceTitle: "破损商品退款政策",
      excerpt: "商品破损可提交退款申请，须经主管审批。",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.citations)).toBe(true);
    expect(result.citations.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(result.actionDraft)).toBe(true);
    expect(Object.isFrozen(result.actionDraft?.amount)).toBe(true);
  });

  it.each([
    null,
    { ...groundedRefundContext(), evaluatedAt: "not-a-date" },
    {
      ...groundedRefundContext(),
      order: { ...groundedRefundContext().order, refundable: { amountMinor: -1, currency: "CNY" } },
    },
    {
      ...groundedRefundContext(),
      publishedKnowledge: [
        {
          ...publishedDamagedItemEvidence(),
          citations: [{ ...publishedDamagedItemEvidence().citations[0], sourceTitle: " " }],
        },
      ],
    },
  ])("fails closed without leaking TypeError for malformed runtime evidence %#", async (input) => {
    const result = await generator.generate(input as SuggestionGenerationContext);

    expect(result.provider).toBe("deterministic-demo");
    expect(result.disposition).toBe("needs_human");
    expect(result.actionDraft).toBeUndefined();
    expect(result.citations).toEqual([]);
  });
});
