import type { IsoTimestamp } from "../shared/clock.ts";
import type { CompanyId, OrderId, StoreId } from "../shared/ids.ts";
import type { Money } from "../shared/money.ts";

export const ORDER_STATUSES = ["paid", "shipped", "delivered", "cancelled", "refunded"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

declare const orderSnapshotBrand: unique symbol;

export type OrderSnapshot = Readonly<{
  companyId: CompanyId;
  storeId: StoreId;
  orderId: OrderId;
  version: number;
  status: OrderStatus;
  total: Money;
  refundable: Money;
  updatedAt: IsoTimestamp;
  [orderSnapshotBrand]: true;
}>;

export type OrderSnapshotInput = {
  companyId: CompanyId;
  storeId: StoreId;
  orderId: OrderId;
  version: number;
  status: OrderStatus;
  total: Money;
  refundable: Money;
  updatedAt: IsoTimestamp;
};

export function createOrderSnapshot(input: OrderSnapshotInput): OrderSnapshot {
  return Object.freeze({
    companyId: input.companyId,
    storeId: input.storeId,
    orderId: input.orderId,
    version: input.version,
    status: input.status,
    total: input.total,
    refundable: input.refundable,
    updatedAt: input.updatedAt,
  }) as OrderSnapshot;
}
