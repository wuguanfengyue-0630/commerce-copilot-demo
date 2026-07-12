import { describe, expect, it } from "vitest";
import {
  approvalDecisionRequestSchema,
  approvalDecisionResponseSchema,
  conversationDetailResponseSchema,
  executionResponseSchema,
} from "./index.ts";

describe("demo workflow contracts", () => {
  it("rejects browser-supplied actor identity", () => {
    expect(
      approvalDecisionRequestSchema.safeParse({
        outcome: "approved",
        proposalVersion: 1,
        actor: { userId: "attacker", role: "admin" },
      }).success,
    ).toBe(false);
  });

  it("keeps the legacy public names aligned with Task 8 response shapes", () => {
    expect(conversationDetailResponseSchema.shape.conversation.shape).toHaveProperty("order");
    expect(conversationDetailResponseSchema.shape.conversation.shape).toHaveProperty("proposal");
    expect(approvalDecisionResponseSchema.shape).toHaveProperty("proposal");
    expect(approvalDecisionResponseSchema.shape.decision.shape).toHaveProperty("outcome");
    expect(executionResponseSchema.shape.result.options).toHaveLength(2);
  });
});
