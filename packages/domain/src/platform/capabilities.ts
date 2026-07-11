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

export type CapabilityState = Readonly<{
  capability: PlatformCapability;
  status: CapabilityStatus;
  reason?: string;
}>;

export function hasCapability(
  states: readonly CapabilityState[],
  capability: PlatformCapability,
): boolean {
  return states.some((state) => state.capability === capability && state.status === "available");
}
