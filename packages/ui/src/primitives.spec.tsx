import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { CircleAlert, Trash2 } from "lucide-react";
import { describe, expect, it } from "vitest";

import { Badge, Button, Card, Dialog, Skeleton } from "./index.ts";

describe("design system primitives", () => {
  it("returns focus to the approval trigger when the dialog closes", async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        trigger={<Button>查看审批</Button>}
        title="退款审批"
        description="检查退款金额后再决定。"
      >
        <Button intent="danger" impactLabel="批准退款 ¥128.00" />
      </Dialog>,
    );

    const trigger = screen.getByRole("button", { name: "查看审批" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "退款审批" })).toBeVisible();
    expect(screen.getByRole("button", { name: "批准退款 ¥128.00" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "关闭" }));
    expect(trigger).toHaveFocus();
  });

  it("exposes distinct button intents with a stable touch target", () => {
    render(
      <>
        <Button>主要操作</Button>
        <Button intent="secondary">次要操作</Button>
        <Button intent="danger" impactLabel="批准退款 ¥128.00" />
      </>,
    );

    expect(screen.getByRole("button", { name: "批准退款 ¥128.00" })).toHaveAttribute(
      "data-intent",
      "danger",
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("focus-visible:");
    }
  });

  it("uses the explicit destructive impact as the visible command label", () => {
    render(
      <Button intent="danger" impactLabel="批准退款 ¥128.00">
        <Trash2 aria-hidden="true" />
      </Button>,
    );

    const command = screen.getByRole("button", { name: "批准退款 ¥128.00" });
    expect(command).toBeEnabled();
    expect(command).toHaveTextContent("批准退款 ¥128.00");
    expect(command.querySelector("svg")).toBeInTheDocument();
  });

  it.each([
    ["success", "已完成"],
    ["waiting", "等待处理"],
    ["needs-human", "需要人工"],
    ["failed", "失败"],
    ["neutral", "未连接"],
  ] as const)("renders %s status with icon and text", (status, label) => {
    render(<Badge status={status}>{label}</Badge>);
    const badge = screen.getByText(label).closest("span");
    expect(badge).toHaveTextContent(label);
    expect(badge?.querySelector("svg")).toBeInTheDocument();
  });

  it("keeps cards restrained and skeletons accessible", () => {
    render(
      <>
        <Card>队列概览</Card>
        <Skeleton label="正在加载审批" />
      </>,
    );

    expect(screen.getByText("队列概览")).toHaveClass("rounded-lg");
    const loading = screen.getByRole("status", { name: "正在加载审批" });
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading.className).toContain("motion-reduce:animate-none");
  });

  it("supports an explicit badge icon without losing its label", () => {
    render(
      <Badge status="failed" icon={CircleAlert}>
        执行失败
      </Badge>,
    );
    expect(screen.getByText("执行失败").closest("span")?.querySelector("svg")).toBeInTheDocument();
  });
});
