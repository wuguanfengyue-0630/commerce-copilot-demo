import type {
  CommerceConnector,
  ExecuteActionCommand,
  GetOrderCommand,
} from "@commerce-copilot/application";
import { createDemoRuntime, createExecuteActionUseCase } from "@commerce-copilot/application";
import {
  approveProposal,
  createActionProposal,
  createCompanyId,
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
import {
  createMockCommerceConnector,
  MockCommerceConnectorError,
  type MockCommerceConnectorErrorCode,
} from "./mock-commerce-connector.ts";
import {
  mockCompanyId,
  mockDamagedItemConversation,
  mockDamagedItemRefundPolicy,
  mockDeliveredOrder,
  mockOrderId,
  mockStore,
  mockStoreId,
  mockSupervisorApprovalRule,
  refundExecutionCommand,
} from "./mock-fixtures.ts";

const expectedCapabilities = [
  { capability: "order.read", status: "available" },
  { capability: "logistics.read", status: "available" },
  { capability: "afterSale.read", status: "available" },
  { capability: "afterSale.write", status: "available" },
  {
    capability: "message.receive",
    status: "waiting_qualification",
    reason: "普通自用型应用未开放飞鸽消息收发 API",
  },
  {
    capability: "message.send",
    status: "waiting_qualification",
    reason: "普通自用型应用未开放飞鸽消息收发 API",
  },
] as const;

async function expectConnectorError(
  operation: Promise<object>,
  code: MockCommerceConnectorErrorCode,
): Promise<void> {
  await expect(operation).rejects.toBeInstanceOf(MockCommerceConnectorError);
  await expect(operation).rejects.toMatchObject({
    name: "MockCommerceConnectorError",
    message: code,
    code,
  });
}

describe("deterministic mock fixtures", () => {
  it("seeds a stable Douyin store and delivered CNY 128.00 order", () => {
    expect(mockStore).toEqual({
      companyId: "company-demo",
      storeId: "store-douyin-demo",
      platform: "douyin",
      displayName: "抖音电商演示店",
    });
    expect(mockDeliveredOrder).toEqual({
      companyId: "company-demo",
      storeId: "store-douyin-demo",
      orderId: "order-delivered-12800",
      version: 1,
      status: "delivered",
      total: { amountMinor: 12_800, currency: "CNY" },
      refundable: { amountMinor: 12_800, currency: "CNY" },
      updatedAt: "2026-07-11T01:00:00.000Z",
    });
    expect(Object.isFrozen(mockStore)).toBe(true);
    expect(Object.isFrozen(mockDeliveredOrder)).toBe(true);
  });

  it("seeds the damaged-item conversation and published human-approval policy", () => {
    expect(mockDamagedItemConversation.messages).toHaveLength(1);
    expect(mockDamagedItemConversation.messages[0]).toMatchObject({
      role: "customer",
      origin: "platform",
      content: "商品破损，申请退款",
    });
    expect(mockSupervisorApprovalRule).toEqual({
      actionKind: "after_sale.refund",
      requiresApproval: true,
      requiredRole: "supervisor",
    });
    expect(mockDamagedItemRefundPolicy).toEqual({
      policyId: "policy-damaged-item-refund-v1",
      title: "破损商品退款政策",
      status: "published",
      version: 1,
      refundRule: { kind: "after_sale.refund", enabled: true },
      approvalRule: mockSupervisorApprovalRule,
      publishedAt: "2026-07-11T01:00:00.000Z",
    });
    expect(JSON.stringify(mockStore)).not.toMatch(/secret|token|authorization/i);
  });
});

describe("mock commerce connector", () => {
  it("executes the same refund idempotency key once", async () => {
    const connector = createMockCommerceConnector();
    const command = refundExecutionCommand({ idempotencyKey: "refund:proposal-1" });

    const first = await connector.executeAction(command);
    const second = await connector.executeAction(command);

    expect(first).toEqual(second);
    expect(second).toBe(first);
    expect(connector.executionCount("refund:proposal-1")).toBe(1);
  });

  it.each([
    {
      drift: "version",
      order: createOrderSnapshot({
        ...mockDeliveredOrder,
        version: 2,
        updatedAt: toIsoTimestamp("2026-07-11T01:01:00.000Z"),
      }),
    },
    {
      drift: "status",
      order: createOrderSnapshot({
        ...mockDeliveredOrder,
        status: "refunded",
        updatedAt: toIsoTimestamp("2026-07-11T01:01:00.000Z"),
      }),
    },
    {
      drift: "refundable amount",
      order: createOrderSnapshot({
        ...mockDeliveredOrder,
        refundable: createMoney(6_400, "CNY"),
        updatedAt: toIsoTimestamp("2026-07-11T01:01:00.000Z"),
      }),
    },
  ])("blocks $drift at the adapter precondition gate before an effect", async ({ order }) => {
    const connector = createMockCommerceConnector();
    const command = refundExecutionCommand({
      idempotencyKey: `refund:precondition-${order.status}-${order.version}`,
    });
    connector.setOrder(order);

    await expectConnectorError(connector.executeAction(command), "MOCK_PRECONDITION_FAILED");

    expect(connector.executionCount(command.idempotencyKey)).toBe(0);
  });

  it("rejects a requested refund above the observed refundable amount", async () => {
    const connector = createMockCommerceConnector();
    const original = refundExecutionCommand({ idempotencyKey: "refund:requested-too-high" });
    const command = refundExecutionCommand({
      idempotencyKey: original.idempotencyKey,
      payload: {
        ...original.payload,
        amount: createMoney(12_801, "CNY"),
      },
    });

    await expectConnectorError(connector.executeAction(command), "MOCK_PRECONDITION_FAILED");
    expect(connector.executionCount(command.idempotencyKey)).toBe(0);
  });

  it("returns a completed identical idempotency key before checking later order drift", async () => {
    const connector = createMockCommerceConnector();
    const command = refundExecutionCommand({ idempotencyKey: "refund:completed-before-drift" });
    const completed = await connector.executeAction(command);
    connector.setOrder(
      createOrderSnapshot({
        ...mockDeliveredOrder,
        version: 2,
        updatedAt: toIsoTimestamp("2026-07-11T01:01:00.000Z"),
      }),
    );

    expect(await connector.executeAction(command)).toBe(completed);
    expect(connector.executionCount(command.idempotencyKey)).toBe(1);
  });

  it("blocks an order change after application getOrder but before the adapter effect", async () => {
    const runtime = createDemoRuntime();
    const connector = createMockCommerceConnector();
    const raceProposalId = createProposalId("proposal-adapter-race");
    const proposal = createActionProposal({
      proposalId: raceProposalId,
      companyId: mockCompanyId,
      storeId: mockStoreId,
      conversationId: mockDamagedItemConversation.conversationId,
      payload: refundExecutionCommand().payload,
      createdAt: "2026-07-11T01:05:00.000Z",
      expiresAt: "2026-07-11T01:30:00.000Z",
    });
    const approved = approveProposal(
      proposal,
      Object.freeze({ userId: createUserId("supervisor-race"), role: "supervisor" }),
      "2026-07-11T01:10:00.000Z",
    );
    const context = Object.freeze({
      companyId: mockCompanyId,
      correlationId: "correlation-adapter-race",
      causationId: "causation-adapter-race",
    });
    await runtime.repositories.proposals.save(context, proposal);
    await runtime.unitOfWork.run(context, (repositories) =>
      repositories.proposals.replace(context, approved, proposal.version),
    );
    const racingConnector: CommerceConnector = Object.freeze({
      getCapabilities: connector.getCapabilities,
      async getOrder(command: GetOrderCommand) {
        const observed = await connector.getOrder(command);
        connector.setOrder(
          createOrderSnapshot({
            ...mockDeliveredOrder,
            version: 2,
            updatedAt: toIsoTimestamp("2026-07-11T01:11:00.000Z"),
          }),
        );
        return observed;
      },
      executeAction: connector.executeAction,
      findActionResult: connector.findActionResult,
    });
    const useCase = createExecuteActionUseCase({
      repositories: runtime.repositories,
      unitOfWork: runtime.unitOfWork,
      commerceConnector: racingConnector,
      clock: new FixedClock(new Date("2026-07-11T01:11:00.000Z")),
    });

    const result = await useCase.execute({
      companyId: mockCompanyId,
      proposalId: raceProposalId,
      actor: { id: "supervisor-race", role: "supervisor" },
      correlationId: context.correlationId,
      causationId: context.causationId,
    });

    expect(result).toMatchObject({ status: "needs_human", reason: "EXECUTION_UNCONFIRMED" });
    expect(connector.executionCount(`refund:${raceProposalId}`)).toBe(0);
  });

  it("coalesces concurrent executions for the same idempotency key", async () => {
    const connector = createMockCommerceConnector();
    const command = refundExecutionCommand({ idempotencyKey: "refund:concurrent" });

    const [first, second] = await Promise.all([
      connector.executeAction(command),
      connector.executeAction(command),
    ]);

    expect(first).toEqual(second);
    expect(second).toBe(first);
    expect(connector.executionCount(command.idempotencyKey)).toBe(1);
  });

  it("does not claim FlyPigeon send access", async () => {
    const connector = createMockCommerceConnector();

    const capabilities = await connector.getCapabilities(mockStoreId);

    expect(capabilities).toContainEqual({
      capability: "message.send",
      status: "waiting_qualification",
      reason: "普通自用型应用未开放飞鸽消息收发 API",
    });
  });

  it("returns the exact immutable capability matrix", async () => {
    const connector = createMockCommerceConnector();

    const first = await connector.getCapabilities(mockStoreId);

    expect(first).toEqual(expectedCapabilities);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.every(Object.isFrozen)).toBe(true);
    expect(Reflect.set(first, "0", { capability: "message.send", status: "available" })).toBe(
      false,
    );
    const messageSend = first[5];
    if (messageSend === undefined) {
      throw new Error("Expected message.send capability fixture");
    }
    expect(Reflect.set(messageSend, "status", "available")).toBe(false);
    expect(await connector.getCapabilities(mockStoreId)).toEqual(expectedCapabilities);
  });

  it("exposes capabilities as a readonly collection through the connector port", async () => {
    const connector: CommerceConnector = createMockCommerceConnector();
    const capabilities = await connector.getCapabilities(mockStoreId);

    expect(Object.isFrozen(capabilities)).toBe(true);
    if (!Object.isFrozen(capabilities)) {
      // @ts-expect-error The connector port must not expose a mutable capability collection.
      capabilities.push(expectedCapabilities[0]);
    }
  });

  it("rejects capabilities for an unknown store", async () => {
    const connector = createMockCommerceConnector();

    await expectConnectorError(
      connector.getCapabilities(createStoreId("store-unknown")),
      "MOCK_STORE_NOT_FOUND",
    );
  });

  it("keeps connector instances isolated", async () => {
    const firstConnector = createMockCommerceConnector();
    const secondConnector = createMockCommerceConnector();
    const command = refundExecutionCommand({ idempotencyKey: "refund:isolated" });

    await firstConnector.executeAction(command);
    firstConnector.setOrder(
      createOrderSnapshotForTest({ version: 2, updatedAt: "2026-07-11T01:05:00.000Z" }),
    );

    expect(firstConnector.executionCount(command.idempotencyKey)).toBe(1);
    expect(secondConnector.executionCount(command.idempotencyKey)).toBe(0);
    expect(await secondConnector.findActionResult(command.idempotencyKey)).toBeNull();
    expect(
      (await secondConnector.getOrder({ storeId: mockStoreId, orderId: mockOrderId })).version,
    ).toBe(1);
  });

  it("reads the seeded immutable order", async () => {
    const connector = createMockCommerceConnector();

    const order = await connector.getOrder({ storeId: mockStoreId, orderId: mockOrderId });

    expect(order).toEqual(mockDeliveredOrder);
    expect(Object.isFrozen(order)).toBe(true);
    expect(Object.isFrozen(order.total)).toBe(true);
    expect(Object.isFrozen(order.refundable)).toBe(true);
  });

  it.each([
    { input: "null command", command: null as never },
    { input: "undefined command", command: undefined as never },
    {
      input: "undefined store ID",
      command: { storeId: undefined as never, orderId: mockOrderId },
    },
    {
      input: "blank store ID",
      command: { storeId: "  " as GetOrderCommand["storeId"], orderId: mockOrderId },
    },
    {
      input: "undefined order ID",
      command: { storeId: mockStoreId, orderId: undefined as never },
    },
    {
      input: "blank order ID",
      command: { storeId: mockStoreId, orderId: "\t" as GetOrderCommand["orderId"] },
    },
  ])("rejects malformed getOrder $input as an invalid command", async ({ command }) => {
    const connector = createMockCommerceConnector();

    await expectConnectorError(connector.getOrder(command), "MOCK_INVALID_COMMAND");
  });

  it("returns stable errors for missing orders and store mismatches", async () => {
    const connector = createMockCommerceConnector();

    await expectConnectorError(
      connector.getOrder({
        storeId: mockStoreId,
        orderId: createOrderId("order-missing"),
      }),
      "MOCK_ORDER_NOT_FOUND",
    );
    await expectConnectorError(
      connector.getOrder({
        storeId: createStoreId("store-other"),
        orderId: mockOrderId,
      }),
      "MOCK_ORDER_NOT_FOUND",
    );
  });

  it("snapshots setOrder input before exposing a new version", async () => {
    const connector = createMockCommerceConnector();
    const mutableRefundable = { amountMinor: 6_400, currency: "CNY" as const };
    const inputAlias = {
      ...mockDeliveredOrder,
      version: 2,
      refundable: mutableRefundable,
      updatedAt: toIsoTimestamp("2026-07-11T01:05:00.000Z"),
    };

    connector.setOrder(inputAlias as OrderSnapshot);
    inputAlias.version = 99;
    mutableRefundable.amountMinor = 1;

    const order = await connector.getOrder({ storeId: mockStoreId, orderId: mockOrderId });
    expect(order.version).toBe(2);
    expect(order.refundable).toEqual(createMoney(6_400, "CNY"));
    expect(Object.isFrozen(order.refundable)).toBe(true);
  });

  it.each([
    {
      identity: "company",
      snapshot: createOrderSnapshot({
        ...mockDeliveredOrder,
        companyId: createCompanyId("company-foreign"),
        version: 2,
      }),
    },
    {
      identity: "store",
      snapshot: createOrderSnapshot({
        ...mockDeliveredOrder,
        storeId: createStoreId("store-foreign"),
        version: 2,
      }),
    },
    {
      identity: "order",
      snapshot: createOrderSnapshot({
        ...mockDeliveredOrder,
        orderId: createOrderId("order-foreign"),
        version: 2,
      }),
    },
  ])("rejects a frozen $identity identity drift without changing seeded behavior", async ({
    identity,
    snapshot,
  }) => {
    const connector = createMockCommerceConnector();

    await expectConnectorError(
      Promise.resolve().then(() => {
        connector.setOrder(snapshot);
        return snapshot;
      }),
      "MOCK_INVALID_ORDER",
    );

    expect(await connector.getOrder({ storeId: mockStoreId, orderId: mockOrderId })).toEqual(
      mockDeliveredOrder,
    );
    expect(await connector.getCapabilities(mockStoreId)).toEqual(expectedCapabilities);
    const command = refundExecutionCommand({ idempotencyKey: `refund:identity-${identity}` });
    expect((await connector.executeAction(command)).status).toBe("succeeded");
    expect(connector.executionCount(command.idempotencyKey)).toBe(1);
  });

  it("finds an execution result only after execution", async () => {
    const connector = createMockCommerceConnector();
    const command = refundExecutionCommand({ idempotencyKey: "refund:find" });

    expect(await connector.findActionResult(command.idempotencyKey)).toBeNull();

    const executed = await connector.executeAction(command);

    expect(await connector.findActionResult(command.idempotencyKey)).toBe(executed);
  });

  it("fails closed when the same key is reused for a different action", async () => {
    const connector = createMockCommerceConnector();
    const idempotencyKey = "refund:conflict";
    const firstCommand = refundExecutionCommand({ idempotencyKey });
    const conflictingCommand = refundExecutionCommand({
      idempotencyKey,
      proposalId: createProposalId("proposal-conflicting"),
    });
    const firstResult = await connector.executeAction(firstCommand);

    await expectConnectorError(
      connector.executeAction(conflictingCommand),
      "MOCK_IDEMPOTENCY_CONFLICT",
    );

    expect(connector.executionCount(idempotencyKey)).toBe(1);
    expect(await connector.findActionResult(idempotencyKey)).toBe(firstResult);
  });

  it("executes different idempotency keys independently", async () => {
    const connector = createMockCommerceConnector();
    const first = await connector.executeAction(
      refundExecutionCommand({ idempotencyKey: "refund:independent-1" }),
    );
    const second = await connector.executeAction(
      refundExecutionCommand({ idempotencyKey: "refund:independent-2" }),
    );

    expect(first.executionId).not.toBe(second.executionId);
    expect(first.externalReference).not.toBe(second.externalReference);
    expect(connector.executionCount("refund:independent-1")).toBe(1);
    expect(connector.executionCount("refund:independent-2")).toBe(1);
  });

  it.each(["", "   ", "\t\n"])("rejects blank idempotency key %j", async (idempotencyKey) => {
    const connector = createMockCommerceConnector();

    await expectConnectorError(
      connector.executeAction(refundExecutionCommand({ idempotencyKey })),
      "MOCK_INVALID_COMMAND",
    );

    expect(connector.executionCount(idempotencyKey)).toBe(0);
  });

  it("rejects a forged refund Money value", async () => {
    const connector = createMockCommerceConnector();
    const command = refundExecutionCommand({ idempotencyKey: "refund:invalid-money" });
    const forgedCommand = {
      ...command,
      payload: {
        ...command.payload,
        amount: { ...command.payload.amount, amountMinor: -1 },
      },
    } as ExecuteActionCommand;

    await expectConnectorError(connector.executeAction(forgedCommand), "MOCK_INVALID_COMMAND");
    expect(connector.executionCount(command.idempotencyKey)).toBe(0);
  });

  it("rejects new actions whose store or order is not seeded", async () => {
    const connector = createMockCommerceConnector();
    const wrongStore = refundExecutionCommand({
      idempotencyKey: "refund:wrong-store",
      storeId: createStoreId("store-other"),
    });
    const original = refundExecutionCommand({ idempotencyKey: "refund:wrong-order" });
    const wrongOrder = refundExecutionCommand({
      idempotencyKey: original.idempotencyKey,
      payload: { ...original.payload, orderId: "order-other" },
    });

    await expectConnectorError(connector.executeAction(wrongStore), "MOCK_ORDER_NOT_FOUND");
    await expectConnectorError(connector.executeAction(wrongOrder), "MOCK_ORDER_NOT_FOUND");
  });

  it("returns a frozen result with deterministic identifiers and time", async () => {
    const connector = createMockCommerceConnector();
    const result = await connector.executeAction(
      refundExecutionCommand({ idempotencyKey: "refund:deterministic" }),
    );

    expect(result).toEqual({
      status: "succeeded",
      executionId: "mock-execution-0001",
      idempotencyKey: "refund:deterministic",
      externalReference: "mock-refund-0001",
      startedAt: "2026-07-11T01:30:00.000Z",
      completedAt: "2026-07-11T02:00:00.000Z",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Reflect.set(result, "externalReference", "mutated")).toBe(false);
    expect(await connector.findActionResult(result.idempotencyKey)).toBe(result);
  });
});

function createOrderSnapshotForTest(overrides: {
  readonly version: number;
  readonly updatedAt: string;
}): OrderSnapshot {
  return {
    ...mockDeliveredOrder,
    version: overrides.version,
    updatedAt: toIsoTimestamp(overrides.updatedAt),
  } as OrderSnapshot;
}
