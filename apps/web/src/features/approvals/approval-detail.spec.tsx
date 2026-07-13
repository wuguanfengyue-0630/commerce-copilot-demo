import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientError, apiRequest } from "../../api/client.ts";
import { apiQueryKeys } from "../../api/queries.ts";
import { ApprovalDetail } from "./approval-detail.tsx";

vi.mock("../../api/client.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client.ts")>();
  return { ...actual, apiRequest: vi.fn() };
});

const proposal = {
  proposalId: "proposal-demo-refund",
  version: 1,
  companyId: "company-demo",
  storeId: "store-douyin-demo",
  conversationId: "conversation-damaged-item-1",
  action: {
    kind: "after_sale.refund",
    orderId: "order-delivered-12800",
    amount: { amountMinor: 12800, currency: "CNY" },
    reasonCode: "damaged_item",
    observedOrder: {
      version: 1,
      status: "delivered",
      refundable: { amountMinor: 12800, currency: "CNY" },
    },
  },
  status: "pending_approval",
  createdAt: "2026-07-11T01:10:00.000Z",
  expiresAt: "2026-07-11T02:10:00.000Z",
  approval: null,
  rejection: null,
  execution: null,
} as const;

const detail = {
  schemaVersion: 1,
  conversation: {
    companyId: "company-demo",
    storeId: "store-douyin-demo",
    conversationId: proposal.conversationId,
    customer: { customerId: "customer-demo", displayName: "演示顾客" },
    status: "waiting_for_agent",
    lastMessagePreview: "商品破损，申请退款",
    unreadCount: 1,
    updatedAt: "2026-07-11T01:02:03.000Z",
    messages: [
      {
        messageId: "message-demo",
        role: "customer",
        origin: "platform",
        content: "商品破损，申请退款",
        externalMessageId: "external-demo",
        occurredAt: "2026-07-11T01:02:03.000Z",
      },
    ],
    order: {
      companyId: "company-demo",
      storeId: "store-douyin-demo",
      orderId: proposal.action.orderId,
      version: 1,
      status: "delivered",
      total: { amountMinor: 12800, currency: "CNY" },
      refundable: { amountMinor: 12800, currency: "CNY" },
      updatedAt: "2026-07-11T01:02:03.000Z",
    },
    latestSuggestion: null,
    citations: [
      {
        releaseId: "release-v1",
        chunkId: "chunk-v1",
        sourceTitle: "破损商品退款政策",
        excerpt: "商品破损可提交退款申请，须经主管审批。",
        version: 1,
      },
    ],
    proposal,
  },
} as const;

const knowledge = {
  schemaVersion: 1,
  policies: [
    {
      policyId: "policy-v1",
      title: "破损商品退款政策",
      status: "published",
      scenario: "damaged_item",
      content: "订单已送达且商品破损时，可提交退款申请。",
      refundRule: { kind: "after_sale.refund", enabled: true },
      citations: detail.conversation.citations,
      release: {
        releaseId: "release-v1",
        version: 1,
        publishedAt: "2026-07-11T01:00:00.000Z",
        expiresAt: null,
        immutable: true,
      },
    },
  ],
} as const;

function approvedResponse() {
  return {
    schemaVersion: 1,
    decision: {
      proposalId: proposal.proposalId,
      proposalVersion: 1,
      outcome: "approved",
      actor: { userId: "user-demo-supervisor", role: "supervisor" },
      comment: null,
      decidedAt: "2026-07-11T01:15:00.000Z",
    },
    proposal: {
      ...proposal,
      version: 2,
      status: "approved",
      approval: {
        actor: { userId: "user-demo-supervisor", role: "supervisor" },
        approvedAt: "2026-07-11T01:15:00.000Z",
      },
    },
  } as const;
}

function installApi(
  options: {
    decisionError?: ApiClientError;
    execution?: unknown;
    executionError?: ApiClientError;
    executionErrorOnce?: ApiClientError;
  } = {},
) {
  let executionAttempts = 0;
  vi.mocked(apiRequest).mockImplementation((path, _schema, init) => {
    if (path === `/api/v1/conversations/${proposal.conversationId}`) return Promise.resolve(detail);
    if (path === "/api/v1/knowledge") return Promise.resolve(knowledge);
    if (path === `/api/v1/approvals/${proposal.proposalId}/decisions` && init?.method === "POST") {
      return options.decisionError
        ? Promise.reject(options.decisionError)
        : Promise.resolve(approvedResponse());
    }
    if (path === `/api/v1/actions/${proposal.proposalId}/execute` && init?.method === "POST") {
      executionAttempts += 1;
      if (options.executionErrorOnce && executionAttempts === 1) {
        return Promise.reject(options.executionErrorOnce);
      }
      if (options.executionError) return Promise.reject(options.executionError);
      return Promise.resolve(
        options.execution ?? {
          schemaVersion: 1,
          result: {
            status: "succeeded",
            proposalId: proposal.proposalId,
            executionId: "mock-execution-0001",
            externalReference: "refund-demo-0001",
            completedAt: "2026-07-11T01:20:00.000Z",
          },
        },
      );
    }
    if (path === undefined) return Promise.resolve(detail);
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
}

function renderApproval() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(apiQueryKeys.approvals, { stale: true });
  client.setQueryData(apiQueryKeys.workspace, { stale: true });
  client.setQueryData(apiQueryKeys.audit(proposal.conversationId), { stale: true });
  const view = render(<ApprovalDetail proposal={proposal} />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...view, client };
}

describe("ApprovalDetail", () => {
  beforeEach(() => vi.mocked(apiRequest).mockClear());

  it("names the exact financial impact and executes once", async () => {
    installApi();
    const { client } = renderApproval();
    const user = userEvent.setup();

    expect(await screen.findByText("商品破损，申请退款")).toBeVisible();
    expect(screen.getByText("破损商品退款政策")).toBeVisible();
    expect(screen.getByText("所需角色：客服主管")).toBeVisible();
    const approve = screen.getByRole("button", { name: "批准退款 ¥128.00" });
    await user.dblClick(approve);
    expect(approve).toBeDisabled();
    expect(await screen.findByText("模拟退款已执行")).toBeVisible();
    expect(
      vi
        .mocked(apiRequest)
        .mock.calls.filter(([path]) => typeof path === "string" && path.endsWith("/decisions")),
    ).toHaveLength(1);
    expect(
      vi
        .mocked(apiRequest)
        .mock.calls.filter(([path]) => typeof path === "string" && path.endsWith("/execute")),
    ).toHaveLength(1);
    expect(client.getQueryState(apiQueryKeys.approvals)?.isInvalidated).toBe(true);
    expect(client.getQueryState(apiQueryKeys.workspace)?.isInvalidated).toBe(true);
    expect(client.getQueryState(apiQueryKeys.audit(proposal.conversationId))?.isInvalidated).toBe(
      true,
    );
  });

  it("stops when the proposal expired", async () => {
    installApi({ decisionError: new ApiClientError("expired", "APPROVAL_EXPIRED") });
    renderApproval();
    await userEvent.click(await screen.findByRole("button", { name: "批准退款 ¥128.00" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("提案已过期，请重新生成建议");
    expect(
      vi
        .mocked(apiRequest)
        .mock.calls.some(([path]) => typeof path === "string" && path.endsWith("/execute")),
    ).toBe(false);
  });

  it("moves order drift to human review", async () => {
    installApi({
      execution: {
        schemaVersion: 1,
        result: { status: "needs_human", proposalId: proposal.proposalId, reason: "ORDER_CHANGED" },
      },
    });
    renderApproval();
    await userEvent.click(await screen.findByRole("button", { name: "批准退款 ¥128.00" }));
    expect(await screen.findByText("订单已变化，需要人工复核")).toBeVisible();
  });

  it("explains duplicate approval conflicts without executing", async () => {
    installApi({ decisionError: new ApiClientError("conflict", "APPROVAL_CONFLICT") });
    renderApproval();
    await userEvent.click(await screen.findByRole("button", { name: "批准退款 ¥128.00" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "该操作已被处理，请刷新查看最新状态",
    );
    expect(
      vi
        .mocked(apiRequest)
        .mock.calls.some(([path]) => typeof path === "string" && path.endsWith("/execute")),
    ).toBe(false);
  });

  it("offers an explicit retry after a network failure", async () => {
    installApi({ decisionError: new ApiClientError("offline", "NETWORK_ERROR") });
    renderApproval();
    await userEvent.click(await screen.findByRole("button", { name: "批准退款 ¥128.00" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("操作失败，请检查网络后重试");
    expect(screen.getByRole("button", { name: "重试批准退款 ¥128.00" })).toBeEnabled();
    expect(
      vi
        .mocked(apiRequest)
        .mock.calls.filter(([path]) => typeof path === "string" && path.endsWith("/decisions")),
    ).toHaveLength(1);
  });

  it("retries only execution when approval succeeded before the network failed", async () => {
    installApi({ executionErrorOnce: new ApiClientError("offline", "NETWORK_ERROR") });
    renderApproval();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "批准退款 ¥128.00" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("操作失败，请检查网络后重试");
    await user.click(screen.getByRole("button", { name: "重试执行退款 ¥128.00" }));
    expect(await screen.findByText("模拟退款已执行")).toBeVisible();
    expect(
      vi
        .mocked(apiRequest)
        .mock.calls.filter(([path]) => typeof path === "string" && path.endsWith("/decisions")),
    ).toHaveLength(1);
    expect(
      vi
        .mocked(apiRequest)
        .mock.calls.filter(([path]) => typeof path === "string" && path.endsWith("/execute")),
    ).toHaveLength(2);
  });
});
