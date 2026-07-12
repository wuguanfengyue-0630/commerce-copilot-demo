import {
  type CapabilityState,
  createActionProposal,
  createCompanyId,
  createConversationId,
  createMoney,
  createOrderId,
  createOrderSnapshot,
  createProposalId,
  createStoreId,
  FixedClock,
  type OrderSnapshot,
  toIsoTimestamp,
} from "@commerce-copilot/domain";
import { describe, expect, it } from "vitest";
import type {
  CommerceConnector,
  ExecuteActionCommand,
  ExecutionResult,
} from "../ports/commerce-connector.ts";
import { createDemoRuntime } from "../runtime/demo-runtime.ts";
import { createDecideApprovalUseCase, type DecideApprovalCommand } from "./decide-approval.ts";
import { createExecuteActionUseCase, type ExecuteApprovedActionCommand } from "./execute-action.ts";

const companyId = createCompanyId("company-demo");
const storeId = createStoreId("store-douyin-demo");
const conversationId = createConversationId("conversation-damaged-item-1");
const orderId = createOrderId("order-delivered-12800");
const proposalId = createProposalId("proposal-application-workflow-1");

const supervisor = Object.freeze({ id: "supervisor-demo", role: "supervisor" as const });

const approvalCommand = Object.freeze({
  companyId,
  proposalId,
  proposalVersion: 1,
  outcome: "approved",
  actor: supervisor,
  correlationId: "demo-approval-1",
  causationId: proposalId,
}) satisfies DecideApprovalCommand;

const executionCommand = Object.freeze({
  companyId,
  proposalId,
  actor: supervisor,
  correlationId: "demo-execution-1",
  causationId: proposalId,
}) satisfies ExecuteApprovedActionCommand;

function seededOrder(): OrderSnapshot {
  return createOrderSnapshot({
    companyId,
    storeId,
    orderId,
    version: 1,
    status: "delivered",
    total: createMoney(12_800, "CNY"),
    refundable: createMoney(12_800, "CNY"),
    updatedAt: toIsoTimestamp("2026-07-11T01:00:00.000Z"),
  });
}

function pendingProposal() {
  return createActionProposal({
    proposalId,
    companyId,
    storeId,
    conversationId,
    payload: {
      kind: "after_sale.refund",
      orderId,
      amount: createMoney(12_800, "CNY"),
      reasonCode: "damaged_item",
      observedOrderVersion: 1,
      observedOrderStatus: "delivered",
      observedRefundableAmount: createMoney(12_800, "CNY"),
    },
    createdAt: "2026-07-11T01:10:00.000Z",
    expiresAt: "2026-07-11T01:40:00.000Z",
  });
}

function createConnectorHarness() {
  let order = seededOrder();
  let effectCount = 0;
  const results = new Map<string, ExecutionResult>();
  const connector: CommerceConnector = Object.freeze({
    async getCapabilities(): Promise<readonly CapabilityState[]> {
      return Object.freeze([]);
    },
    async getOrder(): Promise<OrderSnapshot> {
      return order;
    },
    async executeAction(command: ExecuteActionCommand): Promise<ExecutionResult> {
      const existing = results.get(command.idempotencyKey);
      if (existing !== undefined) {
        return existing;
      }
      effectCount += 1;
      const result = Object.freeze({
        status: "succeeded" as const,
        executionId: "execution-demo-1",
        idempotencyKey: command.idempotencyKey,
        externalReference: "refund-demo-1",
        completedAt: toIsoTimestamp("2026-07-11T02:00:00.000Z"),
      });
      results.set(command.idempotencyKey, result);
      return result;
    },
    async findActionResult(idempotencyKey: string): Promise<ExecutionResult | null> {
      return results.get(idempotencyKey) ?? null;
    },
  });

  return {
    connector,
    executionCount: () => effectCount,
    setOrder(next: OrderSnapshot): void {
      order = next;
    },
  };
}

async function createHarness() {
  const runtime = createDemoRuntime();
  const connectorHarness = createConnectorHarness();
  const context = {
    companyId,
    correlationId: "demo-seed-1",
    causationId: "demo-seed-1",
  } as const;
  await runtime.repositories.proposals.save(context, pendingProposal());

  return {
    runtime,
    connectorHarness,
    decideApproval: createDecideApprovalUseCase({
      repositories: runtime.repositories,
      unitOfWork: runtime.unitOfWork,
      clock: new FixedClock(new Date("2026-07-11T01:11:00.000Z")),
    }),
    executeAction: createExecuteActionUseCase({
      repositories: runtime.repositories,
      unitOfWork: runtime.unitOfWork,
      commerceConnector: connectorHarness.connector,
      clock: new FixedClock(new Date("2026-07-11T01:12:00.000Z")),
    }),
  };
}

describe("demo approval and execution workflow", () => {
  it("approves once and executes the refund idempotently", async () => {
    const harness = await createHarness();

    const approval = await harness.decideApproval.execute(approvalCommand);
    await expect(harness.decideApproval.execute(approvalCommand)).rejects.toMatchObject({
      code: "APPROVAL_CONFLICT",
    });
    const first = await harness.executeAction.execute(executionCommand);
    const second = await harness.executeAction.execute(executionCommand);

    expect(approval.proposal.status).toBe("approved");
    expect(first).toEqual(second);
    expect(first.status).toBe("succeeded");
    expect(harness.connectorHarness.executionCount()).toBe(1);
    const context = {
      companyId,
      correlationId: executionCommand.correlationId,
      causationId: executionCommand.causationId,
    } as const;
    expect(
      (await harness.runtime.repositories.auditEvents.list(context))
        .map((event) => event.eventType)
        .slice(-3),
    ).toEqual(["approval.approved", "action.execution_started", "action.execution_succeeded"]);
  });

  it("blocks execution when the order changed without calling the connector effect", async () => {
    const harness = await createHarness();
    await harness.decideApproval.execute(approvalCommand);
    harness.connectorHarness.setOrder(
      createOrderSnapshot({
        ...seededOrder(),
        version: 2,
        updatedAt: toIsoTimestamp("2026-07-11T01:11:30.000Z"),
      }),
    );

    const result = await harness.executeAction.execute(executionCommand);

    expect(result.status).toBe("needs_human");
    expect(harness.connectorHarness.executionCount()).toBe(0);
  });
});
