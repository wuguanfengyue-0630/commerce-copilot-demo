import {
  CAPABILITY_STATUSES,
  CURRENCIES,
  MESSAGE_ORIGINS,
  MESSAGE_ROLES,
  ORDER_STATUSES,
  PLATFORM_CAPABILITIES,
} from "@commerce-copilot/domain";
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

export const currencySchema = z.enum(CURRENCIES);

export const moneySchema = z.strictObject({
  amountMinor: nonNegativeSafeIntegerSchema,
  currency: currencySchema,
});

export const platformCapabilitySchema = z.enum(PLATFORM_CAPABILITIES);
export const capabilityStatusSchema = z.enum(CAPABILITY_STATUSES);
export const conversationRoleSchema = z.enum(MESSAGE_ROLES);
export const messageOriginSchema = z.enum(MESSAGE_ORIGINS);
export const orderStatusSchema = z.enum(ORDER_STATUSES);

export const jsonValueSchema = z.json();
export const errorDetailsSchema = z.record(z.string(), jsonValueSchema);

export const errorEnvelopeSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
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
