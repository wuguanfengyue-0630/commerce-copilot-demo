import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell.tsx";
import { AsyncState } from "./async-state.tsx";
import { ThemeToggle } from "./theme-toggle.tsx";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  resolvedTheme: "light" as string | undefined,
  setTheme: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: mocks.resolvedTheme, setTheme: mocks.setTheme }),
}));

beforeEach(() => {
  mocks.pathname = "/";
  mocks.resolvedTheme = "light";
  mocks.setTheme.mockClear();
});

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
    expect(screen.getByRole("link", { name: "总览" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("模拟环境")).toBeVisible();
    expect(screen.getByText(/不会触达真实平台/)).toBeVisible();
    expect(screen.getByText("演示店铺 · 客服主管")).toBeVisible();
  });

  it("marks exact root and nested section paths active on desktop and mobile", async () => {
    mocks.pathname = "/approvals/pending";
    const user = userEvent.setup();
    render(<AppShell>工作区</AppShell>);

    expect(screen.getByRole("link", { name: "审批中心" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "总览" })).not.toHaveAttribute("aria-current");

    await user.click(screen.getByRole("button", { name: "打开导航" }));
    for (const approvalLink of screen.getAllByRole("link", { name: "审批中心" })) {
      expect(approvalLink).toHaveAttribute("aria-current", "page");
    }
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

describe("ThemeToggle", () => {
  it("keeps a stable neutral control during hydration before showing the dark-first action", async () => {
    mocks.resolvedTheme = "dark";
    const serverMarkup = renderToString(<ThemeToggle />);
    expect(serverMarkup).toContain("disabled");
    expect(serverMarkup).toContain("主题设置加载中");
    expect(serverMarkup).toContain("size-11");

    render(<ThemeToggle />);
    const toggle = await screen.findByRole("button", { name: "切换到浅色主题" });
    expect(toggle).toBeEnabled();
    expect(toggle.className).toContain("size-11");
    await userEvent.click(toggle);
    expect(mocks.setTheme).toHaveBeenCalledWith("light");
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

  it("fails safely when an error state bypasses the required recovery action", () => {
    expect(() =>
      render(<AsyncState {...({ state: "error" } as Parameters<typeof AsyncState>[0])} />),
    ).toThrow("AsyncState error requires onRetry");
    expect(screen.queryByRole("button", { name: "重新加载" })).not.toBeInTheDocument();
  });

  it.each([
    ["loading", "正在加载数据"],
    ["empty", "暂无数据"],
  ] as const)("renders the %s state", (state, label) => {
    render(<AsyncState state={state} />);
    expect(screen.getByText(label)).toBeVisible();
    if (state === "loading") {
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    }
  });
});
