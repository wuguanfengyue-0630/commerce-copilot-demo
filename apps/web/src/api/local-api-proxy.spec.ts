import { describe, expect, it, vi } from "vitest";
import { proxyLocalDemoApi } from "./local-api-proxy.ts";

describe("proxyLocalDemoApi", () => {
  it("forwards a same-service GET to the fixed loopback API and preserves query parameters", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await proxyLocalDemoApi(
      new Request("https://demo.example/api/v1/audit-events?conversationId=conversation-1"),
      ["audit-events"],
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/api/v1/audit-events?conversationId=conversation-1",
      expect.objectContaining({ method: "GET" }),
    );
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("forwards a financial POST body once without credentials or arbitrary headers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ result: "accepted" }), {
        status: 201,
        headers: { "content-type": "application/json", "set-cookie": "private=1" },
      }),
    );
    const request = new Request("https://demo.example/api/v1/approvals/proposal-1/decisions", {
      method: "POST",
      headers: {
        authorization: "Bearer must-not-forward",
        "content-type": "application/json",
        "x-untrusted": "ignore",
      },
      body: JSON.stringify({ outcome: "approved", proposalVersion: 1 }),
    });

    const response = await proxyLocalDemoApi(
      request,
      ["approvals", "proposal-1", "decisions"],
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, init] = fetcher.mock.calls[0] ?? [];
    expect(new Headers(init?.headers)).toEqual(
      new Headers({ accept: "application/json", "content-type": "application/json" }),
    );
    expect(init?.body).toBe(JSON.stringify({ outcome: "approved", proposalVersion: 1 }));
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.status).toBe(201);
  });

  it("preserves a bodyless POST for empty command endpoints", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "accepted" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );

    await proxyLocalDemoApi(
      new Request("https://demo.example/api/v1/conversations/conversation-1/suggestions", {
        method: "POST",
        body: new Uint8Array(),
      }),
      ["conversations", "conversation-1", "suggestions"],
      fetcher,
    );

    const [, init] = fetcher.mock.calls[0] ?? [];
    expect(init).not.toHaveProperty("body");
  });
});
