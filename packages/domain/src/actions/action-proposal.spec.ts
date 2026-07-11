import { describe, expect, it } from "vitest";
import { toIsoTimestamp } from "../shared/clock.ts";
import {
  createCompanyId,
  createConversationId,
  createProposalId,
  createStoreId,
  createUserId,
} from "../shared/ids.ts";
import { createMoney } from "../shared/money.ts";
import {
  type ActionExecutionResult,
  type ActionProposal,
  type ActionProposalInput,
  type ApprovalActor,
  approveProposal,
  createActionProposal,
  markExecuted,
  markExecuting,
} from "./action-proposal.ts";

const fixedNow = "2026-07-11T01:00:00.000Z";

const supervisor = Object.freeze({
  userId: createUserId("supervisor-1"),
  role: "supervisor",
}) satisfies ApprovalActor;

function refundProposal(overrides: Partial<ActionProposalInput> = {}): ActionProposal {
  return createActionProposal({
    proposalId: createProposalId("proposal-1"),
    companyId: createCompanyId("company-1"),
    storeId: createStoreId("store-1"),
    conversationId: createConversationId("conversation-1"),
    payload: {
      kind: "after_sale.refund",
      orderId: "order-1",
      amount: createMoney(12_800, "CNY"),
      reasonCode: "damaged_item",
      observedOrderVersion: "order-version-3",
      observedOrderStatus: "delivered",
      observedRefundableAmount: createMoney(12_800, "CNY"),
    },
    createdAt: "2026-07-11T00:59:00.000Z",
    expiresAt: "2026-07-11T01:05:00.000Z",
    ...overrides,
  });
}

function executionResult(): ActionExecutionResult {
  return Object.freeze({
    executionId: "execution-1",
    executedAt: toIsoTimestamp("2026-07-11T01:00:02.000Z"),
  });
}

function executedRefundProposal(): ActionProposal {
  const approved = approveProposal(refundProposal(), supervisor, fixedNow);
  const executing = markExecuting(approved, "2026-07-11T01:00:01.000Z");

  return markExecuted(executing, executionResult());
}

describe("action proposal state machine", () => {
  it("creates a deeply frozen pending refund snapshot", () => {
    const proposal = refundProposal();

    expect(proposal.status).toBe("pending_approval");
    expect(Object.isFrozen(proposal)).toBe(true);
    expect(Object.isFrozen(proposal.payload)).toBe(true);
  });

  it("approves a pending refund without mutating the original snapshot", () => {
    const proposal = refundProposal();

    const approved = approveProposal(proposal, supervisor, fixedNow);

    expect(proposal.status).toBe("pending_approval");
    expect(approved).not.toBe(proposal);
    expect(approved).toMatchObject({
      status: "approved",
      approval: {
        approvedBy: supervisor,
        approvedAt: fixedNow,
      },
    });
    expect(Object.isFrozen(approved)).toBe(true);
    expect(Object.isFrozen(approved.approval)).toBe(true);
  });

  it("rejects an expired approval", () => {
    const proposal = refundProposal({ expiresAt: "2026-07-11T01:00:00.000Z" });

    expect(() => approveProposal(proposal, supervisor, "2026-07-11T01:00:01.000Z")).toThrowError(
      "ACTION_EXPIRED",
    );
  });

  it("treats the exact expiry instant as expired", () => {
    const proposal = refundProposal({ expiresAt: fixedNow });

    expect(() => approveProposal(proposal, supervisor, fixedNow)).toThrowError("ACTION_EXPIRED");
  });

  it("cannot execute a pending refund proposal", () => {
    const proposal = refundProposal();

    expect(() => markExecuting(proposal, fixedNow)).toThrowError("ACTION_NOT_APPROVED");
  });

  it("starts an approved proposal without mutating the approved snapshot", () => {
    const approved = approveProposal(refundProposal(), supervisor, fixedNow);

    const executing = markExecuting(approved, "2026-07-11T01:00:01.000Z");

    expect(approved.status).toBe("approved");
    expect(executing).toMatchObject({
      status: "executing",
      executionStartedAt: "2026-07-11T01:00:01.000Z",
    });
    expect(Object.isFrozen(executing)).toBe(true);
  });

  it("records an immutable execution result", () => {
    const approved = approveProposal(refundProposal(), supervisor, fixedNow);
    const executing = markExecuting(approved, "2026-07-11T01:00:01.000Z");

    const executed = markExecuted(executing, executionResult());

    expect(executed).toMatchObject({
      status: "executed",
      executionResult: executionResult(),
    });
    expect(Object.isFrozen(executed.executionResult)).toBe(true);
  });

  it("keeps a repeated execution idempotent", () => {
    const executed = executedRefundProposal();

    expect(markExecuted(executed, executionResult())).toEqual(executed);
  });
});
