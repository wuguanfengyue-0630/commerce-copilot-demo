import { z } from "zod";

import {
  capabilityStatusSchema,
  identifierSchema,
  isoDateTimeSchema,
  moneySchema,
  nonBlankStringSchema,
  nonNegativeSafeIntegerSchema,
  orderStatusSchema,
  platformCapabilitySchema,
  schemaVersionSchema,
} from "./api.ts";

export const capabilityMatrixEntrySchema = z.strictObject({
  capability: platformCapabilitySchema,
  status: capabilityStatusSchema,
  reason: nonBlankStringSchema.optional(),
});

export const capabilityMatrixSchema = z.strictObject({
  storeId: identifierSchema,
  entries: z.array(capabilityMatrixEntrySchema),
  evaluatedAt: isoDateTimeSchema,
});

export const deterministicDemoModelSchema = z.strictObject({
  mode: z.literal("deterministic-demo"),
  state: z.enum(["ready", "disabled", "degraded"]),
  seed: nonBlankStringSchema,
  temperature: z.literal(0),
  updatedAt: isoDateTimeSchema,
});

export const demoRefundRuleSchema = z.strictObject({
  kind: z.literal("after_sale.refund"),
  enabled: z.boolean(),
  maximumRefund: moneySchema,
  reasonCode: z.literal("damaged_item"),
  requiresHumanApproval: z.literal(true),
  eligibleOrderStatuses: z.array(orderStatusSchema).min(1),
  executionMode: z.literal("simulated"),
});

export const evaluationSummarySchema = z.strictObject({
  scenarioCount: nonNegativeSafeIntegerSchema,
  passedCount: nonNegativeSafeIntegerSchema,
  failedCount: nonNegativeSafeIntegerSchema,
  lastEvaluatedAt: isoDateTimeSchema,
});

export const settingsResponseSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  capabilityMatrix: capabilityMatrixSchema,
  model: deterministicDemoModelSchema,
  refundRule: demoRefundRuleSchema,
  evaluation: evaluationSummarySchema,
});

export type CapabilityMatrixEntry = z.infer<typeof capabilityMatrixEntrySchema>;
export type CapabilityMatrix = z.infer<typeof capabilityMatrixSchema>;
export type DeterministicDemoModel = z.infer<typeof deterministicDemoModelSchema>;
export type DemoRefundRule = z.infer<typeof demoRefundRuleSchema>;
export type EvaluationSummary = z.infer<typeof evaluationSummarySchema>;
export type SettingsResponse = z.infer<typeof settingsResponseSchema>;
