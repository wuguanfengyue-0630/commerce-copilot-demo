import {
  createActionProposal,
  createCompanyId,
  createConversationId,
  createMoney,
  createProposalId,
  createStoreId,
  FixedClock,
} from "@commerce-copilot/domain";
import { describe, expect, it } from "vitest";
import type { ApplicationUnitOfWork } from "../ports/repositories.ts";
import { createDemoRuntime } from "../runtime/demo-runtime.ts";
import { createDecideApprovalUseCase, type DecideApprovalCommand } from "./decide-approval.ts";

const companyId = createCompanyId("company-demo");
const proposalId = createProposalId("proposal-approval-focused");
const seedContext = Object.freeze({
  companyId,
  correlationId: "correlation-seed-approval",
  causationId: "causation-seed-approval",
});

function pendingProposal(expiresAt = "2026-07-11T01:40:00.000Z") {
  return createActionProposal({
    proposalId,
    companyId,
    storeId: createStoreId("store-douyin-demo"),
    conversationId: createConversationId("conversation-damaged-item-1"),
    payload: {
      kind: "after_sale.refund",
      orderId: "order-delivered-12800",
      amount: createMoney(12_800, "CNY"),
      reasonCode: "damaged_item",
      observedOrderVersion: 1,
      observedOrderStatus: "delivered",
      observedRefundableAmount: createMoney(12_800, "CNY"),
    },
    createdAt: "2026-07-11T01:10:00.000Z",
    expiresAt,
  });
}

function command(overrides: Partial<DecideApprovalCommand> = {}): DecideApprovalCommand {
  return {
    companyId,
    proposalId,
    proposalVersion: 1,
    outcome: "approved",
    actor: { id: "supervisor-demo", role: "supervisor" },
    correlationId: "correlation-approval-focused",
    causationId: "causation-approval-focused",
    ...overrides,
  };
}

async function harness(expiresAt?: string) {
  const runtime = createDemoRuntime();
  await runtime.repositories.proposals.save(seedContext, pendingProposal(expiresAt));
  return {
    runtime,
    useCase: createDecideApprovalUseCase({
      repositories: runtime.repositories,
      unitOfWork: runtime.unitOfWork,
      clock: new FixedClock(new Date("2026-07-11T01:20:00.000Z")),
    }),
  };
}

describe("decide approval", () => {
  it("rejects malformed commands with the stable invalid-command code", async () => {
    const { useCase } = await harness();

    await expect(useCase.execute(null as never)).rejects.toMatchObject({
      code: "APPROVAL_INVALID_COMMAND",
    });
    await expect(useCase.execute(command({ comment: "   " }))).rejects.toMatchObject({
      code: "APPROVAL_INVALID_COMMAND",
    });
  });

  it.each([
    "approved",
    "rejected",
  ] as const)("rejects an agent %s decision without writes", async (outcome) => {
    const { runtime, useCase } = await harness();

    await expect(
      useCase.execute(command({ outcome, actor: { id: "agent-demo", role: "agent" } })),
    ).rejects.toMatchObject({ code: "APPROVAL_ROLE_REQUIRED" });

    const stored = await runtime.repositories.proposals.get(seedContext, proposalId);
    expect(stored).toMatchObject({ status: "pending_approval", version: 1 });
    expect(
      await runtime.repositories.approvalDecisions.listByProposal(seedContext, proposalId),
    ).toEqual([]);
    expect(
      (await runtime.repositories.auditEvents.list(seedContext)).map((event) => event.eventType),
    ).toEqual(["conversation.message_ingested"]);
  });

  it("returns stable errors for missing, expired, stale, and already-decided proposals", async () => {
    const empty = createDemoRuntime();
    const missing = createDecideApprovalUseCase({
      repositories: empty.repositories,
      unitOfWork: empty.unitOfWork,
      clock: new FixedClock(new Date("2026-07-11T01:20:00.000Z")),
    });
    await expect(missing.execute(command())).rejects.toMatchObject({ code: "APPROVAL_NOT_FOUND" });

    const expired = await harness("2026-07-11T01:20:00.000Z");
    await expect(expired.useCase.execute(command())).rejects.toMatchObject({
      code: "APPROVAL_EXPIRED",
    });

    const stale = await harness();
    await expect(stale.useCase.execute(command({ proposalVersion: 2 }))).rejects.toMatchObject({
      code: "APPROVAL_CONFLICT",
    });

    const decided = await harness();
    await decided.useCase.execute(command());
    await expect(decided.useCase.execute(command())).rejects.toMatchObject({
      code: "APPROVAL_CONFLICT",
    });
  });

  it("persists one immutable approved decision and trims its comment", async () => {
    const { runtime, useCase } = await harness();

    const result = await useCase.execute(command({ comment: "  verified evidence  " }));

    expect(result.proposal).toMatchObject({ status: "approved", version: 2 });
    expect(result.decision).toMatchObject({
      decision: "approved",
      proposalVersion: 1,
      comment: "verified evidence",
    });
    expect(Object.isFrozen(result.decision)).toBe(true);
    expect(Object.isFrozen(result.decision.actor)).toBe(true);
    expect(
      await runtime.repositories.approvalDecisions.listByProposal(seedContext, proposalId),
    ).toHaveLength(1);
  });

  it("coalesces concurrent decisions into one success and one conflict", async () => {
    const { runtime, useCase } = await harness();

    const settled = await Promise.allSettled([
      useCase.execute(command()),
      useCase.execute(command()),
    ]);

    expect(settled.filter((entry) => entry.status === "fulfilled")).toHaveLength(1);
    const rejection = settled.find((entry) => entry.status === "rejected");
    expect(rejection).toMatchObject({ reason: { code: "APPROVAL_CONFLICT" } });
    expect(
      await runtime.repositories.approvalDecisions.listByProposal(seedContext, proposalId),
    ).toHaveLength(1);
    expect(
      (await runtime.repositories.auditEvents.list(seedContext)).filter(
        (event) => event.eventType === "approval.approved",
      ),
    ).toHaveLength(1);
  });

  it("rejects without creating execution records", async () => {
    const { runtime, useCase } = await harness();

    const result = await useCase.execute(
      command({ outcome: "rejected", comment: "insufficient evidence" }),
    );

    expect(result.proposal).toMatchObject({ status: "rejected", version: 2 });
    expect(result.decision.decision).toBe("rejected");
    expect(
      await runtime.repositories.executionAttempts.listByProposal(seedContext, proposalId),
    ).toEqual([]);
    expect(
      await runtime.repositories.executionResults.listByProposal(seedContext, proposalId),
    ).toEqual([]);
    expect(
      (await runtime.repositories.auditEvents.list(seedContext))
        .map((event) => event.eventType)
        .slice(-1),
    ).toEqual(["approval.rejected"]);
  });

  it.each([
    "decision",
    "audit",
  ] as const)("rolls back proposal, decision, and audit when %s persistence fails", async (failure) => {
    const runtime = createDemoRuntime();
    await runtime.repositories.proposals.save(seedContext, pendingProposal());
    const unitOfWork: ApplicationUnitOfWork = {
      run(context, work) {
        return runtime.unitOfWork.run(context, (repositories) =>
          work({
            ...repositories,
            approvalDecisions: {
              ...repositories.approvalDecisions,
              async save(saveContext, decision) {
                if (failure === "decision") throw new Error("forced decision failure");
                return repositories.approvalDecisions.save(saveContext, decision);
              },
            },
            auditEvents: {
              ...repositories.auditEvents,
              async append(appendContext, event) {
                if (failure === "audit") throw new Error("forced audit failure");
                return repositories.auditEvents.append(appendContext, event);
              },
            },
          }),
        );
      },
    };
    const useCase = createDecideApprovalUseCase({
      repositories: runtime.repositories,
      unitOfWork,
      clock: new FixedClock(new Date("2026-07-11T01:20:00.000Z")),
    });

    await expect(useCase.execute(command())).rejects.toMatchObject({
      code: "APPROVAL_PERSIST_FAILED",
    });

    expect(await runtime.repositories.proposals.get(seedContext, proposalId)).toMatchObject({
      status: "pending_approval",
      version: 1,
    });
    expect(
      await runtime.repositories.approvalDecisions.listByProposal(seedContext, proposalId),
    ).toEqual([]);
    expect(
      (await runtime.repositories.auditEvents.list(seedContext)).map((event) => event.eventType),
    ).toEqual(["conversation.message_ingested"]);
  });
});
