import { z } from "zod";

import {
  capabilityStatusSchema,
  conversationRoleSchema,
  currencySchema,
  identifierSchema,
  isoDateTimeSchema,
  messageOriginSchema,
  moneySchema,
  nonBlankStringSchema,
  nonNegativeSafeIntegerSchema,
  platformCapabilitySchema,
  schemaVersionSchema,
} from "./api.ts";

export const sessionUserSchema = z.strictObject({
  userId: identifierSchema,
  displayName: nonBlankStringSchema,
  role: z.enum(["owner", "manager", "agent"]),
});

export const sessionResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  session: z.strictObject({
    companyId: identifierSchema,
    selectedStoreId: identifierSchema,
    user: sessionUserSchema,
    expiresAt: isoDateTimeSchema,
  }),
});

export const setupResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  setup: z.strictObject({
    companyId: identifierSchema,
    storeId: identifierSchema,
    storeName: nonBlankStringSchema,
    timezone: nonBlankStringSchema,
    currency: currencySchema,
    completedAt: isoDateTimeSchema,
  }),
});

export const metricsResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  metrics: z.strictObject({
    openConversations: nonNegativeSafeIntegerSchema,
    waitingForAgent: nonNegativeSafeIntegerSchema,
    assistantSuggestions: nonNegativeSafeIntegerSchema,
    proposalsAwaitingApproval: nonNegativeSafeIntegerSchema,
    refundedAmount: moneySchema,
    measuredAt: isoDateTimeSchema,
  }),
});

export const capabilityEntrySchema = z.strictObject({
  capability: platformCapabilitySchema,
  status: capabilityStatusSchema,
});

export const integrationResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  integration: z.strictObject({
    storeId: identifierSchema,
    platform: z.literal("deterministic-demo"),
    displayName: nonBlankStringSchema,
    status: z.enum(["connected", "degraded", "disconnected"]),
    capabilities: z.array(capabilityEntrySchema),
    lastCheckedAt: isoDateTimeSchema,
  }),
});

export const customerSummarySchema = z.strictObject({
  customerId: identifierSchema,
  displayName: nonBlankStringSchema,
});

export const conversationSummarySchema = z.strictObject({
  companyId: identifierSchema,
  storeId: identifierSchema,
  conversationId: identifierSchema,
  customer: customerSummarySchema,
  status: z.enum(["open", "waiting_for_agent", "resolved"]),
  lastMessagePreview: z.string(),
  unreadCount: nonNegativeSafeIntegerSchema,
  updatedAt: isoDateTimeSchema,
});

export const conversationSummaryResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  conversations: z.array(conversationSummarySchema),
  generatedAt: isoDateTimeSchema,
});

export const conversationMessageSchema = z.strictObject({
  messageId: identifierSchema,
  role: conversationRoleSchema,
  origin: messageOriginSchema,
  content: z.string(),
  externalMessageId: nonBlankStringSchema.optional(),
  occurredAt: isoDateTimeSchema,
});

export const conversationDetailSchema = conversationSummarySchema.extend({
  messages: z.array(conversationMessageSchema),
});

export const conversationDetailResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  conversation: conversationDetailSchema,
});

export type SessionUser = z.infer<typeof sessionUserSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type SetupResponse = z.infer<typeof setupResponseSchema>;
export type MetricsResponse = z.infer<typeof metricsResponseSchema>;
export type CapabilityEntry = z.infer<typeof capabilityEntrySchema>;
export type IntegrationResponse = z.infer<typeof integrationResponseSchema>;
export type CustomerSummary = z.infer<typeof customerSummarySchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type ConversationSummaryResponse = z.infer<typeof conversationSummaryResponseSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;
export type ConversationDetailResponse = z.infer<typeof conversationDetailResponseSchema>;
