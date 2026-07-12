import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../../api/client.ts";
import { IntegrationsView } from "./integrations-view.tsx";

vi.mock("../../api/client.ts", () => ({ apiRequest: vi.fn() }));

const workspace = {
  schemaVersion: 1,
  workspace: {
    companyId: "company-demo",
    storeId: "store-douyin-demo",
    metrics: {
      openConversations: 1,
      waitingForAgent: 1,
      assistantSuggestions: 0,
      proposalsAwaitingApproval: 0,
      refundedAmount: { amountMinor: 0, currency: "CNY" },
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
          {
            capability: "message.receive",
            status: "waiting_qualification",
            reason: "普通自用型应用未开放飞鸽消息收发 API",
          },
          {
            capability: "message.send",
            status: "waiting_qualification",
            reason: "普通自用型应用未开放飞鸽消息收发 API",
          },
        ],
      },
    ],
    activeRules: [],
    messageSendMode: "assisted",
    demoModel: { provider: "deterministic-demo", deterministic: true },
    evaluationSummary: { scenario: "damaged_item", status: "ready", score: 1 },
    setup: { status: "complete", acceptedAt: "2026-07-11T01:05:00.000Z" },
  },
} as const;

function renderIntegrations() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<IntegrationsView />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("IntegrationsView", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("renders loading and a retryable error", async () => {
    vi.mocked(apiRequest).mockResolvedValue(workspace);
    const first = renderIntegrations();
    expect(screen.getByRole("status")).toHaveAccessibleName("正在加载数据");
    first.unmount();

    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(workspace);
    renderIntegrations();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "重新加载" }));
    expect(await screen.findByRole("heading", { name: "平台接入" })).toBeVisible();
    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it("renders an explicit empty state when no integration is configured", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ...workspace,
      workspace: { ...workspace.workspace, integrations: [] },
    });
    renderIntegrations();
    expect(await screen.findByText("当前没有模拟平台配置")).toBeVisible();
  });

  it("does not overstate message capability or platform connection", async () => {
    vi.mocked(apiRequest).mockResolvedValue(workspace);
    renderIntegrations();

    expect(await screen.findByRole("heading", { name: "平台接入" })).toBeVisible();
    expect(screen.getByText("未接入 / 模拟")).toBeVisible();
    expect(screen.getByRole("row", { name: /接收飞鸽消息.*等待官方资质/ })).toBeVisible();
    expect(screen.getByRole("row", { name: /发送飞鸽消息.*人工辅助发送/ })).toBeVisible();
    expect(screen.getByRole("row", { name: /读取订单.*可用/ })).toBeVisible();
    expect(screen.getByRole("row", { name: /读取售后.*可用/ })).toBeVisible();
    expect(screen.queryByRole("row", { name: /接收飞鸽消息.*已连接/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("capability-table-scroll")).toHaveClass("overflow-x-auto");
  });
});
