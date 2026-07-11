import type {
  CommerceConnector,
  ExecuteActionCommand,
  ExecutionResult,
  GetOrderCommand,
} from "@commerce-copilot/application";
import {
  type CapabilityState,
  createMoney,
  createOrderSnapshot,
  ORDER_STATUSES,
  type OrderSnapshot,
  type StoreId,
  toIsoTimestamp,
} from "@commerce-copilot/domain";
import { mockCompanyId, mockDeliveredOrder, mockOrderId, mockStoreId } from "./mock-fixtures.ts";

export const MOCK_COMMERCE_CONNECTOR_ERROR_CODES = [
  "MOCK_STORE_NOT_FOUND",
  "MOCK_ORDER_NOT_FOUND",
  "MOCK_INVALID_COMMAND",
  "MOCK_INVALID_ORDER",
  "MOCK_IDEMPOTENCY_CONFLICT",
] as const;

export type MockCommerceConnectorErrorCode = (typeof MOCK_COMMERCE_CONNECTOR_ERROR_CODES)[number];

export class MockCommerceConnectorError extends Error {
  readonly code: MockCommerceConnectorErrorCode;

  constructor(code: MockCommerceConnectorErrorCode) {
    super(code);
    this.name = "MockCommerceConnectorError";
    this.code = code;
  }
}

export interface MockCommerceConnector extends CommerceConnector {
  executionCount(idempotencyKey: string): number;
  setOrder(snapshot: OrderSnapshot): void;
}

type ExecutionRecord = Readonly<{
  command: ExecuteActionCommand;
  result: ExecutionResult;
}>;

const capabilityFixtures = [
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
] as const satisfies readonly CapabilityState[];

const mockCompletionTime = toIsoTimestamp("2026-07-11T02:00:00.000Z");

export function createMockCommerceConnector(): MockCommerceConnector {
  let currentOrder = snapshotOrder(mockDeliveredOrder);
  let nextExecutionNumber = 1;
  const executions = new Map<string, ExecutionRecord>();

  return Object.freeze({
    async getCapabilities(storeId: StoreId): Promise<readonly CapabilityState[]> {
      if (storeId !== mockStoreId) {
        throw new MockCommerceConnectorError("MOCK_STORE_NOT_FOUND");
      }

      return Object.freeze(capabilityFixtures.map((state) => Object.freeze({ ...state })));
    },

    async getOrder(command: GetOrderCommand): Promise<OrderSnapshot> {
      const commandSnapshot = snapshotGetOrderCommand(command);
      if (commandSnapshot.storeId !== mockStoreId || commandSnapshot.orderId !== mockOrderId) {
        throw new MockCommerceConnectorError("MOCK_ORDER_NOT_FOUND");
      }

      return currentOrder;
    },

    async executeAction(command: ExecuteActionCommand): Promise<ExecutionResult> {
      const commandSnapshot = snapshotCommand(command);
      const existing = executions.get(commandSnapshot.idempotencyKey);

      if (existing !== undefined) {
        if (!isSameAction(existing.command, commandSnapshot)) {
          throw new MockCommerceConnectorError("MOCK_IDEMPOTENCY_CONFLICT");
        }

        return existing.result;
      }

      if (
        commandSnapshot.storeId !== mockStoreId ||
        commandSnapshot.payload.orderId !== mockOrderId
      ) {
        throw new MockCommerceConnectorError("MOCK_ORDER_NOT_FOUND");
      }

      const executionNumber = String(nextExecutionNumber).padStart(4, "0");
      const result: ExecutionResult = Object.freeze({
        status: "succeeded",
        executionId: `mock-execution-${executionNumber}`,
        idempotencyKey: commandSnapshot.idempotencyKey,
        externalReference: `mock-refund-${executionNumber}`,
        completedAt: mockCompletionTime,
      });
      const record: ExecutionRecord = Object.freeze({ command: commandSnapshot, result });
      executions.set(commandSnapshot.idempotencyKey, record);
      nextExecutionNumber += 1;

      return result;
    },

    async findActionResult(idempotencyKey: string): Promise<ExecutionResult | null> {
      return executions.get(idempotencyKey)?.result ?? null;
    },

    executionCount(idempotencyKey: string): number {
      return executions.has(idempotencyKey) ? 1 : 0;
    },

    setOrder(snapshot: OrderSnapshot): void {
      currentOrder = snapshotOrder(snapshot);
    },
  });
}

function snapshotGetOrderCommand(command: GetOrderCommand): GetOrderCommand {
  try {
    if (
      command === null ||
      command === undefined ||
      typeof command !== "object" ||
      Array.isArray(command) ||
      !isNonBlank(command.storeId) ||
      !isNonBlank(command.orderId)
    ) {
      throw new Error("invalid command");
    }

    return Object.freeze({
      storeId: command.storeId,
      orderId: command.orderId,
    });
  } catch {
    throw new MockCommerceConnectorError("MOCK_INVALID_COMMAND");
  }
}

function snapshotOrder(snapshot: OrderSnapshot): OrderSnapshot {
  try {
    if (
      !isNonBlank(snapshot.companyId) ||
      !isNonBlank(snapshot.storeId) ||
      !isNonBlank(snapshot.orderId) ||
      snapshot.companyId !== mockCompanyId ||
      snapshot.storeId !== mockStoreId ||
      snapshot.orderId !== mockOrderId ||
      !Number.isSafeInteger(snapshot.version) ||
      snapshot.version < 1 ||
      !ORDER_STATUSES.some((status) => status === snapshot.status)
    ) {
      throw new Error("invalid order");
    }

    const updatedAt = toIsoTimestamp(snapshot.updatedAt);
    if (updatedAt !== snapshot.updatedAt) {
      throw new Error("invalid order timestamp");
    }

    return createOrderSnapshot({
      companyId: snapshot.companyId,
      storeId: snapshot.storeId,
      orderId: snapshot.orderId,
      version: snapshot.version,
      status: snapshot.status,
      total: createMoney(snapshot.total.amountMinor, snapshot.total.currency),
      refundable: createMoney(snapshot.refundable.amountMinor, snapshot.refundable.currency),
      updatedAt,
    });
  } catch {
    throw new MockCommerceConnectorError("MOCK_INVALID_ORDER");
  }
}

function snapshotCommand(command: ExecuteActionCommand): ExecuteActionCommand {
  try {
    const payload = command.payload;
    if (
      !isNonBlank(command.storeId) ||
      !isNonBlank(command.proposalId) ||
      !isNonBlank(command.idempotencyKey) ||
      payload.kind !== "after_sale.refund" ||
      !isNonBlank(payload.orderId) ||
      payload.reasonCode !== "damaged_item" ||
      !isNonBlank(payload.observedOrderVersion) ||
      !isObservedOrderStatus(payload.observedOrderStatus)
    ) {
      throw new Error("invalid command");
    }

    return Object.freeze({
      storeId: command.storeId,
      proposalId: command.proposalId,
      idempotencyKey: command.idempotencyKey,
      payload: Object.freeze({
        kind: payload.kind,
        orderId: payload.orderId,
        amount: createMoney(payload.amount.amountMinor, payload.amount.currency),
        reasonCode: payload.reasonCode,
        observedOrderVersion: payload.observedOrderVersion,
        observedOrderStatus: payload.observedOrderStatus,
        observedRefundableAmount: createMoney(
          payload.observedRefundableAmount.amountMinor,
          payload.observedRefundableAmount.currency,
        ),
      }),
    });
  } catch {
    throw new MockCommerceConnectorError("MOCK_INVALID_COMMAND");
  }
}

function isObservedOrderStatus(status: string): status is "paid" | "shipped" | "delivered" {
  return status === "paid" || status === "shipped" || status === "delivered";
}

function isNonBlank(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isSameAction(first: ExecuteActionCommand, second: ExecuteActionCommand): boolean {
  return (
    first.storeId === second.storeId &&
    first.proposalId === second.proposalId &&
    first.payload.kind === second.payload.kind &&
    first.payload.orderId === second.payload.orderId &&
    first.payload.amount.amountMinor === second.payload.amount.amountMinor &&
    first.payload.amount.currency === second.payload.amount.currency &&
    first.payload.reasonCode === second.payload.reasonCode &&
    first.payload.observedOrderVersion === second.payload.observedOrderVersion &&
    first.payload.observedOrderStatus === second.payload.observedOrderStatus &&
    first.payload.observedRefundableAmount.amountMinor ===
      second.payload.observedRefundableAmount.amountMinor &&
    first.payload.observedRefundableAmount.currency ===
      second.payload.observedRefundableAmount.currency
  );
}
