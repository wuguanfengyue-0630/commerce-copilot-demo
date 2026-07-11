import { describe, expect, it } from "vitest";
import type { CapabilityState, CapabilityStatus } from "../platform/capabilities.ts";
import {
  type ActionPolicyRole,
  type DemoRefundRule,
  evaluateActionPolicy,
  resolveMessageSendMode,
} from "./action-policy.ts";

const enabledDemoRefundRule = Object.freeze({
  kind: "after_sale.refund",
  enabled: true,
}) satisfies DemoRefundRule;

const disabledDemoRefundRule = Object.freeze({
  kind: "after_sale.refund",
  enabled: false,
}) satisfies DemoRefundRule;

describe("evaluateActionPolicy", () => {
  it.each([
    "after_sale.refund",
    "order.cancel",
    "message.send",
  ])("denies the %s write action when no explicit rule exists", (actionKind) => {
    expect(
      evaluateActionPolicy({
        actionKind,
        actorRole: "admin",
        rules: [],
      }),
    ).toEqual({
      allowed: false,
      requiresApproval: false,
      requiredRole: null,
      riskLevel: "high",
      reasons: ["ACTION_DEFAULT_DENY"],
    });
  });

  it("does not let a disabled demo refund rule enable writes", () => {
    expect(
      evaluateActionPolicy({
        actionKind: "after_sale.refund",
        actorRole: "admin",
        rules: [{ kind: "after_sale.refund", enabled: false }],
      }).allowed,
    ).toBe(false);
  });

  it.each<ActionPolicyRole>([
    "supervisor",
    "admin",
  ])("lets a %s approve an explicitly enabled demo refund", (actorRole) => {
    expect(
      evaluateActionPolicy({
        actionKind: "after_sale.refund",
        actorRole,
        rules: [enabledDemoRefundRule],
      }),
    ).toEqual({
      allowed: true,
      requiresApproval: true,
      requiredRole: "supervisor",
      riskLevel: "high",
      reasons: ["EXPLICIT_DEMO_REFUND_RULE", "HUMAN_APPROVAL_REQUIRED"],
    });
  });

  it("does not let an agent approve an explicitly enabled demo refund", () => {
    expect(
      evaluateActionPolicy({
        actionKind: "after_sale.refund",
        actorRole: "agent",
        rules: [enabledDemoRefundRule],
      }),
    ).toEqual({
      allowed: false,
      requiresApproval: true,
      requiredRole: "supervisor",
      riskLevel: "high",
      reasons: ["ACTION_REQUIRES_SUPERVISOR_APPROVAL"],
    });
  });

  it.each(["owner", ""])("fails closed for unknown runtime role %j", (runtimeRole) => {
    expect(
      evaluateActionPolicy({
        actionKind: "after_sale.refund",
        actorRole: runtimeRole as ActionPolicyRole,
        rules: [enabledDemoRefundRule],
      }),
    ).toEqual({
      allowed: false,
      requiresApproval: true,
      requiredRole: "supervisor",
      riskLevel: "high",
      reasons: ["ACTION_REQUIRES_SUPERVISOR_APPROVAL"],
    });
  });

  it("does not let the refund rule enable a different write action", () => {
    expect(
      evaluateActionPolicy({
        actionKind: "order.cancel",
        actorRole: "admin",
        rules: [enabledDemoRefundRule],
      }).allowed,
    ).toBe(false);
  });

  it.each([
    [enabledDemoRefundRule, disabledDemoRefundRule],
    [disabledDemoRefundRule, enabledDemoRefundRule],
    [enabledDemoRefundRule, enabledDemoRefundRule],
  ])("fails closed when refund rules conflict or are duplicated", (...rules) => {
    expect(
      evaluateActionPolicy({
        actionKind: "after_sale.refund",
        actorRole: "admin",
        rules,
      }),
    ).toEqual({
      allowed: false,
      requiresApproval: false,
      requiredRole: null,
      riskLevel: "high",
      reasons: ["ACTION_DEFAULT_DENY"],
    });
  });

  it("does not expose model-reported confidence", () => {
    const evaluation = evaluateActionPolicy({
      actionKind: "after_sale.refund",
      actorRole: "supervisor",
      rules: [enabledDemoRefundRule],
    });

    expect(evaluation).not.toHaveProperty("confidence");
  });
});

describe("resolveMessageSendMode", () => {
  it("uses direct mode only when message.send is available", () => {
    const states: readonly CapabilityState[] = [
      { capability: "message.send", status: "available" },
    ];

    expect(resolveMessageSendMode(states)).toBe("direct");
  });

  it.each<CapabilityStatus>([
    "waiting_qualification",
    "unavailable",
    "degraded",
  ])("uses assisted mode when message.send is %s", (status) => {
    const states: readonly CapabilityState[] = [{ capability: "message.send", status }];

    expect(resolveMessageSendMode(states)).toBe("assisted");
  });

  it.each<CapabilityStatus>([
    "degraded",
    "unavailable",
  ])("fails closed for available plus %s in either order", (conflictingStatus) => {
    const availableFirst: readonly CapabilityState[] = [
      { capability: "message.send", status: "available" },
      { capability: "message.send", status: conflictingStatus },
    ];
    const availableLast: readonly CapabilityState[] = [...availableFirst].reverse();

    expect(resolveMessageSendMode(availableFirst)).toBe("assisted");
    expect(resolveMessageSendMode(availableLast)).toBe("assisted");
  });

  it("fails closed for duplicate available message.send states", () => {
    const states: readonly CapabilityState[] = [
      { capability: "message.send", status: "available" },
      { capability: "message.send", status: "available" },
    ];

    expect(resolveMessageSendMode(states)).toBe("assisted");
  });

  it("uses assisted mode when message.send capability state is missing", () => {
    const states: readonly CapabilityState[] = [
      { capability: "message.receive", status: "available" },
    ];

    expect(resolveMessageSendMode(states)).toBe("assisted");
  });
});
