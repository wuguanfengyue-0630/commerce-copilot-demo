import { strict as assert } from "node:assert";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const baseUrl = process.env.MVP_URL ?? "http://127.0.0.1:3000";
const chromePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const outputDirectory = fileURLToPath(new URL("../output/playwright/", import.meta.url));

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath, headless: true });

try {
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktop = await desktopContext.newPage();
  const browserErrors = [];
  desktop.on("pageerror", (error) => browserErrors.push(error.message));
  desktop.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await desktop.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await desktop.getByRole("button", { name: "生成有据建议" }).waitFor();
  await desktop.screenshot({ path: `${outputDirectory}mvp-desktop-initial.png` });

  await desktop.getByRole("button", { name: "生成有据建议" }).click();
  await desktop.getByRole("button", { name: /批准退款/ }).waitFor();
  await desktop.getByRole("button", { name: /批准退款/ }).click();
  await desktop.getByRole("button", { name: "执行模拟退款" }).waitFor();
  await desktop.getByRole("button", { name: "执行模拟退款" }).click();
  await desktop.getByText("模拟退款已执行", { exact: true }).first().waitFor();
  await desktop.getByRole("tab", { name: "审计" }).click();
  await desktop.locator(".audit-item").nth(6).waitFor();

  assert.equal(await desktop.locator(".audit-item").count(), 7);
  assert.equal(browserErrors.length, 0, browserErrors.join("\n"));
  await desktop.screenshot({
    path: `${outputDirectory}mvp-desktop-complete.png`,
  });

  await desktop.request.post(`${baseUrl}/api/v1/demo/reset`);
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await mobileContext.newPage();
  await mobile.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await mobile.getByRole("button", { name: "生成有据建议" }).waitFor();
  const overflows = await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflows, false, "mobile page has horizontal overflow");
  await mobile.screenshot({
    path: `${outputDirectory}mvp-mobile.png`,
    fullPage: true,
  });

  console.log("MVP browser smoke passed: workflow, audit timeline, desktop and mobile layouts.");
} finally {
  await browser.close();
}
