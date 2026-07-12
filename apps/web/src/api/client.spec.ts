import { workspaceResponseSchema } from "@commerce-copilot/contracts";
import { describe, expect, it, vi } from "vitest";

import { type ApiClientError, apiRequest } from "./client.ts";

describe("apiRequest", () => {
  it("rejects absolute cross-origin URLs before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      apiRequest("https://example.com/api/v1/workspace", workspaceResponseSchema, { fetcher }),
    ).rejects.toThrow("仅允许访问同源 /api/v1/ 接口");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("turns an invalid contract response into an actionable error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ workspace: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      apiRequest("/api/v1/workspace", workspaceResponseSchema, { fetcher }),
    ).rejects.toEqual(
      expect.objectContaining<ApiClientError>({
        name: "ApiClientError",
        message: "服务返回的数据无法使用，请重新加载。",
        actionable: true,
        code: "INVALID_RESPONSE",
      }),
    );
  });
});
