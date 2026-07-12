import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AppShell } from "./app-shell.tsx";
import { AsyncState } from "./async-state.tsx";

const navigation = [
  "总览",
  "统一会话",
  "审批中心",
  "知识库",
  "平台接入",
  "规则中心",
  "模型配置",
  "评测中心",
  "审计日志",
];

describe("AppShell", () => {
  it("renders the Chinese operations navigation and persistent simulation banner", () => {
    render(<AppShell>工作区</AppShell>);
    for (const item of navigation) {
      expect(screen.getAllByRole("link", { name: item }).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("模拟环境")).toBeVisible();
    expect(screen.getByText(/不会触达真实平台/)).toBeVisible();
    expect(screen.getByText("演示店铺 · 客服主管")).toBeVisible();
  });

  it("opens and closes an accessible mobile navigation dialog", async () => {
    const user = userEvent.setup();
    render(<AppShell>工作区</AppShell>);

    await user.click(screen.getByRole("button", { name: "打开导航" }));
    expect(screen.getByRole("dialog", { name: "主导航" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(screen.queryByRole("dialog", { name: "主导航" })).not.toBeInTheDocument();
  });
});

describe("AsyncState", () => {
  it("offers a recovery action for errors", async () => {
    const user = userEvent.setup();
    let retries = 0;
    render(<AsyncState state="error" onRetry={() => retries++} />);
    expect(screen.getByText("暂时无法加载数据，请重试。")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "重新加载" }));
    expect(retries).toBe(1);
  });

  it.each([
    ["loading", "正在加载数据"],
    ["empty", "暂无数据"],
  ] as const)("renders the %s state", (state, label) => {
    render(<AsyncState state={state} />);
    expect(screen.getByText(label)).toBeVisible();
  });
});
