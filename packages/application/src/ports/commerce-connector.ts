import type {
  AfterSaleRefundPayload,
  CapabilityState,
  IsoTimestamp,
  OrderId,
  OrderSnapshot,
  ProposalId,
  StoreId,
} from "@commerce-copilot/domain";

export type GetOrderCommand = Readonly<{
  storeId: StoreId;
  orderId: OrderId;
}>;

export type ExecuteActionCommand = Readonly<{
  storeId: StoreId;
  proposalId: ProposalId;
  payload: Readonly<AfterSaleRefundPayload>;
  idempotencyKey: string;
  executionStartedAt: IsoTimestamp;
}>;

export type ExecutionResult = Readonly<{
  status: "succeeded";
  executionId: string;
  idempotencyKey: string;
  externalReference: string;
  startedAt: IsoTimestamp;
  completedAt: IsoTimestamp;
}>;

export interface CommerceConnector {
  getCapabilities(storeId: StoreId): Promise<readonly CapabilityState[]>;
  getOrder(command: GetOrderCommand): Promise<OrderSnapshot>;
  executeAction(command: ExecuteActionCommand): Promise<ExecutionResult>;
  findActionResult(idempotencyKey: string): Promise<ExecutionResult | null>;
}
