import { expect, test } from "@playwright/test";
import { resetDemo } from "./helpers.ts";

const routes = [
  ["/overview", "运营总览"],
  ["/workspace", "演示顾客"],
  ["/approvals", "审批中心"],
  ["/knowledge", "知识库"],
  ["/integrations", "平台接入"],
  ["/rules", "规则中心"],
  ["/models", "模型配置"],
  ["/evaluations", "评测中心"],
  ["/audit", "审计日志"],
] as const;

test.beforeEach(async ({ request }) => resetDemo(request));

for (const [route, heading] of routes) {
  test(`${route} exposes a unique primary heading`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toHaveCount(1);
  });
}
