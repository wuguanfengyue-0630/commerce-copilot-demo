import { describe, expect, it } from "vitest";

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
});
