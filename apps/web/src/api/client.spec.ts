import { workspaceResponseSchema } from "@commerce-copilot/contracts";
import { describe, expect, it, vi } from "vitest";

import { apiRewritesFor, developmentApiRewrite } from "../config/api-rewrites.ts";
import { type ApiClientError, apiRequest } from "./client.ts";

describe("Next API rewrites", () => {
  it("proxies the API to the local service in development", () => {
    expect(apiRewritesFor("development")).toEqual([developmentApiRewrite]);
  });

  it.each(["production", "test"])("does not expose the loopback proxy in %s", (environment) => {
    expect(apiRewritesFor(environment)).toEqual([]);
  });
});

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
