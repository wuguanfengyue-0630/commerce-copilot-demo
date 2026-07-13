import type { APIRequestContext, Page } from "@playwright/test";

const apiOrigin = "http://127.0.0.1:4000";

export async function resetDemo(request: APIRequestContext) {
  const response = await request.post(`${apiOrigin}/api/v1/demo/reset`);
  if (!response.ok()) throw new Error(`Demo reset failed: ${response.status()}`);
}

export async function seedProposal(request: APIRequestContext) {
  await resetDemo(request);
  const conversations = await request.get(`${apiOrigin}/api/v1/conversations`);
  const body = (await conversations.json()) as { conversations: Array<{ conversationId: string }> };
  const conversationId = body.conversations[0]?.conversationId;
  if (!conversationId) throw new Error("Seeded conversation is missing");
  const suggestion = await request.post(
    `${apiOrigin}/api/v1/conversations/${encodeURIComponent(conversationId)}/suggestions`,
  );
  if (!suggestion.ok()) throw new Error(`Suggestion seed failed: ${suggestion.status()}`);
  return conversationId;
}

export async function completeSetup(page: Page) {
  const steps = [
    "管理员演示身份",
    "确定性演示模型",
    "模拟抖音店铺",
    "同步夹具",
    "发布破损退款政策",
  ];
  for (const heading of steps) {
    await page.getByRole("heading", { name: heading }).waitFor();
    const next = page.getByRole("button", { name: "下一步" });
    await next.waitFor({ state: "visible" });
    await next.click();
  }
  await page.getByRole("heading", { name: "运行验收对话" }).waitFor();
  await page.getByRole("button", { name: /运行验收并完成设置|完成设置/ }).click();
  await page.getByText("模拟环境已就绪，不代表已获得飞鸽消息权限").waitFor();
}
