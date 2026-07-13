import { expect, test } from "@playwright/test";
import { resetDemo } from "./helpers.ts";

test("runs the grounded suggestion, approval, execution and audit loop", async ({
  page,
  request,
}) => {
  await resetDemo(request);
  await page.goto("/workspace");
  await page.getByRole("button", { name: /演示顾客.*商品破损/ }).click();
  await expect(page.getByRole("article").getByText("商品破损，申请退款")).toBeVisible();

  await page.getByRole("button", { name: "生成 AI 建议" }).click();
  await expect(page.getByRole("heading", { name: "AI 建议" })).toBeVisible();
  await page.getByText("查看引用依据").click();
  await expect(page.getByText("商品破损可提交退款申请，须经主管审批。")).toBeVisible();
  await expect(page.getByText("请复制到飞鸽并由人工发送")).toBeVisible();
  await expect(page.getByText("申请退款 ¥128.00，需主管审批")).toBeVisible();

  await page.getByRole("link", { name: "前往审批" }).click();
  const approve = page.getByRole("button", { name: "批准退款 ¥128.00" });
  await expect(approve).toBeVisible();
  await approve.click();
  await expect(page.getByText("模拟退款已执行")).toBeVisible();

  await page.getByRole("link", { name: "审计日志" }).click();
  const expected = [
    "conversation.message_ingested",
    "knowledge.retrieved",
    "agent.suggestion_generated",
    "action.proposed",
    "approval.approved",
    "action.execution_started",
    "action.execution_succeeded",
  ];
  await expect(page.getByRole("heading", { name: "审计日志" })).toBeVisible();
  const timeline = page.locator("ol > li");
  await expect(timeline).toHaveCount(7);
  const events = await timeline.allTextContents();
  expect(events.map((event) => expected.find((type) => event.includes(type)))).toEqual(expected);
});
