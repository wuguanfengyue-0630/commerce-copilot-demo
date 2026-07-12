import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SetupShell } from "./setup-shell.tsx";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

describe("SetupShell", () => {
  it("keeps the demo banner without exposing the full console navigation", () => {
    render(<SetupShell>设置内容</SetupShell>);

    expect(screen.getByText("模拟环境")).toBeVisible();
    expect(screen.getByText(/不会触达真实平台/)).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "主导航" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开导航" })).not.toBeInTheDocument();
    expect(screen.getByText("设置内容")).toBeVisible();
  });
});
