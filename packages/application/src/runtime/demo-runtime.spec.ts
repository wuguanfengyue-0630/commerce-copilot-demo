import {
  type ActionProposal,
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
import { createDemoRuntime, DemoRuntimeError } from "./demo-runtime.ts";

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
      observedOrderVersion: 1,
      observedOrderStatus: "delivered",
      observedRefundableAmount: createMoney(12_800, "CNY"),
    },
    createdAt: "2026-07-11T02:00:00.000Z",
    expiresAt: "2026-07-11T02:30:00.000Z",
  });
}

async function captureRuntimeMutation(operation: Promise<void>): Promise<string> {
  try {
    await operation;
    return "resolved";
  } catch (error) {
    if (!(error instanceof DemoRuntimeError)) {
      throw error;
    }
    return error.code;
  }
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
  it("preserves the seven-event workflow order when every timestamp is equal", async () => {
    const runtime = createDemoRuntime();
    const context = operationContext("equal-audit-time");
    const occurredAt = toIsoTimestamp("2026-07-11T01:00:00.000Z");
    const events = [
      ["audit-z-01", "knowledge.retrieved"],
      ["audit-y-02", "agent.suggestion_generated"],
      ["audit-x-03", "action.proposed"],
      ["audit-proposal-04-approval-approved", "approval.approved"],
      ["audit-proposal-05-execution-started", "action.execution_started"],
      ["audit-proposal-06-execution-succeeded", "action.execution_succeeded"],
    ] as const;
    for (const [auditEventId, eventType] of events) {
      await runtime.repositories.auditEvents.append(
        context,
        createAuditEvent({
          auditEventId: createAuditEventId(auditEventId),
          companyId,
          correlationId: context.correlationId,
          causationId: context.causationId,
          eventType,
          occurredAt,
        }),
      );
    }

    expect(
      (await runtime.repositories.auditEvents.list(context)).map((event) => event.eventType),
    ).toEqual([
      "conversation.message_ingested",
      "knowledge.retrieved",
      "agent.suggestion_generated",
      "action.proposed",
      "approval.approved",
      "action.execution_started",
      "action.execution_succeeded",
    ]);
  });

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
        proposalVersion: 1,
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
        startedAt: toIsoTimestamp("2026-07-11T02:06:00.000Z"),
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

  it("saves proposals create-only and replaces only the expected immutable successor", async () => {
    const runtime = createDemoRuntime();
    const context = operationContext("proposal-cas");
    const pending = refundProposal("cas");
    const actor = Object.freeze({
      userId: createUserId("supervisor-cas"),
      role: "supervisor" as const,
    });
    const approved = approveProposal(pending, actor, "2026-07-11T02:05:00.000Z");

    await runtime.repositories.proposals.save(context, pending);
    await expect(runtime.repositories.proposals.save(context, pending)).rejects.toMatchObject({
      code: "DEMO_RUNTIME_CONFLICT",
    });
    await runtime.repositories.proposals.replace(context, approved, 1);
    expect(await runtime.repositories.proposals.get(context, pending.proposalId)).toBe(approved);
    await expect(
      runtime.repositories.proposals.replace(context, approved, 1),
    ).rejects.toMatchObject({
      code: "REPOSITORY_CONFLICT",
    });
  });

  it("rejects a transitioned proposal through the create-only save path", async () => {
    const runtime = createDemoRuntime();
    const context = operationContext("proposal-create-only");
    const pending = refundProposal("create-only");
    const approved = approveProposal(
      pending,
      Object.freeze({ userId: createUserId("supervisor-create-only"), role: "supervisor" }),
      "2026-07-11T02:05:00.000Z",
    );

    await expect(runtime.repositories.proposals.save(context, approved)).rejects.toMatchObject({
      code: "DEMO_RUNTIME_CONFLICT",
    });
    expect(await runtime.repositories.proposals.get(context, pending.proposalId)).toBeNull();
  });

  it("rejects a trusted same-id successor derived from different proposal payload", async () => {
    const runtime = createDemoRuntime();
    const context = operationContext("proposal-provenance");
    const current = refundProposal("provenance");
    const differentPending = createActionProposal({
      ...current,
      payload: { ...current.payload, amount: createMoney(6_400, "CNY") },
    });
    const differentApproved = approveProposal(
      differentPending,
      Object.freeze({
        userId: createUserId("supervisor-provenance"),
        role: "supervisor",
      }),
      "2026-07-11T02:05:00.000Z",
    );

    await runtime.repositories.proposals.save(context, current);
    await expect(
      runtime.repositories.proposals.replace(context, differentApproved, 1),
    ).rejects.toMatchObject({ code: "REPOSITORY_CONFLICT" });
    expect(await runtime.repositories.proposals.get(context, current.proposalId)).toBe(current);
  });

  it("rejects deeply frozen spread and JSON proposal forgeries before storage", async () => {
    const runtime = createDemoRuntime();
    const context = operationContext("proposal-forgery");
    const issued = refundProposal("forgery");
    const spreadForgery = Object.freeze({ ...issued }) as ActionProposal;
    const parsed = JSON.parse(JSON.stringify(issued)) as ActionProposal;
    const jsonForgery = Object.freeze({
      ...parsed,
      payload: Object.freeze({
        ...parsed.payload,
        amount: Object.freeze({ ...parsed.payload.amount }),
        observedRefundableAmount: Object.freeze({
          ...parsed.payload.observedRefundableAmount,
        }),
      }),
    }) as ActionProposal;

    for (const forgery of [spreadForgery, jsonForgery]) {
      await expect(runtime.repositories.proposals.save(context, forgery)).rejects.toMatchObject({
        code: "DEMO_RUNTIME_INVALID_RECORD",
      });
      expect(await runtime.repositories.proposals.get(context, forgery.proposalId)).toBeNull();
    }
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
        observedOrderVersion: 1,
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

  it("rejects every root repository mutation while a staged transaction is pending", async () => {
    const runtime = createDemoRuntime();
    const context = operationContext("root-guard");
    const proposal = refundProposal("root-guard");
    let releaseTransaction = (): void => undefined;
    let markTransactionEntered = (): void => undefined;
    const transactionGate = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    const transactionEntered = new Promise<void>((resolve) => {
      markTransactionEntered = resolve;
    });
    const transaction = runtime.unitOfWork.run(context, async (repositories) => {
      markTransactionEntered();
      await transactionGate;
      await repositories.suggestions.save(context, suggestionRecord("root-guard"));
    });
    await transactionEntered;

    const mutationOutcomes = await Promise.all([
      captureRuntimeMutation(
        runtime.repositories.suggestions.save(context, suggestionRecord("root-guard")),
      ),
      captureRuntimeMutation(runtime.repositories.proposals.save(context, proposal)),
      captureRuntimeMutation(
        runtime.repositories.proposals.replace(
          context,
          approveProposal(
            proposal,
            Object.freeze({
              userId: createUserId("supervisor-root-replace"),
              role: "supervisor",
            }),
            "2026-07-11T02:05:00.000Z",
          ),
          1,
        ),
      ),
      captureRuntimeMutation(
        runtime.repositories.approvalDecisions.save(
          context,
          Object.freeze({
            approvalDecisionId: "approval-root-guard",
            companyId,
            proposalId: proposal.proposalId,
            proposalVersion: 1,
            decision: "approved",
            actor: Object.freeze({
              userId: createUserId("supervisor-root-guard"),
              role: "supervisor",
            }),
            correlationId: context.correlationId,
            causationId: context.causationId,
            decidedAt: toIsoTimestamp("2026-07-11T02:05:00.000Z"),
          }),
        ),
      ),
      captureRuntimeMutation(
        runtime.repositories.executionAttempts.save(
          context,
          Object.freeze({
            executionAttemptId: "attempt-root-guard",
            companyId,
            proposalId: proposal.proposalId,
            idempotencyKey: "refund:root-guard",
            status: "started",
            correlationId: context.correlationId,
            causationId: context.causationId,
            attemptedAt: toIsoTimestamp("2026-07-11T02:06:00.000Z"),
          }),
        ),
      ),
      captureRuntimeMutation(
        runtime.repositories.executionResults.save(
          context,
          Object.freeze({
            executionId: "execution-root-guard",
            companyId,
            proposalId: proposal.proposalId,
            idempotencyKey: "refund:root-guard",
            status: "succeeded",
            externalReference: "refund-root-guard",
            startedAt: toIsoTimestamp("2026-07-11T02:06:00.000Z"),
            correlationId: context.correlationId,
            causationId: context.causationId,
            completedAt: toIsoTimestamp("2026-07-11T02:06:01.000Z"),
          }),
        ),
      ),
      captureRuntimeMutation(
        runtime.repositories.auditEvents.append(
          context,
          createAuditEvent({
            auditEventId: createAuditEventId("audit-root-guard"),
            companyId,
            correlationId: context.correlationId,
            causationId: context.causationId,
            eventType: "agent.suggestion_generated",
            occurredAt: toIsoTimestamp("2026-07-11T02:00:00.000Z"),
          }),
        ),
      ),
    ]);

    releaseTransaction();
    await transaction;

    expect(mutationOutcomes).toEqual(
      Array.from({ length: 7 }, () => "DEMO_RUNTIME_TRANSACTION_ACTIVE"),
    );
    expect(
      await runtime.repositories.suggestions.get(
        context,
        suggestionRecord("root-guard").suggestionId,
      ),
    ).not.toBeNull();
    expect(await runtime.repositories.proposals.get(context, proposal.proposalId)).toBeNull();
  });

  it("rejects an awaited nested unit of work, rolls back, and leaves the queue reusable", async () => {
    const runtime = createDemoRuntime();
    const outerContext = operationContext("nested-outer");
    const nestedContext = operationContext("nested-inner");
    const recoveryContext = operationContext("nested-recovery");
    const outerSuggestion = suggestionRecord("nested-outer");
    const nestedSuggestion = suggestionRecord("nested-inner");
    const recoverySuggestion = suggestionRecord("nested-recovery");

    await expect(
      runtime.unitOfWork.run(outerContext, async (repositories) => {
        await repositories.suggestions.save(outerContext, outerSuggestion);
        await runtime.unitOfWork.run(nestedContext, async (nestedRepositories) => {
          await nestedRepositories.suggestions.save(nestedContext, nestedSuggestion);
        });
      }),
    ).rejects.toMatchObject({ code: "DEMO_RUNTIME_TRANSACTION_ACTIVE" });

    expect(
      await runtime.repositories.suggestions.get(outerContext, outerSuggestion.suggestionId),
    ).toBeNull();
    expect(
      await runtime.repositories.suggestions.get(nestedContext, nestedSuggestion.suggestionId),
    ).toBeNull();

    await runtime.unitOfWork.run(recoveryContext, async (repositories) => {
      await repositories.suggestions.save(recoveryContext, recoverySuggestion);
    });
    expect(
      await runtime.repositories.suggestions.get(recoveryContext, recoverySuggestion.suggestionId),
    ).not.toBeNull();

    runtime.reset();
    expect(
      await runtime.repositories.suggestions.get(recoveryContext, recoverySuggestion.suggestionId),
    ).toBeNull();
  }, 500);

  it("keeps genuinely independent concurrent unit-of-work calls in FIFO order", async () => {
    const runtime = createDemoRuntime();
    const firstContext = operationContext("fifo-first");
    const secondContext = operationContext("fifo-second");
    const order: string[] = [];
    let releaseFirst = (): void => undefined;
    let markFirstEntered = (): void => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstEntered = new Promise<void>((resolve) => {
      markFirstEntered = resolve;
    });
    const first = runtime.unitOfWork.run(firstContext, async (repositories) => {
      order.push("first:start");
      markFirstEntered();
      await firstGate;
      await repositories.suggestions.save(firstContext, suggestionRecord("fifo-first"));
      order.push("first:end");
    });
    await firstEntered;
    const second = runtime.unitOfWork.run(secondContext, async (repositories) => {
      order.push("second:start");
      await repositories.suggestions.save(secondContext, suggestionRecord("fifo-second"));
      order.push("second:end");
    });
    await Promise.resolve();

    expect(order).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });
});
