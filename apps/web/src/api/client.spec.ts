import { workspaceResponseSchema } from "@commerce-copilot/contracts";
import { describe, expect, it, vi } from "vitest";

import { apiRewritesFor, developmentApiRewrite } from "../config/api-rewrites.ts";
import { legacyIndexRedirects } from "../config/legacy-redirects.ts";
import { type ApiClientError, apiRequest } from "./client.ts";

describe("Next API rewrites", () => {
  it("proxies the API to the local service in development", () => {
    expect(apiRewritesFor("development")).toEqual([developmentApiRewrite]);
  });

  it.each(["production", "test"])("does not expose the loopback proxy in %s", (environment) => {
    expect(apiRewritesFor(environment)).toEqual([]);
  });

  it("redirects the legacy public index without exposing it through Next", () => {
    expect(legacyIndexRedirects()).toEqual([
      { source: "/index.html", destination: "/", permanent: false },
    ]);
  });
});

describe("apiRequest", () => {
  const baseUrl = "https://console.example.test";

  it("rejects absolute cross-origin URLs before fetching", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      apiRequest("https://example.com/api/v1/workspace", workspaceResponseSchema, {
        baseUrl,
        fetcher,
      }),
    ).rejects.toThrow("仅允许访问同源 /api/v1/ 接口");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    "/api/v1/../../../admin",
    "/api/v1/%2e%2e/%2e%2e/admin",
    "//evil.example/api/v1/workspace",
    "https://user:secret@console.example.test/api/v1/workspace",
    "/api/v1/workspace#private",
  ])("rejects unsafe canonical API input %s", async (path) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(apiRequest(path, workspaceResponseSchema, { baseUrl, fetcher })).rejects.toThrow(
      "仅允许访问同源 /api/v1/ 接口",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fetches the normalized relative API path and preserves its query", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ workspace: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await apiRequest(
      "/api/v1/workspace?view=queue",
      { safeParse: (value) => ({ success: true, data: value }) },
      {
        baseUrl,
        fetcher,
      },
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/workspace?view=queue",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("uses the trusted absolute URL when fetching during SSR", async () => {
    vi.stubGlobal("location", undefined);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    try {
      await apiRequest(
        "/api/v1/workspace?x=1",
        { safeParse: (value) => ({ success: true, data: value }) },
        { baseUrl, fetcher },
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(fetcher).toHaveBeenCalledWith(
      "https://console.example.test/api/v1/workspace?x=1",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("accepts a successful no-content command response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      apiRequest(
        "/api/v1/demo/reset",
        {
          safeParse: (value) =>
            value === undefined
              ? { success: true as const, data: undefined }
              : { success: false as const },
        },
        { baseUrl, fetcher, method: "POST" },
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    { "content-type": "application/json", "x-trace-id": "object" },
    new Headers({ "content-type": "application/json", "x-trace-id": "headers" }),
    [
      ["content-type", "application/json"],
      ["x-trace-id", "tuples"],
    ] as [string, string][],
  ])("preserves HeadersInit while adding accept", async (headers) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await apiRequest(
      "/api/v1/workspace",
      { safeParse: (value) => ({ success: true, data: value }) },
      {
        baseUrl,
        fetcher,
        headers,
      },
    );
    const sent = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(sent.get("content-type")).toBe("application/json");
    expect(sent.get("x-trace-id")).toBeTruthy();
    expect(sent.get("accept")).toBe("application/json");
  });

  it("rethrows AbortError unchanged", async () => {
    const abort = new DOMException("The operation was aborted", "AbortError");
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(abort);
    await expect(
      apiRequest("/api/v1/workspace", workspaceResponseSchema, { baseUrl, fetcher }),
    ).rejects.toBe(abort);
  });

  it("turns an invalid contract response into an actionable error", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ workspace: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      apiRequest("/api/v1/workspace", workspaceResponseSchema, { baseUrl, fetcher }),
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
