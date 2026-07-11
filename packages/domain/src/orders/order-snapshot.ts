import type { CompanyId, OrderId, StoreId } from "../shared/ids.ts";
import type { Money } from "../shared/money.ts";

export const ORDER_STATUSES = ["paid", "shipped", "delivered", "cancelled", "refunded"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderSnapshot = Readonly<{
  companyId: CompanyId;
  storeId: StoreId;
  orderId: OrderId;
  version: number;
  status: OrderStatus;
  total: Money;
  refundable: Money;
  updatedAt: Date;
}>;
