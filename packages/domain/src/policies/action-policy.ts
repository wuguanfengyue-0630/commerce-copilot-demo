import type { CapabilityState } from "../platform/capabilities.ts";

export type ActionPolicyRole = "agent" | "supervisor" | "admin";

export type ActionRiskLevel = "low" | "medium" | "high";

export type DemoRefundRule = Readonly<{
  kind: "after_sale.refund";
  enabled: boolean;
}>;

export type PolicyEvaluation = Readonly<{
  allowed: boolean;
  requiresApproval: boolean;
  requiredRole: "supervisor" | null;
  riskLevel: ActionRiskLevel;
  reasons: readonly string[];
}>;

export type ActionPolicyInput = Readonly<{
  actionKind: string;
  actorRole: ActionPolicyRole;
  rules?: readonly DemoRefundRule[];
}>;

export type MessageSendMode = "direct" | "assisted";

export function evaluateActionPolicy(input: ActionPolicyInput): PolicyEvaluation {
  const matchingRefundRules =
    input.rules?.filter((rule) => rule.kind === "after_sale.refund") ?? [];
  const [onlyRefundRule] = matchingRefundRules;
  const hasEnabledDemoRefundRule =
    matchingRefundRules.length === 1 && onlyRefundRule?.enabled === true;

  if (input.actionKind !== "after_sale.refund" || !hasEnabledDemoRefundRule) {
    return createEvaluation({
      allowed: false,
      requiresApproval: false,
      requiredRole: null,
      riskLevel: "high",
      reasons: ["ACTION_DEFAULT_DENY"],
    });
  }

  if (input.actorRole === "agent") {
    return createEvaluation({
      allowed: false,
      requiresApproval: true,
      requiredRole: "supervisor",
      riskLevel: "high",
      reasons: ["ACTION_REQUIRES_SUPERVISOR_APPROVAL"],
    });
  }

  return createEvaluation({
    allowed: true,
    requiresApproval: true,
    requiredRole: "supervisor",
    riskLevel: "high",
    reasons: ["EXPLICIT_DEMO_REFUND_RULE", "HUMAN_APPROVAL_REQUIRED"],
  });
}

export function resolveMessageSendMode(states: readonly CapabilityState[]): MessageSendMode {
  const messageSendStates = states.filter((state) => state.capability === "message.send");
  const [onlyMessageSendState] = messageSendStates;
  const canSendDirectly =
    messageSendStates.length === 1 && onlyMessageSendState?.status === "available";

  return canSendDirectly ? "direct" : "assisted";
}

function createEvaluation(evaluation: PolicyEvaluation): PolicyEvaluation {
  return Object.freeze({
    ...evaluation,
    reasons: Object.freeze([...evaluation.reasons]),
  });
}
