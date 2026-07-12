import {
  approveProposal,
  type CapabilityState,
  createActionProposal,
  createCompanyId,
  createConversationId,
  createMoney,
  createOrderId,
  createOrderSnapshot,
  createProposalId,
  createStoreId,
  createUserId,
  FixedClock,
  type OrderSnapshot,
  toIsoTimestamp,
} from "@commerce-copilot/domain";
import { describe, expect, it } from "vitest";
import type {
  CommerceConnector,
  ExecuteActionCommand,
  ExecutionResult,
} from "../ports/commerce-connector.ts";
import type { ApplicationUnitOfWork } from "../ports/repositories.ts";
import { createDemoRuntime } from "../runtime/demo-runtime.ts";
import { createExecuteActionUseCase, type ExecuteApprovedActionCommand } from "./execute-action.ts";

const companyId = createCompanyId("company-demo");
const storeId = createStoreId("store-douyin-demo");
const orderId = createOrderId("order-delivered-12800");
const proposalId = createProposalId("proposal-execution-focused");
const seedContext = Object.freeze({
  companyId,
  correlationId: "correlation-seed-execution",
  causationId: "causation-seed-execution",
});
const command = Object.freeze({
  companyId,
  proposalId,
  actor: { id: "supervisor-demo", role: "supervisor" as const },
  correlationId: "correlation-execution-focused",
  causationId: "causation-execution-focused",
}) satisfies ExecuteApprovedActionCommand;

function order(overrides: Partial<OrderSnapshot> = {}): OrderSnapshot {
  return createOrderSnapshot({
    companyId,
    storeId,
    orderId,
    version: 1,
    status: "delivered",
    total: createMoney(12_800, "CNY"),
    refundable: createMoney(12_800, "CNY"),
    updatedAt: toIsoTimestamp("2026-07-11T01:00:00.000Z"),
    ...overrides,
  });
}

function pending() {
  return createActionProposal({
    proposalId,
    companyId,
    storeId,
    conversationId: createConversationId("conversation-damaged-item-1"),
    payload: {
      kind: "after_sale.refund",
      orderId,
      amount: createMoney(12_800, "CNY"),
      reasonCode: "damaged_item",
      observedOrderVersion: 1,
      observedOrderStatus: "delivered",
      observedRefundableAmount: createMoney(12_800, "CNY"),
    },
    createdAt: "2026-07-11T01:10:00.000Z",
    expiresAt: "2026-07-11T01:40:00.000Z",
  });
}

type ConnectorOptions = {
  executeThrowsAfterEffect?: boolean;
  findThrows?: boolean;
  findReturnsNull?: boolean;
  driftAfterGet?: OrderSnapshot;
  resultOverride?: ExecutionResult;
};

function connectorHarness(options: ConnectorOptions = {}) {
  let currentOrder = order();
  let effects = 0;
  let executeCalls = 0;
  let findCalls = 0;
  const calls: string[] = [];
  const results = new Map<string, ExecutionResult>();
  const connector: CommerceConnector = Object.freeze({
    async getCapabilities(): Promise<readonly CapabilityState[]> {
      return Object.freeze([]);
    },
    async getOrder(): Promise<OrderSnapshot> {
      calls.push("getOrder");
      const observed = currentOrder;
      if (options.driftAfterGet !== undefined) {
        currentOrder = options.driftAfterGet;
      }
      return observed;
    },
    async executeAction(executeCommand: ExecuteActionCommand): Promise<ExecutionResult> {
      calls.push("execute");
      executeCalls += 1;
      const existing = results.get(executeCommand.idempotencyKey);
      if (existing !== undefined) {
        return existing;
      }
      if (
        currentOrder.version !== executeCommand.payload.observedOrderVersion ||
        currentOrder.status !== executeCommand.payload.observedOrderStatus ||
        currentOrder.refundable.amountMinor !==
          executeCommand.payload.observedRefundableAmount.amountMinor
      ) {
        throw new Error("MOCK_PRECONDITION_FAILED");
      }
      effects += 1;
      const result =
        options.resultOverride ??
        Object.freeze({
          status: "succeeded" as const,
          executionId: "execution-focused-1",
          idempotencyKey: executeCommand.idempotencyKey,
          externalReference: "refund-focused-1",
          startedAt: executeCommand.executionStartedAt,
          completedAt: toIsoTimestamp("2026-07-11T01:20:00.000Z"),
        });
      results.set(executeCommand.idempotencyKey, result);
      if (options.executeThrowsAfterEffect === true) {
        throw new Error("unknown outcome");
      }
      return result;
    },
    async findActionResult(idempotencyKey: string): Promise<ExecutionResult | null> {
      calls.push("find");
      findCalls += 1;
      if (options.findThrows === true) {
        throw new Error("lookup unavailable");
      }
      if (options.findReturnsNull === true) {
        return null;
      }
      return results.get(idempotencyKey) ?? null;
    },
  });
  return {
    connector,
    effects: () => effects,
    executeCalls: () => executeCalls,
    findCalls: () => findCalls,
    calls: () => [...calls],
    setOrder(next: OrderSnapshot): void {
      currentOrder = next;
    },
  };
}

async function harness(
  options: {
    connector?: ConnectorOptions;
    unitOfWork?: (runtime: ReturnType<typeof createDemoRuntime>) => ApplicationUnitOfWork;
  } = {},
) {
  const runtime = createDemoRuntime();
  const initial = pending();
  const approved = approveProposal(
    initial,
    Object.freeze({ userId: createUserId("supervisor-demo"), role: "supervisor" }),
    "2026-07-11T01:15:00.000Z",
  );
  await runtime.repositories.proposals.save(seedContext, initial);
  await runtime.unitOfWork.run(seedContext, (repositories) =>
    repositories.proposals.replace(seedContext, approved, initial.version),
  );
  const connector = connectorHarness(options.connector);
  return {
    runtime,
    connector,
    useCase: createExecuteActionUseCase({
      repositories: runtime.repositories,
      unitOfWork: options.unitOfWork?.(runtime) ?? runtime.unitOfWork,
      commerceConnector: connector.connector,
      clock: new FixedClock(new Date("2026-07-11T01:20:00.000Z")),
    }),
  };
}

describe("execute approved action", () => {
  it("returns stable errors for malformed, unauthorized, missing, and non-approved proposals", async () => {
    const test = await harness();
    await expect(test.useCase.execute(null as never)).rejects.toMatchObject({
      code: "EXECUTION_INVALID_COMMAND",
    });
    await expect(
      test.useCase.execute({ ...command, actor: { id: "agent-demo", role: "agent" } }),
    ).rejects.toMatchObject({ code: "EXECUTION_ROLE_REQUIRED" });

    const empty = createDemoRuntime();
    const missing = createExecuteActionUseCase({
      repositories: empty.repositories,
      unitOfWork: empty.unitOfWork,
      commerceConnector: test.connector.connector,
      clock: new FixedClock(new Date("2026-07-11T01:20:00.000Z")),
    });
    await expect(missing.execute(command)).rejects.toMatchObject({ code: "EXECUTION_NOT_FOUND" });

    const pendingRuntime = createDemoRuntime();
    await pendingRuntime.repositories.proposals.save(seedContext, pending());
    const conflict = createExecuteActionUseCase({
      repositories: pendingRuntime.repositories,
      unitOfWork: pendingRuntime.unitOfWork,
      commerceConnector: test.connector.connector,
      clock: new FixedClock(new Date("2026-07-11T01:20:00.000Z")),
    });
    await expect(conflict.execute(command)).rejects.toMatchObject({ code: "EXECUTION_CONFLICT" });
  });

  it.each([
    { drift: "version", change: { version: 2 } },
    { drift: "status", change: { status: "refunded" as const } },
    { drift: "refundable", change: { refundable: createMoney(6_400, "CNY") } },
  ])("blocks $drift drift without an effect", async ({ change }) => {
    const test = await harness();
    test.connector.setOrder(order(change));

    const result = await test.useCase.execute(command);

    expect(result).toMatchObject({
      status: "needs_human",
      proposal: { status: "needs_human", version: 3 },
      reason: "ORDER_CHANGED",
    });
    expect(test.connector.effects()).toBe(0);
  });

  it("executes sequential and concurrent calls once with an equivalent persisted result", async () => {
    const test = await harness();

    const [first, second] = await Promise.all([
      test.useCase.execute(command),
      test.useCase.execute(command),
    ]);
    const third = await test.useCase.execute(command);

    expect(first).toEqual(second);
    expect(second).toEqual(third);
    expect(first).toMatchObject({
      status: "succeeded",
      proposal: { status: "executed", version: 4 },
      executionResult: { idempotencyKey: `refund:${proposalId}` },
    });
    expect(test.connector.effects()).toBe(1);
    expect(
      await test.runtime.repositories.executionResults.listByProposal(seedContext, proposalId),
    ).toHaveLength(1);
  });

  it("recovers an execute throw through findActionResult and completes", async () => {
    const test = await harness({ connector: { executeThrowsAfterEffect: true } });

    const result = await test.useCase.execute(command);

    expect(result.status).toBe("succeeded");
    expect(test.connector.effects()).toBe(1);
    expect(test.connector.findCalls()).toBe(2);
    expect(test.connector.calls()).toEqual(["find", "getOrder", "execute", "find"]);
  });

  it.each([
    {
      lookup: "null",
      options: { executeThrowsAfterEffect: true, findReturnsNull: true },
      expectedVersion: 4,
      expectedEffects: 1,
      expectedExecuteCalls: 1,
    },
    {
      lookup: "throw",
      options: { executeThrowsAfterEffect: true, findThrows: true },
      expectedVersion: 3,
      expectedEffects: 0,
      expectedExecuteCalls: 0,
    },
  ])("persists needs-human when recovery lookup returns $lookup and never retries", async ({
    options,
    expectedVersion,
    expectedEffects,
    expectedExecuteCalls,
  }) => {
    const test = await harness({ connector: options });

    const first = await test.useCase.execute(command);
    const second = await test.useCase.execute(command);

    expect(first).toMatchObject({
      status: "needs_human",
      proposal: { status: "needs_human", version: expectedVersion },
      reason: "EXECUTION_UNCONFIRMED",
    });
    expect(second).toEqual(first);
    expect(test.connector.executeCalls()).toBe(expectedExecuteCalls);
    expect(test.connector.effects()).toBe(expectedEffects);
  });

  it("blocks a post-getOrder race at the adapter gate", async () => {
    const test = await harness({
      connector: { driftAfterGet: order({ version: 2 }) },
    });

    const result = await test.useCase.execute(command);

    expect(result).toMatchObject({ status: "needs_human", reason: "EXECUTION_UNCONFIRMED" });
    expect(test.connector.effects()).toBe(0);
  });

  it("recovers one external effect after local result persistence rolls back", async () => {
    let failOnce = true;
    const test = await harness({
      unitOfWork: (runtime) => ({
        run(context, work) {
          return runtime.unitOfWork.run(context, (repositories) =>
            work({
              ...repositories,
              executionResults: {
                ...repositories.executionResults,
                async save(saveContext, result) {
                  if (failOnce) {
                    failOnce = false;
                    throw new Error("forced result persistence failure");
                  }
                  return repositories.executionResults.save(saveContext, result);
                },
              },
            }),
          );
        },
      }),
    });

    await expect(test.useCase.execute(command)).rejects.toMatchObject({
      code: "EXECUTION_PERSIST_FAILED",
    });
    const callsBeforeRecovery = test.connector.calls().length;
    const recovered = await test.useCase.execute(command);

    expect(recovered.status).toBe("succeeded");
    expect(test.connector.effects()).toBe(1);
    expect(test.connector.calls().slice(callsBeforeRecovery)).toEqual(["find"]);
  });

  it("recovers an execution that started before expiry and completed after expiry", async () => {
    let failOnce = true;
    const resultAfterExpiry = Object.freeze({
      status: "succeeded" as const,
      executionId: "execution-after-expiry",
      idempotencyKey: `refund:${proposalId}`,
      externalReference: "refund-after-expiry",
      startedAt: toIsoTimestamp("2026-07-11T01:20:00.000Z"),
      completedAt: toIsoTimestamp("2026-07-11T01:41:00.000Z"),
    });
    const test = await harness({
      connector: { resultOverride: resultAfterExpiry },
      unitOfWork: (runtime) => ({
        run(context, work) {
          return runtime.unitOfWork.run(context, (repositories) =>
            work({
              ...repositories,
              executionResults: {
                ...repositories.executionResults,
                async save(saveContext, result) {
                  if (failOnce) {
                    failOnce = false;
                    throw new Error("forced result persistence failure");
                  }
                  return repositories.executionResults.save(saveContext, result);
                },
              },
            }),
          );
        },
      }),
    });

    await expect(test.useCase.execute(command)).rejects.toMatchObject({
      code: "EXECUTION_PERSIST_FAILED",
    });
    const callsBeforeRecovery = test.connector.calls().length;

    const recovered = await test.useCase.execute(command);

    expect(recovered).toMatchObject({
      status: "succeeded",
      proposal: {
        status: "executed",
        executionStartedAt: "2026-07-11T01:20:00.000Z",
        executionResult: { executedAt: "2026-07-11T01:41:00.000Z" },
      },
    });
    expect(test.connector.calls().slice(callsBeforeRecovery)).toEqual(["find"]);
    expect(
      (
        await test.runtime.repositories.executionAttempts.listByProposal(seedContext, proposalId)
      ).map((attempt) => attempt.status),
    ).toEqual(["started", "succeeded"]);
    expect(
      (await test.runtime.repositories.auditEvents.list(seedContext))
        .map((event) => event.eventType)
        .slice(-2),
    ).toEqual(["action.execution_started", "action.execution_succeeded"]);
  });

  it("recovers one external effect after local audit persistence rolls back", async () => {
    let failOnce = true;
    const test = await harness({
      unitOfWork: (runtime) => ({
        run(context, work) {
          return runtime.unitOfWork.run(context, (repositories) =>
            work({
              ...repositories,
              auditEvents: {
                ...repositories.auditEvents,
                async append(appendContext, event) {
                  if (failOnce && event.eventType === "action.execution_succeeded") {
                    failOnce = false;
                    throw new Error("forced audit persistence failure");
                  }
                  return repositories.auditEvents.append(appendContext, event);
                },
              },
            }),
          );
        },
      }),
    });

    await expect(test.useCase.execute(command)).rejects.toMatchObject({
      code: "EXECUTION_PERSIST_FAILED",
    });
    expect((await test.useCase.execute(command)).status).toBe("succeeded");
    expect(test.connector.effects()).toBe(1);
  });

  it.each([
    Object.freeze({
      status: "succeeded" as const,
      executionId: "execution-wrong-key",
      idempotencyKey: "refund:wrong-key",
      externalReference: "refund-wrong-key",
      startedAt: toIsoTimestamp("2026-07-11T01:20:00.000Z"),
      completedAt: toIsoTimestamp("2026-07-11T01:20:00.000Z"),
    }),
    Object.freeze({
      status: "succeeded" as const,
      executionId: "execution-before-start",
      idempotencyKey: `refund:${proposalId}`,
      externalReference: "refund-before-start",
      startedAt: toIsoTimestamp("2026-07-11T01:20:00.000Z"),
      completedAt: toIsoTimestamp("2026-07-11T01:19:59.000Z"),
    }),
  ])("blocks an invalid connector result %#", async (resultOverride) => {
    const test = await harness({ connector: { resultOverride } });

    const result = await test.useCase.execute(command);

    expect(result).toMatchObject({ status: "needs_human", reason: "EXECUTION_UNCONFIRMED" });
  });

  it("blocks when the enabled demo refund policy is no longer present", async () => {
    const test = await harness({
      unitOfWork: (runtime) => ({
        run(context, work) {
          return runtime.unitOfWork.run(context, (repositories) =>
            work({
              ...repositories,
              publishedKnowledge: {
                async search() {
                  return Object.freeze([]);
                },
              },
            }),
          );
        },
      }),
    });

    const result = await test.useCase.execute(command);

    expect(result).toMatchObject({ status: "needs_human", reason: "POLICY_CHANGED" });
    expect(test.connector.effects()).toBe(0);
  });

  it("keeps exact audit tail ordering when timestamps are equal", async () => {
    const test = await harness();

    await test.useCase.execute(command);

    const events = await test.runtime.repositories.auditEvents.list(seedContext);
    expect(events.map((event) => event.eventType).slice(-2)).toEqual([
      "action.execution_started",
      "action.execution_succeeded",
    ]);
    expect(events.map((event) => event.auditEventId).slice(-2)).toEqual([
      `audit-${proposalId}-05-execution-started`,
      `audit-${proposalId}-06-execution-succeeded`,
    ]);
  });
});
