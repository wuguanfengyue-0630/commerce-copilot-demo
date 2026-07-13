import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../../api/client.ts";
import { OverviewView } from "./overview-view.tsx";

vi.mock("../../api/client.ts", () => ({ apiRequest: vi.fn() }));

const workspace = {
  schemaVersion: 1,
  workspace: {
    companyId: "company-demo",
    storeId: "store-douyin-demo",
    metrics: {
      openConversations: 1,
      waitingForAgent: 1,
      assistantSuggestions: 1,
      proposalsAwaitingApproval: 1,
      refundedAmount: { amountMinor: 12800, currency: "CNY" },
      measuredAt: "2026-07-11T01:02:03.000Z",
    },
    integrations: [
      {
        storeId: "store-douyin-demo",
        platform: "douyin",
        displayName: "抖音电商演示店",
        status: "connected",
        capabilities: [
          { capability: "order.read", status: "available" },
          { capability: "afterSale.read", status: "available" },
          { capability: "message.receive", status: "waiting_qualification", reason: "待资质" },
          { capability: "message.send", status: "waiting_qualification", reason: "待资质" },
        ],
      },
    ],
    activeRules: [
      {
        kind: "after_sale.refund",
        enabled: true,
        requiresApproval: true,
        requiredRole: "supervisor",
      },
    ],
    messageSendMode: "assisted",
    demoModel: { provider: "deterministic-demo", deterministic: true },
    evaluationSummary: { scenario: "damaged_item", status: "ready", score: 1 },
    setup: { status: "complete", acceptedAt: "2026-07-11T01:05:00.000Z" },
  },
} as const;

const pendingApproval = {
  proposalId: "proposal-demo-refund",
  version: 1,
  companyId: "company-demo",
  storeId: "store-douyin-demo",
  conversationId: "conversation-damaged-item",
  action: {
    kind: "after_sale.refund",
    orderId: "order-demo-damaged",
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

function renderOverview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<OverviewView />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

function answerWith(approvals: unknown) {
  vi.mocked(apiRequest).mockImplementation((path) => {
    if (path === "/api/v1/workspace") return Promise.resolve(workspace);
    if (path === "/api/v1/approvals") return Promise.resolve(approvals);
    return Promise.resolve(workspace);
  });
}

describe("OverviewView", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("shows a compact loading surface while API data is pending", () => {
    answerWith({ schemaVersion: 1, pending: [], history: [] });
    renderOverview();
    expect(screen.getByRole("status")).toHaveAccessibleName("正在加载数据");
  });

  it("offers a retry action when either request fails", async () => {
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("offline"));
    answerWith({ schemaVersion: 1, pending: [], history: [] });
    renderOverview();
    const user = userEvent.setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("暂时无法加载数据");
    await user.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByRole("heading", { name: "运营总览" })).toBeVisible();
    expect(apiRequest).toHaveBeenCalledTimes(4);
  });

  it("treats an empty approval queue as a successful operating state", async () => {
    answerWith({ schemaVersion: 1, pending: [], history: [] });
    renderOverview();

    expect(await screen.findByRole("heading", { name: "运营总览" })).toBeVisible();
    expect(vi.mocked(apiRequest).mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/workspace",
      "/api/v1/approvals",
    ]);
    expect(screen.getByText("当前没有待审批操作")).toBeVisible();
    expect(screen.getByText("开放会话").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("助手建议").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("等待人工").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("待审批").nextSibling).toHaveTextContent("0");
    expect(screen.getByText("接口健康").nextSibling).toHaveTextContent("2 可用 / 2 等待");
    expect(screen.queryByText(/解决/)).not.toBeInTheDocument();
  });

  it("marks pending approvals as needing human attention", async () => {
    answerWith({ schemaVersion: 1, pending: [pendingApproval], history: [] });
    renderOverview();

    expect(await screen.findByText("等待人工审批")).toBeVisible();
    expect(screen.getByText("破损商品退款").closest("li")).toHaveTextContent("¥128.00");
    expect(screen.getByRole("link", { name: "处理审批" })).toHaveAttribute("href", "/approvals");
  });
});
