import {
  approveProposal,
  createActionProposal,
  createAuditEvent,
  createAuditEventId,
  createCompanyId,
  createConversationId,
  createKnowledgeChunkId,
  createKnowledgeReleaseId,
  createMoney,
  createOrderId,
  createProposalId,
  createStoreId,
  createSuggestionId,
  createUserId,
  toIsoTimestamp,
} from "@commerce-copilot/domain";
import { describe, expect, it } from "vitest";
import type { OperationContext, SuggestionRecord } from "../ports/repositories.ts";
import { createDemoRuntime } from "./demo-runtime.ts";

const companyId = createCompanyId("company-demo");
const storeId = createStoreId("store-douyin-demo");
const conversationId = createConversationId("conversation-damaged-item-1");
const orderId = createOrderId("order-delivered-12800");

function operationContext(suffix = "runtime-test"): OperationContext {
  return Object.freeze({
    companyId,
    correlationId: `correlation-${suffix}`,
    causationId: `causation-${suffix}`,
  });
}

function suggestionRecord(suffix = "1", createdAt = "2026-07-11T02:00:00.000Z"): SuggestionRecord {
  return Object.freeze({
    suggestionId: createSuggestionId(`suggestion-${suffix}`),
    companyId,
    storeId,
    conversationId,
    orderId,
    correlationId: `correlation-${suffix}`,
    causationId: `causation-${suffix}`,
    provider: "deterministic-demo",
    disposition: "needs_human",
    suggestedReply: "建议转交人工核实。",
    citations: Object.freeze([]),
    reason: "INSUFFICIENT_GROUNDED_EVIDENCE",
    createdAt: toIsoTimestamp(createdAt),
  });
}

function refundProposal(suffix = "1") {
  return createActionProposal({
    proposalId: createProposalId(`proposal-${suffix}`),
    companyId,
    storeId,
    conversationId,
    payload: {
      kind: "after_sale.refund",
      orderId,
      amount: createMoney(12_800, "CNY"),
      reasonCode: "damaged_item",
      observedOrderVersion: "1",
      observedOrderStatus: "delivered",
      observedRefundableAmount: createMoney(12_800, "CNY"),
    },
    createdAt: "2026-07-11T02:00:00.000Z",
    expiresAt: "2026-07-11T02:30:00.000Z",
  });
}

async function seededSnapshot(runtime: ReturnType<typeof createDemoRuntime>) {
  const context = operationContext("snapshot");

  return {
    conversation: await runtime.repositories.conversations.get(context, conversationId),
    knowledge: await runtime.repositories.publishedKnowledge.search({
      ...context,
      storeId,
      conversationId,
      query: "damaged_item",
      evaluatedAt: toIsoTimestamp("2026-07-11T02:00:00.000Z"),
    }),
    suggestions: await runtime.repositories.suggestions.listByConversation(context, conversationId),
    proposals: await runtime.repositories.proposals.listByConversation(context, conversationId),
    approvals: await runtime.repositories.approvalDecisions.listByProposal(
      context,
      createProposalId("proposal-damaged-item-refund-1"),
    ),
    executionAttempts: await runtime.repositories.executionAttempts.listByProposal(
      context,
      createProposalId("proposal-damaged-item-refund-1"),
    ),
    executionResults: await runtime.repositories.executionResults.listByProposal(
      context,
      createProposalId("proposal-damaged-item-refund-1"),
    ),
    audit: await runtime.repositories.auditEvents.list(context),
  };
}

describe("demo runtime", () => {
  it("seeds the stable conversation, published policy, and initial immutable audit event", async () => {
    const runtime = createDemoRuntime();
    const snapshot = await seededSnapshot(runtime);

    expect(snapshot.conversation).toMatchObject({
      companyId: "company-demo",
      storeId: "store-douyin-demo",
      conversationId: "conversation-damaged-item-1",
      messages: [
        {
          content: "商品破损，申请退款",
          occurredAt: "2026-07-11T01:00:00.000Z",
        },
      ],
    });
    expect(snapshot.knowledge).toHaveLength(1);
    expect(snapshot.knowledge[0]).toMatchObject({
      releaseId: "knowledge-release-damaged-item-v1",
      status: "published",
      publishedAt: "2026-07-11T01:00:00.000Z",
    });
    expect(snapshot.audit).toEqual([
      {
        auditEventId: "audit-conversation-message-ingested-1",
        companyId: "company-demo",
        correlationId: "correlation-message-ingested-1",
        causationId: "message-damaged-item-1",
        eventType: "conversation.message_ingested",
        occurredAt: "2026-07-11T01:00:00.000Z",
      },
    ]);
    expect(Object.isFrozen(snapshot.conversation)).toBe(true);
    expect(Object.isFrozen(snapshot.knowledge)).toBe(true);
    expect(Object.isFrozen(snapshot.knowledge[0]?.citations)).toBe(true);
    expect(Object.isFrozen(snapshot.audit[0])).toBe(true);
  });

  it("reset restores byte-for-byte deterministic seed state and clears workflow records", async () => {
    const runtime = createDemoRuntime();
    const initial = await seededSnapshot(runtime);
    const context = operationContext("reset");

    await runtime.repositories.suggestions.save(context, suggestionRecord("reset"));
    const proposal = refundProposal("reset");
    await runtime.repositories.proposals.save(context, proposal);
    await runtime.repositories.approvalDecisions.save(
      context,
      Object.freeze({
        approvalDecisionId: "approval-reset",
        companyId,
        proposalId: proposal.proposalId,
        decision: "approved",
        actor: Object.freeze({
          userId: createUserId("supervisor-reset"),
          role: "supervisor",
        }),
        correlationId: context.correlationId,
        causationId: context.causationId,
        decidedAt: toIsoTimestamp("2026-07-11T02:05:00.000Z"),
      }),
    );
    await runtime.repositories.executionAttempts.save(
      context,
      Object.freeze({
        executionAttemptId: "execution-attempt-reset",
        companyId,
        proposalId: proposal.proposalId,
        idempotencyKey: "refund:proposal-reset",
        status: "succeeded",
        correlationId: context.correlationId,
        causationId: context.causationId,
        attemptedAt: toIsoTimestamp("2026-07-11T02:06:00.000Z"),
      }),
    );
    await runtime.repositories.executionResults.save(
      context,
      Object.freeze({
        executionId: "execution-reset",
        companyId,
        proposalId: proposal.proposalId,
        idempotencyKey: "refund:proposal-reset",
        status: "succeeded",
        externalReference: "refund-reset",
        correlationId: context.correlationId,
        causationId: context.causationId,
        completedAt: toIsoTimestamp("2026-07-11T02:06:01.000Z"),
      }),
    );
    await runtime.repositories.auditEvents.append(
      context,
      createAuditEvent({
        auditEventId: createAuditEventId("audit-reset-extra"),
        companyId,
        correlationId: context.correlationId,
        causationId: context.causationId,
        eventType: "agent.suggestion_generated",
        occurredAt: toIsoTimestamp("2026-07-11T02:00:00.000Z"),
      }),
    );

    runtime.reset();

    expect(await seededSnapshot(runtime)).toEqual(initial);
    expect(JSON.stringify(await seededSnapshot(runtime))).toBe(JSON.stringify(initial));
  });

  it("keeps runtime instances isolated", async () => {
    const first = createDemoRuntime();
    const second = createDemoRuntime();
    const context = operationContext("isolated");

    await first.repositories.suggestions.save(context, suggestionRecord("isolated"));

    expect(
      await first.repositories.suggestions.listByConversation(context, conversationId),
    ).toHaveLength(1);
    expect(
      await second.repositories.suggestions.listByConversation(context, conversationId),
    ).toEqual([]);
  });

  it("preserves the issued proposal identity and its WeakMap-sealed authority", async () => {
    const runtime = createDemoRuntime();
    const context = operationContext("proposal-identity");
    const issued = refundProposal("identity");

    await runtime.repositories.proposals.save(context, issued);
    const loaded = await runtime.repositories.proposals.get(context, issued.proposalId);

    expect(loaded).toBe(issued);
    if (loaded === null) {
      throw new Error("Expected stored proposal");
    }
    expect(() =>
      approveProposal(
        loaded,
        Object.freeze({
          userId: createUserId("supervisor-demo"),
          role: "supervisor",
        }),
        "2026-07-11T02:05:00.000Z",
      ),
    ).not.toThrow();
  });

  it("returns records in deterministic timestamp then identifier order", async () => {
    const runtime = createDemoRuntime();
    const context = operationContext("ordering");

    await runtime.repositories.suggestions.save(
      operationContext("later"),
      suggestionRecord("later", "2026-07-11T02:01:00.000Z"),
    );
    await runtime.repositories.suggestions.save(
      operationContext("same-z"),
      suggestionRecord("same-z", "2026-07-11T02:00:00.000Z"),
    );
    await runtime.repositories.suggestions.save(
      operationContext("same-a"),
      suggestionRecord("same-a", "2026-07-11T02:00:00.000Z"),
    );

    const records = await runtime.repositories.suggestions.listByConversation(
      context,
      conversationId,
    );

    expect(records.map((record) => record.suggestionId)).toEqual([
      "suggestion-same-a",
      "suggestion-same-z",
      "suggestion-later",
    ]);
    expect(Object.isFrozen(records)).toBe(true);
  });

  it("snapshots mutable suggestion aliases and exposes a deeply frozen record", async () => {
    const runtime = createDemoRuntime();
    const context = operationContext("alias");
    const mutableCitation = {
      releaseId: createKnowledgeReleaseId("knowledge-release-damaged-item-v1"),
      chunkId: createKnowledgeChunkId("knowledge-chunk-damaged-item-v1-1"),
      sourceTitle: "破损商品退款政策",
      excerpt: "商品破损可提交退款申请。",
      version: 1,
    };
    const mutableAmount = { ...createMoney(12_800, "CNY") };
    const input = {
      ...suggestionRecord("alias"),
      disposition: "propose_action" as const,
      citations: [mutableCitation],
      actionDraft: {
        kind: "after_sale.refund" as const,
        orderId,
        amount: mutableAmount,
        reasonCode: "damaged_item" as const,
        observedOrderVersion: "1",
        observedOrderStatus: "delivered" as const,
        observedRefundableAmount: mutableAmount,
      },
    } as SuggestionRecord;

    await runtime.repositories.suggestions.save(context, input);
    mutableCitation.excerpt = "退款已到账";
    mutableAmount.amountMinor = 1;

    const stored = await runtime.repositories.suggestions.get(context, input.suggestionId);
    expect(stored?.citations[0]?.excerpt).toBe("商品破损可提交退款申请。");
    expect(stored?.actionDraft?.amount.amountMinor).toBe(12_800);
    expect(Object.isFrozen(stored)).toBe(true);
    expect(Object.isFrozen(stored?.citations)).toBe(true);
    expect(Object.isFrozen(stored?.actionDraft)).toBe(true);
    expect(Object.isFrozen(stored?.actionDraft?.amount)).toBe(true);
  });

  it("rolls back suggestion, proposal, and audit writes when a transaction fails", async () => {
    const runtime = createDemoRuntime();
    const context = operationContext("rollback");
    const suggestion = suggestionRecord("rollback");
    const proposal = refundProposal("rollback");

    await expect(
      runtime.unitOfWork.run(context, async (repositories) => {
        await repositories.suggestions.save(context, suggestion);
        await repositories.proposals.save(context, proposal);
        await repositories.auditEvents.append(
          context,
          createAuditEvent({
            auditEventId: createAuditEventId("audit-rollback"),
            companyId,
            correlationId: context.correlationId,
            causationId: context.causationId,
            eventType: "action.proposed",
            occurredAt: toIsoTimestamp("2026-07-11T02:00:00.000Z"),
          }),
        );
        throw new Error("forced rollback");
      }),
    ).rejects.toThrow("forced rollback");

    expect(await runtime.repositories.suggestions.get(context, suggestion.suggestionId)).toBeNull();
    expect(await runtime.repositories.proposals.get(context, proposal.proposalId)).toBeNull();
    expect(
      (await runtime.repositories.auditEvents.list(context)).map((event) => event.eventType),
    ).toEqual(["conversation.message_ingested"]);
  });
});
