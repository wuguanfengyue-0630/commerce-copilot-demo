import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../../api/client.ts";
import { SetupWizard } from "./setup-wizard.tsx";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("../../api/client.ts", () => ({ apiRequest: vi.fn() }));

const bootstrap = {
  schemaVersion: 1,
  actor: { userId: "user-demo-owner", displayName: "演示店主", role: "owner" },
  setup: { status: "incomplete", acceptedAt: null },
  store: {
    companyId: "company-demo",
    storeId: "store-douyin-demo",
    displayName: "抖音电商演示店",
    platform: "douyin",
  },
} as const;

function renderWizard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<SetupWizard />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("SetupWizard", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue(bootstrap);
  });

  it("walks all six steps with accessible progress and completes setup", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(bootstrap)
      .mockResolvedValueOnce({
        schemaVersion: 1,
        setup: { status: "complete", acceptedAt: "2026-07-11T01:05:00.000Z" },
      });
    renderWizard();

    expect(await screen.findByRole("heading", { name: "管理员演示身份" })).toBeVisible();
    expect(screen.getByText("第 1 步，共 6 步")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("button", { name: "上一步" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("heading", { name: "确定性演示模型" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "上一步" }));
    expect(screen.getByRole("heading", { name: "管理员演示身份" })).toBeVisible();

    for (const heading of [
      "确定性演示模型",
      "模拟抖音店铺",
      "同步夹具",
      "发布破损退款政策",
      "运行验收对话",
    ]) {
      await user.click(screen.getByRole("button", { name: "下一步" }));
      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    }

    expect(screen.getByText("第 6 步，共 6 步")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "完成设置" }));

    expect(await screen.findByText("模拟环境已就绪，不代表已获得飞鸽消息权限")).toBeVisible();
    expect(apiRequest).toHaveBeenLastCalledWith(
      "/api/v1/demo/setup/complete",
      expect.anything(),
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByRole("link", { name: "进入总览" })).toHaveAttribute("href", "/overview");
  });

  it("disables controls and announces progress while completion is busy", async () => {
    const user = userEvent.setup();
    let resolveCompletion: ((value: unknown) => void) | undefined;
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(bootstrap)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveCompletion = resolve;
          }),
      );
    renderWizard();

    await screen.findByRole("heading", { name: "管理员演示身份" });
    for (let index = 0; index < 5; index += 1) {
      await user.click(screen.getByRole("button", { name: "下一步" }));
    }
    await user.click(screen.getByRole("button", { name: "完成设置" }));

    expect(screen.getByRole("button", { name: "正在完成" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "上一步" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("正在保存设置");
    resolveCompletion?.({
      schemaVersion: 1,
      setup: { status: "complete", acceptedAt: "2026-07-11T01:05:00.000Z" },
    });
  });

  it("offers a real retry action after completion fails", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(bootstrap)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        schemaVersion: 1,
        setup: { status: "complete", acceptedAt: "2026-07-11T01:05:00.000Z" },
      });
    renderWizard();

    await screen.findByRole("heading", { name: "管理员演示身份" });
    for (let index = 0; index < 5; index += 1) {
      await user.click(screen.getByRole("button", { name: "下一步" }));
    }
    await user.click(screen.getByRole("button", { name: "完成设置" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("设置未能保存");
    await user.click(screen.getByRole("button", { name: "重试完成设置" }));
    expect(await screen.findByText("模拟环境已就绪，不代表已获得飞鸽消息权限")).toBeVisible();
  });

  it("keeps a completed setup completed after bootstrap reload", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      ...bootstrap,
      setup: { status: "complete", acceptedAt: "2026-07-11T01:05:00.000Z" },
    });
    renderWizard();

    expect(await screen.findByText("模拟环境已就绪，不代表已获得飞鸽消息权限")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "管理员演示身份" })).not.toBeInTheDocument();
  });
});
