import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { resetDemo, seedProposal } from "./helpers.ts";

async function expectNoSeriousViolations(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    result.violations.filter(({ impact }) => impact === "critical" || impact === "serious"),
  ).toEqual([]);
}

test("setup and overview have no serious accessibility violations", async ({ page, request }) => {
  await resetDemo(request);
  await page.goto("/setup");
  await expectNoSeriousViolations(page);
  await page.goto("/overview");
  await expectNoSeriousViolations(page);
});

test("workspace keyboard flow and responsive dialog preserve focus", async ({ page, request }) => {
  await resetDemo(request);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/workspace");
  await expectNoSeriousViolations(page);
  const trigger = page.getByRole("button", { name: "查看订单上下文" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "订单上下文" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByText("等待人工").first()).toBeVisible();
});

test("approval page has labelled risk status and no serious violations", async ({
  page,
  request,
}) => {
  await seedProposal(request);
  await page.goto("/approvals");
  await expect(page.getByText("等待主管审批")).toBeVisible();
  await expect(page.getByRole("button", { name: "批准退款 ¥128.00" })).toBeVisible();
  await expectNoSeriousViolations(page);
});
