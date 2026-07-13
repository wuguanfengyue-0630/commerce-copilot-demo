import { describe, expect, it } from "vitest";
import { workspaceResponseSchema } from "./demo-workflow.ts";
import * as contracts from "./index.ts";

const bootstrap = {
  schemaVersion: 1,
  actor: {
    userId: "user-demo-owner",
    displayName: "演示店主",
    role: "owner",
  },
  setup: { status: "incomplete", acceptedAt: null },
  store: {
    companyId: "company-demo",
    storeId: "store-douyin-demo",
    displayName: "抖音电商演示店",
    platform: "douyin",
  },
} as const;

const workspace = {
  schemaVersion: 1,
  workspace: {
    companyId: "company-demo",
    storeId: "store-douyin-demo",
    metrics: {
      openConversations: 1,
      waitingForAgent: 1,
      assistantSuggestions: 0,
      proposalsAwaitingApproval: 0,
      refundedAmount: { amountMinor: 0, currency: "CNY" },
      measuredAt: "2026-07-11T01:20:00.000Z",
    },
    integrations: [],
    activeRules: [],
    messageSendMode: "assisted",
    demoModel: { provider: "deterministic-demo", deterministic: true },
    evaluationSummary: { scenario: "damaged_item", status: "ready", score: 1 },
    setup: { status: "incomplete", acceptedAt: null },
  },
} as const;

describe("demo setup schemas", () => {
  it("exports canonical bootstrap and completion schemas", () => {
    const exported = contracts as typeof contracts & {
      demoBootstrapResponseSchema?: { safeParse(value: unknown): { success: boolean } };
      demoSetupCompleteResponseSchema?: { safeParse(value: unknown): { success: boolean } };
    };

    expect(exported.demoBootstrapResponseSchema?.safeParse(bootstrap).success).toBe(true);
    expect(
      exported.demoSetupCompleteResponseSchema?.safeParse({
        schemaVersion: 1,
        setup: { status: "complete", acceptedAt: "2026-07-11T01:05:00.000Z" },
      }).success,
    ).toBe(true);
  });

  it("rejects an allegedly complete setup without acceptedAt", () => {
    const exported = contracts as typeof contracts & {
      demoSetupCompleteResponseSchema?: { safeParse(value: unknown): { success: boolean } };
    };

    expect(
      exported.demoSetupCompleteResponseSchema?.safeParse({
        schemaVersion: 1,
        setup: { status: "complete", acceptedAt: null },
      }).success,
    ).toBe(false);
  });

  it("uses the same discriminated setup state in workspace responses", () => {
    expect(workspaceResponseSchema.safeParse(workspace).success).toBe(true);
    expect(
      workspaceResponseSchema.safeParse({
        ...workspace,
        workspace: {
          ...workspace.workspace,
          setup: { status: "complete", acceptedAt: null },
        },
      }).success,
    ).toBe(false);
    expect(
      workspaceResponseSchema.safeParse({
        ...workspace,
        workspace: {
          ...workspace.workspace,
          setup: { status: "incomplete", acceptedAt: "2026-07-11T01:05:00.000Z" },
        },
      }).success,
    ).toBe(false);
  });
});
