export const PLATFORM_CAPABILITIES = [
  "store.authorize",
  "store.token.refresh",
  "catalog.product.read",
  "order.read",
  "logistics.read",
  "afterSale.read",
  "afterSale.write",
  "message.receive",
  "message.send",
  "event.subscribe",
  "event.verify",
] as const;

export type PlatformCapability = (typeof PLATFORM_CAPABILITIES)[number];

export const CAPABILITY_STATUSES = [
  "available",
  "unavailable",
  "waiting_qualification",
  "degraded",
] as const;

export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export function hasCapability(status: CapabilityStatus): boolean {
  return status === "available";
}
