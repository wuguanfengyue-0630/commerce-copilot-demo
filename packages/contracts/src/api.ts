import { z } from "zod";

export const schemaVersionSchema = z.literal(1);
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const nonBlankStringSchema = z.string().trim().min(1);
export const identifierSchema = nonBlankStringSchema;
export const nonNegativeSafeIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

export const currencySchema = z.literal("CNY");

export const moneySchema = z.strictObject({
  amountMinor: nonNegativeSafeIntegerSchema,
  currency: currencySchema,
});

export const platformCapabilitySchema = z.enum([
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
]);

export const capabilityStatusSchema = z.enum([
  "available",
  "unavailable",
  "waiting_qualification",
  "degraded",
]);

export const conversationRoleSchema = z.enum(["customer", "agent", "assistant", "system"]);
export const messageOriginSchema = z.enum(["platform", "human", "ai", "system"]);
export const orderStatusSchema = z.enum(["paid", "shipped", "delivered", "cancelled", "refunded"]);

export const jsonValueSchema = z.json();
export const errorDetailsSchema = z.record(z.string(), jsonValueSchema);

export const errorEnvelopeSchema = z.strictObject({
  error: z.strictObject({
    code: nonBlankStringSchema,
    message: nonBlankStringSchema,
    details: errorDetailsSchema.optional(),
  }),
});

export type SchemaVersion = z.infer<typeof schemaVersionSchema>;
export type IsoDateTime = z.infer<typeof isoDateTimeSchema>;
export type Currency = z.infer<typeof currencySchema>;
export type Money = z.infer<typeof moneySchema>;
export type PlatformCapability = z.infer<typeof platformCapabilitySchema>;
export type CapabilityStatus = z.infer<typeof capabilityStatusSchema>;
export type ConversationRole = z.infer<typeof conversationRoleSchema>;
export type MessageOrigin = z.infer<typeof messageOriginSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type JsonValue = z.infer<typeof jsonValueSchema>;
export type ErrorDetails = z.infer<typeof errorDetailsSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
