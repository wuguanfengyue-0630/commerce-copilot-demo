import { expect, test } from "@playwright/test";
import { completeSetup, resetDemo } from "./helpers.ts";

test("completes the six-step demo setup and lands on overview", async ({ page, request }) => {
  await resetDemo(request);
  await page.goto("/setup");
  await expect(page.getByText("当前数据与操作仅用于演示，不会触达真实平台。")).toBeVisible();
  await completeSetup(page);
  await page.getByRole("link", { name: "进入总览" }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: "运营总览" })).toBeVisible();
});
