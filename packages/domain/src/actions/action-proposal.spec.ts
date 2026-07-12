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
  assertIssuedActionProposal,
  createActionProposal,
  type ExecutedActionProposal,
  type ExecutingActionProposal,
  markExecuted,
  markExecuting,
  markNeedsHuman,
  type PendingActionProposal,
  rejectProposal,
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
      observedOrderVersion: 3,
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

function executingRefundProposal(): ExecutingActionProposal {
  const approved = approveProposal(refundProposal(), supervisor, fixedNow);

  return markExecuting(approved, "2026-07-11T01:00:01.000Z");
}

function executedRefundProposal(): ExecutedActionProposal {
  return markExecuted(executingRefundProposal(), executionResult());
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

function forgeApprovedByCopyingDescriptors(
  proposal: PendingActionProposal,
): ApprovedActionProposal {
  const forgedProposal = {};

  for (const key of Reflect.ownKeys(proposal)) {
    const descriptor = Object.getOwnPropertyDescriptor(proposal, key);
    if (descriptor === undefined) {
      throw new Error("Expected an own proposal property descriptor");
    }

    Object.defineProperty(forgedProposal, key, {
      ...descriptor,
      value: key === "status" || typeof key === "symbol" ? "approved" : descriptor.value,
    });
  }

  Object.defineProperty(forgedProposal, "approval", {
    value: Object.freeze({
      approvedBy: Object.freeze({ ...supervisor }),
      approvedAt: toIsoTimestamp(fixedNow),
    }),
    enumerable: true,
    configurable: false,
    writable: false,
  });

  return Object.freeze(forgedProposal) as ApprovedActionProposal;
}

describe("action proposal state machine", () => {
  it("creates a deeply frozen pending refund snapshot", () => {
    const proposal = refundProposal();

    expect(proposal.status).toBe("pending_approval");
    expect(proposal.version).toBe(1);
    expect(Object.isFrozen(proposal)).toBe(true);
    expect(Object.isFrozen(proposal.payload)).toBe(true);
  });

  it("constructs only the canonical refund payload fields", () => {
    const payloadWithExtraField = {
      kind: "after_sale.refund" as const,
      orderId: "order-2",
      amount: createMoney(6_400, "CNY"),
      reasonCode: "damaged_item" as const,
      observedOrderVersion: 4,
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
      observedOrderVersion: 4,
      observedOrderStatus: "shipped",
      observedRefundableAmount: createMoney(6_400, "CNY"),
    });
    expect(proposal.payload).not.toHaveProperty("connectorSecret");
  });

  it("rejects a spread Money with a negative amount", () => {
    const forgedAmount = {
      ...createMoney(12_800, "CNY"),
      amountMinor: -1,
    };

    expectTransitionError(
      () =>
        refundProposal({
          payload: {
            ...refundProposal().payload,
            amount: forgedAmount,
          },
        }),
      "ACTION_INVALID_PROPOSAL",
    );
  });

  it("rejects a spread Money whose runtime currency is unsupported", () => {
    const forgedAmount = { ...createMoney(12_800, "CNY") };
    Object.defineProperty(forgedAmount, "currency", { value: "USD" });

    expectTransitionError(
      () =>
        refundProposal({
          payload: {
            ...refundProposal().payload,
            amount: forgedAmount,
          },
        }),
      "ACTION_INVALID_PROPOSAL",
    );
  });

  it("snapshots and freezes mutable refund amounts", () => {
    const amount = { ...createMoney(12_800, "CNY") };
    const observedRefundableAmount = { ...createMoney(12_800, "CNY") };

    const proposal = refundProposal({
      payload: {
        ...refundProposal().payload,
        amount,
        observedRefundableAmount,
      },
    });
    amount.amountMinor = 1;
    observedRefundableAmount.amountMinor = 2;

    expect(proposal.payload.amount).toEqual(createMoney(12_800, "CNY"));
    expect(proposal.payload.observedRefundableAmount).toEqual(createMoney(12_800, "CNY"));
    expect(Object.isFrozen(proposal.payload.amount)).toBe(true);
    expect(Object.isFrozen(proposal.payload.observedRefundableAmount)).toBe(true);
  });

  it.each([
    {
      createdAt: "2026-07-11T01:05:00.000Z",
      expiresAt: "2026-07-11T01:05:00.000Z",
    },
    {
      createdAt: "2026-07-11T01:05:01.000Z",
      expiresAt: "2026-07-11T01:05:00.000Z",
    },
  ])("rejects proposal lifetime $createdAt to $expiresAt", ({ createdAt, expiresAt }) => {
    expectTransitionError(
      () => refundProposal({ createdAt, expiresAt }),
      "ACTION_INVALID_PROPOSAL",
    );
  });

  it("keeps authority out of own symbols, enumeration, spread, and JSON", () => {
    const proposal = refundProposal();
    const stateSymbols = Object.getOwnPropertySymbols(proposal);
    const spreadProposal = { ...proposal };
    const serializedProposal = JSON.stringify(proposal);

    expect(stateSymbols).toHaveLength(0);
    expect(Object.getOwnPropertySymbols(spreadProposal)).toHaveLength(0);
    expect(serializedProposal).not.toContain("ActionProposal.state");
    expect(JSON.parse(serializedProposal)).not.toHaveProperty("stateStamp");
  });

  it("accepts an issued action proposal", () => {
    const proposal = refundProposal();

    expect(() => assertIssuedActionProposal(proposal)).not.toThrow();
  });

  it("rejects spread, JSON, and manually frozen proposal forgeries", () => {
    const proposal = refundProposal();
    const spreadProposal = { ...proposal } as ActionProposal;
    const jsonProposal = JSON.parse(JSON.stringify(proposal)) as ActionProposal;
    const manuallyFrozenProposal = forgeApprovedByCopyingDescriptors(proposal);

    for (const forgery of [spreadProposal, jsonProposal, manuallyFrozenProposal]) {
      expectTransitionError(() => assertIssuedActionProposal(forgery), "ACTION_INVALID_PROPOSAL");
    }
  });

  it("approves a pending refund without mutating the original snapshot", () => {
    const proposal = refundProposal();

    const approved = approveProposal(proposal, supervisor, fixedNow);

    expect(proposal.status).toBe("pending_approval");
    expect(proposal.version).toBe(1);
    expect(approved).not.toBe(proposal);
    expect(approved).toMatchObject({
      status: "approved",
      version: 2,
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

  it("rejects approval before proposal creation", () => {
    const proposal = refundProposal({
      createdAt: "2026-07-11T01:00:00.000Z",
      expiresAt: "2026-07-11T01:05:00.000Z",
    });

    expectTransitionError(
      () => approveProposal(proposal, supervisor, "2026-07-11T00:59:59.000Z"),
      "ACTION_INVALID_PROPOSAL",
    );
  });

  it("allows approval at the proposal creation instant", () => {
    const proposal = refundProposal({
      createdAt: fixedNow,
      expiresAt: "2026-07-11T01:05:00.000Z",
    });

    const approved = approveProposal(proposal, supervisor, fixedNow);

    expect(approved.approval.approvedAt).toBe(fixedNow);
  });

  it.each([
    Object.freeze({
      userId: createUserId("agent-1"),
      role: "agent" as ApprovalActor["role"],
    }),
    Object.freeze({
      userId: " " as ApprovalActor["userId"],
      role: "supervisor" as const,
    }),
  ])("rejects invalid approver evidence", (invalidApprover) => {
    expectTransitionError(
      () => approveProposal(refundProposal(), invalidApprover, fixedNow),
      "ACTION_INVALID_PROPOSAL",
    );
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

  it("rejects approved snapshots without issued provenance after spread or JSON", () => {
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

  it("rejects a fully frozen approved forgery with all reflected descriptors copied", () => {
    const forgedProposal = forgeApprovedByCopyingDescriptors(refundProposal());

    expectTransitionError(
      () => markExecuting(forgedProposal, "2026-07-11T01:00:01.000Z"),
      "ACTION_INVALID_PROPOSAL",
    );
  });

  it("starts an approved proposal without mutating the approved snapshot", () => {
    const approved = approveProposal(refundProposal(), supervisor, fixedNow);

    const executing = markExecuting(approved, "2026-07-11T01:00:01.000Z");

    expect(approved.status).toBe("approved");
    expect(approved.version).toBe(2);
    expect(executing).toMatchObject({
      status: "executing",
      version: 3,
      executionStartedAt: "2026-07-11T01:00:01.000Z",
    });
    expect(Object.isFrozen(executing)).toBe(true);
  });

  it("rejects execution starting before approval", () => {
    const approved = approveProposal(refundProposal(), supervisor, fixedNow);

    expectTransitionError(
      () => markExecuting(approved, "2026-07-11T00:59:59.000Z"),
      "ACTION_INVALID_PROPOSAL",
    );
  });

  it("allows execution to start at the approval instant", () => {
    const approved = approveProposal(refundProposal(), supervisor, fixedNow);

    const executing = markExecuting(approved, fixedNow);

    expect(executing.executionStartedAt).toBe(fixedNow);
  });

  it("records an immutable execution result", () => {
    const approved = approveProposal(refundProposal(), supervisor, fixedNow);
    const executing = markExecuting(approved, "2026-07-11T01:00:01.000Z");

    const executed = markExecuted(executing, executionResult());

    expect(executed).toMatchObject({
      status: "executed",
      version: 4,
      executionResult: executionResult(),
    });
    expect(Object.isFrozen(executed.executionResult)).toBe(true);
  });

  it.each([
    Object.freeze({
      executionId: " ",
      executedAt: toIsoTimestamp("2026-07-11T01:00:02.000Z"),
    }),
    Object.freeze({
      executionId: "execution-before-start",
      executedAt: toIsoTimestamp("2026-07-11T01:00:00.000Z"),
    }),
    Object.freeze({
      executionId: "execution-non-canonical-time",
      executedAt: "2026-07-11T09:00:02+08:00" as ActionExecutionResult["executedAt"],
    }),
  ])("rejects invalid execution result evidence", (invalidResult) => {
    expectTransitionError(
      () => markExecuted(executingRefundProposal(), invalidResult),
      "ACTION_INVALID_PROPOSAL",
    );
  });

  it("allows execution to complete at the start instant", () => {
    const executing = executingRefundProposal();
    const result = Object.freeze({
      executionId: "execution-at-start",
      executedAt: executing.executionStartedAt,
    });

    const executed = markExecuted(executing, result);

    expect(executed.executionResult.executedAt).toBe(executing.executionStartedAt);
  });

  it("keeps a repeated execution idempotent", () => {
    const executed = executedRefundProposal();
    const differentResult = Object.freeze({
      executionId: "execution-2",
      executedAt: toIsoTimestamp("2026-07-11T01:00:03.000Z"),
    });

    const repeated = markExecuted(executed, differentResult);

    expect(repeated).toBe(executed);
    expect(repeated.version).toBe(4);
    expect(repeated.executionResult).toEqual(executionResult());
  });

  it("rejects a pending proposal with immutable reviewer evidence", () => {
    const pending = refundProposal();

    const rejected = rejectProposal(pending, supervisor, fixedNow);

    expect(pending).toMatchObject({ status: "pending_approval", version: 1 });
    expect(rejected).toMatchObject({
      status: "rejected",
      version: 2,
      rejection: { rejectedBy: supervisor, rejectedAt: fixedNow },
    });
    expect(Object.isFrozen(rejected.rejection)).toBe(true);
  });

  it("marks approved and executing proposals needs-human without mutating predecessors", () => {
    const approved = approveProposal(refundProposal(), supervisor, fixedNow);
    const blockedApproved = markNeedsHuman(approved, "ORDER_CHANGED", fixedNow);
    const executing = markExecuting(approved, fixedNow);
    const blockedExecuting = markNeedsHuman(executing, "EXECUTION_UNCONFIRMED", fixedNow);

    expect(approved).toMatchObject({ status: "approved", version: 2 });
    expect(blockedApproved).toMatchObject({
      status: "needs_human",
      version: 3,
      needsHuman: { reason: "ORDER_CHANGED", markedAt: fixedNow },
    });
    expect(executing).toMatchObject({ status: "executing", version: 3 });
    expect(blockedExecuting).toMatchObject({
      status: "needs_human",
      version: 4,
      needsHuman: { reason: "EXECUTION_UNCONFIRMED", markedAt: fixedNow },
    });
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
