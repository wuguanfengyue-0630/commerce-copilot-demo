import type { ExecuteActionCommand } from "@commerce-copilot/application";
import {
  type AfterSaleRefundPayload,
  createCompanyId,
  createConversation,
  createConversationId,
  createCustomerId,
  createMessageId,
  createMoney,
  createOrderId,
  createOrderSnapshot,
  createProposalId,
  createStoreId,
  type DemoRefundRule,
  type IsoTimestamp,
  toIsoTimestamp,
} from "@commerce-copilot/domain";

const mockFixtureTimestamp = toIsoTimestamp("2026-07-11T01:00:00.000Z");

export const mockCompanyId = createCompanyId("company-demo");
export const mockStoreId = createStoreId("store-douyin-demo");
export const mockOrderId = createOrderId("order-delivered-12800");
export const mockProposalId = createProposalId("proposal-damaged-item-refund-1");

export type MockStoreFixture = Readonly<{
  companyId: typeof mockCompanyId;
  storeId: typeof mockStoreId;
  platform: "douyin";
  displayName: string;
}>;

export const mockStore: MockStoreFixture = Object.freeze({
  companyId: mockCompanyId,
  storeId: mockStoreId,
  platform: "douyin",
  displayName: "抖音电商演示店",
});

export const mockDeliveredOrder = createOrderSnapshot({
  companyId: mockCompanyId,
  storeId: mockStoreId,
  orderId: mockOrderId,
  version: 1,
  status: "delivered",
  total: createMoney(12_800, "CNY"),
  refundable: createMoney(12_800, "CNY"),
  updatedAt: mockFixtureTimestamp,
});

const mockConversationId = createConversationId("conversation-damaged-item-1");

export const mockDamagedItemConversation = createConversation({
  companyId: mockCompanyId,
  storeId: mockStoreId,
  conversationId: mockConversationId,
  customerId: createCustomerId("customer-demo-1"),
  messages: [
    {
      messageId: createMessageId("message-damaged-item-1"),
      conversationId: mockConversationId,
      role: "customer",
      origin: "platform",
      content: "商品破损，申请退款",
      occurredAt: mockFixtureTimestamp,
    },
  ],
  createdAt: mockFixtureTimestamp,
  updatedAt: mockFixtureTimestamp,
});

export type MockSupervisorApprovalRule = Readonly<{
  actionKind: "after_sale.refund";
  requiresApproval: true;
  requiredRole: "supervisor";
}>;

export const mockSupervisorApprovalRule: MockSupervisorApprovalRule = Object.freeze({
  actionKind: "after_sale.refund",
  requiresApproval: true,
  requiredRole: "supervisor",
});

const mockRefundRule = Object.freeze({
  kind: "after_sale.refund",
  enabled: true,
}) satisfies DemoRefundRule;

export type MockDamagedItemRefundPolicy = Readonly<{
  policyId: string;
  title: string;
  status: "published";
  version: number;
  refundRule: DemoRefundRule;
  approvalRule: MockSupervisorApprovalRule;
  publishedAt: IsoTimestamp;
}>;

export const mockDamagedItemRefundPolicy: MockDamagedItemRefundPolicy = Object.freeze({
  policyId: "policy-damaged-item-refund-v1",
  title: "破损商品退款政策",
  status: "published",
  version: 1,
  refundRule: mockRefundRule,
  approvalRule: mockSupervisorApprovalRule,
  publishedAt: mockFixtureTimestamp,
});

const mockRefundPayload = Object.freeze({
  kind: "after_sale.refund",
  orderId: mockOrderId,
  amount: createMoney(12_800, "CNY"),
  reasonCode: "damaged_item",
  observedOrderVersion: mockDeliveredOrder.version,
  observedOrderStatus: "delivered",
  observedRefundableAmount: createMoney(12_800, "CNY"),
}) satisfies Readonly<AfterSaleRefundPayload>;

export type RefundExecutionCommandOverrides = Readonly<{
  storeId?: ExecuteActionCommand["storeId"];
  proposalId?: ExecuteActionCommand["proposalId"];
  payload?: ExecuteActionCommand["payload"];
  idempotencyKey?: string;
  executionStartedAt?: IsoTimestamp;
}>;

export function refundExecutionCommand(
  overrides: RefundExecutionCommandOverrides = {},
): ExecuteActionCommand {
  const sourcePayload = overrides.payload ?? mockRefundPayload;
  const payload = Object.freeze({
    kind: sourcePayload.kind,
    orderId: sourcePayload.orderId,
    amount: createMoney(sourcePayload.amount.amountMinor, sourcePayload.amount.currency),
    reasonCode: sourcePayload.reasonCode,
    observedOrderVersion: sourcePayload.observedOrderVersion,
    observedOrderStatus: sourcePayload.observedOrderStatus,
    observedRefundableAmount: createMoney(
      sourcePayload.observedRefundableAmount.amountMinor,
      sourcePayload.observedRefundableAmount.currency,
    ),
  });

  return Object.freeze({
    storeId: overrides.storeId ?? mockStoreId,
    proposalId: overrides.proposalId ?? mockProposalId,
    payload,
    idempotencyKey: overrides.idempotencyKey ?? `refund:${mockProposalId}`,
    executionStartedAt: overrides.executionStartedAt ?? toIsoTimestamp("2026-07-11T01:30:00.000Z"),
  });
}
