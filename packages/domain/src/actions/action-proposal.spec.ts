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
  ActionTransitionError,
  type ActionTransitionErrorCode,
  type ApprovalActor,
  type ApprovedActionProposal,
  approveProposal,
  createActionProposal,
  type ExecutedActionProposal,
  markExecuted,
  markExecuting,
  type PendingActionProposal,
} from "./action-proposal.ts";

const fixedNow = "2026-07-11T01:00:00.000Z";

const supervisor = Object.freeze({
  userId: createUserId("supervisor-1"),
  role: "supervisor",
}) satisfies ApprovalActor;

function refundProposal(overrides: Partial<ActionProposalInput> = {}): PendingActionProposal {
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

function executedRefundProposal(): ExecutedActionProposal {
  const approved = approveProposal(refundProposal(), supervisor, fixedNow);
  const executing = markExecuting(approved, "2026-07-11T01:00:01.000Z");

  return markExecuted(executing, executionResult());
}

function expectTransitionError(run: () => void, code: ActionTransitionErrorCode): void {
  let capturedError: ActionTransitionError | undefined;

  try {
    run();
  } catch (error) {
    if (!(error instanceof ActionTransitionError)) {
      throw error;
    }

    capturedError = error;
  }

  expect(capturedError).toBeInstanceOf(ActionTransitionError);
  expect(capturedError?.code).toBe(code);
  expect(capturedError?.message).toBe(code);
}

function copyRuntimeStateStamp(source: ActionProposal, target: object): void {
  const stateSymbols = Object.getOwnPropertySymbols(source);
  expect(stateSymbols).toHaveLength(1);

  const stateSymbol = stateSymbols[0];
  if (stateSymbol === undefined) {
    throw new Error("Expected a runtime proposal state stamp");
  }

  Object.defineProperty(target, stateSymbol, {
    value: source.status,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

describe("action proposal state machine", () => {
  it("creates a deeply frozen pending refund snapshot", () => {
    const proposal = refundProposal();

    expect(proposal.status).toBe("pending_approval");
    expect(Object.isFrozen(proposal)).toBe(true);
    expect(Object.isFrozen(proposal.payload)).toBe(true);
  });

  it("constructs only the canonical refund payload fields", () => {
    const payloadWithExtraField = {
      kind: "after_sale.refund" as const,
      orderId: "order-2",
      amount: createMoney(6_400, "CNY"),
      reasonCode: "damaged_item" as const,
      observedOrderVersion: "order-version-4",
      observedOrderStatus: "shipped" as const,
      observedRefundableAmount: createMoney(6_400, "CNY"),
      connectorSecret: "must-not-cross-domain-boundary",
    };

    const proposal = refundProposal({ payload: payloadWithExtraField });

    expect(proposal.payload).toEqual({
      kind: "after_sale.refund",
      orderId: "order-2",
      amount: createMoney(6_400, "CNY"),
      reasonCode: "damaged_item",
      observedOrderVersion: "order-version-4",
      observedOrderStatus: "shipped",
      observedRefundableAmount: createMoney(6_400, "CNY"),
    });
    expect(proposal.payload).not.toHaveProperty("connectorSecret");
  });

  it("keeps its runtime state stamp out of enumeration, spread, and JSON", () => {
    const proposal = refundProposal();
    const stateSymbols = Object.getOwnPropertySymbols(proposal);
    const spreadProposal = { ...proposal };
    const serializedProposal = JSON.stringify(proposal);
    const stateSymbol = stateSymbols[0];

    expect(stateSymbols).toHaveLength(1);
    if (stateSymbol === undefined) {
      throw new Error("Expected a runtime proposal state stamp");
    }
    expect(Object.getOwnPropertyDescriptor(proposal, stateSymbol)?.enumerable).toBe(false);
    expect(Object.getOwnPropertySymbols(spreadProposal)).toHaveLength(0);
    expect(serializedProposal).not.toContain("ActionProposal.state");
    expect(JSON.parse(serializedProposal)).not.toHaveProperty("stateStamp");
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

    expectTransitionError(
      () => approveProposal(proposal, supervisor, "2026-07-11T01:00:01.000Z"),
      "ACTION_EXPIRED",
    );
  });

  it("treats the exact expiry instant as expired", () => {
    const proposal = refundProposal({ expiresAt: fixedNow });

    expectTransitionError(() => approveProposal(proposal, supervisor, fixedNow), "ACTION_EXPIRED");
  });

  it("cannot execute a pending refund proposal", () => {
    const proposal = refundProposal();

    expectTransitionError(() => markExecuting(proposal, fixedNow), "ACTION_NOT_APPROVED");
  });

  it("rejects a spread proposal reclassified as approved at compile time and runtime", () => {
    const proposal = refundProposal();

    // @ts-expect-error A pending state seal cannot be reclassified as an approved proposal.
    const forged: ActionProposal = { ...proposal, status: "approved" };

    expectTransitionError(
      () => markExecuting(forged, "2026-07-11T01:00:01.000Z"),
      "ACTION_INVALID_PROPOSAL",
    );
  });

  it("rejects approved snapshots that lost their runtime stamp through spread or JSON", () => {
    const approved = approveProposal(refundProposal(), supervisor, fixedNow);
    const spreadProposal = { ...approved } as ApprovedActionProposal;
    const plainProposal = JSON.parse(JSON.stringify(approved)) as ApprovedActionProposal;

    expect(Object.getOwnPropertySymbols(spreadProposal)).toHaveLength(0);
    expect(Object.getOwnPropertySymbols(plainProposal)).toHaveLength(0);
    expectTransitionError(
      () => markExecuting(spreadProposal, "2026-07-11T01:00:01.000Z"),
      "ACTION_INVALID_PROPOSAL",
    );
    expectTransitionError(
      () => markExecuting(plainProposal, "2026-07-11T01:00:01.000Z"),
      "ACTION_INVALID_PROPOSAL",
    );
  });

  it("rejects sealed approved snapshots with invalid approval evidence", () => {
    const approved = approveProposal(refundProposal(), supervisor, fixedNow);
    const withoutApproval = { ...approved, approval: undefined };
    const withAgentApproval = {
      ...approved,
      approval: Object.freeze({
        ...approved.approval,
        approvedBy: Object.freeze({ ...approved.approval.approvedBy, role: "agent" }),
      }),
    };
    const withInvalidApprovalTime = {
      ...approved,
      approval: Object.freeze({ ...approved.approval, approvedAt: "not-a-timestamp" }),
    };

    for (const invalidProposal of [withoutApproval, withAgentApproval, withInvalidApprovalTime]) {
      copyRuntimeStateStamp(approved, invalidProposal);
      Object.freeze(invalidProposal);
      expectTransitionError(
        () => markExecuting(invalidProposal as ApprovedActionProposal, "2026-07-11T01:00:01.000Z"),
        "ACTION_INVALID_PROPOSAL",
      );
    }
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
    const differentResult = Object.freeze({
      executionId: "execution-2",
      executedAt: toIsoTimestamp("2026-07-11T01:00:03.000Z"),
    });

    const repeated = markExecuted(executed, differentResult);

    expect(repeated).toBe(executed);
    expect(repeated.executionResult).toEqual(executionResult());
  });

  it("returns stable typed errors for illegal completion and repeated approval", () => {
    const pending = refundProposal();
    const approved = approveProposal(pending, supervisor, fixedNow);

    expectTransitionError(() => markExecuted(pending, executionResult()), "ACTION_NOT_EXECUTING");
    expectTransitionError(
      () => approveProposal(approved, supervisor, fixedNow),
      "ACTION_NOT_PENDING_APPROVAL",
    );
  });
});
