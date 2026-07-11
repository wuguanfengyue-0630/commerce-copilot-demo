import { describe, expect, it } from "vitest";
import { hasCapability } from "../platform/capabilities.ts";
import { FixedClock } from "./clock.ts";
import {
  createAuditEventId,
  createCompanyId,
  createConversationId,
  createCustomerId,
  createKnowledgeChunkId,
  createKnowledgeReleaseId,
  createMessageId,
  createOrderId,
  createProposalId,
  createStoreId,
  createSuggestionId,
  createUserId,
  type StoreId,
} from "./ids.ts";
import { createMoney } from "./money.ts";

describe("branded IDs", () => {
  const idConstructors = [
    createCompanyId,
    createStoreId,
    createUserId,
    createCustomerId,
    createConversationId,
    createMessageId,
    createOrderId,
    createProposalId,
    createSuggestionId,
    createKnowledgeReleaseId,
    createKnowledgeChunkId,
    createAuditEventId,
  ] as const;

  it.each(idConstructors)("rejects a blank identifier", (createId) => {
    expect(() => createId(" \t\n ")).toThrow("ID must not be blank");
  });

  it("keeps ID types distinct at compile time", () => {
    const companyId = createCompanyId("company-1");

    // @ts-expect-error CompanyId must not be assignable to StoreId.
    const storeId: StoreId = companyId;

    expect(storeId).toBe("company-1");
  });
});

describe("createMoney", () => {
  it("creates a CNY amount from minor units", () => {
    expect(createMoney(12_800, "CNY")).toEqual({
      amountMinor: 12_800,
      currency: "CNY",
    });
  });

  it.each([
    -1,
    1.2,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid minor-unit amount %s", (amountMinor) => {
    expect(() => createMoney(amountMinor, "CNY")).toThrow(
      "Money amountMinor must be a non-negative safe integer",
    );
  });
});

describe("hasCapability", () => {
  it("returns true only for an available capability", () => {
    expect(hasCapability("available")).toBe(true);
    expect(hasCapability("unavailable")).toBe(false);
    expect(hasCapability("waiting_qualification")).toBe(false);
    expect(hasCapability("degraded")).toBe(false);
  });
});

describe("FixedClock", () => {
  it("defensively copies both its input and returned dates", () => {
    const original = new Date("2026-07-11T01:02:03.000Z");
    const clock = new FixedClock(original);

    original.setUTCFullYear(2030);
    const firstReading = clock.now();
    firstReading.setUTCFullYear(2040);

    expect(clock.now()).toEqual(new Date("2026-07-11T01:02:03.000Z"));
    expect(clock.now()).not.toBe(firstReading);
  });
});
