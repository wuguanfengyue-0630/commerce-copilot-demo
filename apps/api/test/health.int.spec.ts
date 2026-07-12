import { createDemoRuntime, type DemoRuntime } from "@commerce-copilot/application";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.ts";
import { resolveServerConfig } from "../src/main.ts";

const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

async function openDemoApp(runtime?: DemoRuntime) {
  const app = await createApp(runtime === undefined ? { mode: "demo" } : { mode: "demo", runtime });
  openApps.push(app);
  return app;
}

describe("API health", () => {
  it("reports the versioned demo health contract", async () => {
    const app = await openDemoApp();
    const response = await app.getHttpAdapter().getInstance().inject({
      method: "GET",
      url: "/api/v1/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ schemaVersion: 1, status: "ok", mode: "demo" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("publishes the health and demo OpenAPI paths", async () => {
    const app = await openDemoApp();
    const docsEntry = await app.getHttpAdapter().getInstance().inject({
      method: "GET",
      url: "/api/docs",
    });
    const docs = await app.getHttpAdapter().getInstance().inject({
      method: "GET",
      url: "/api/docs-json",
    });

    expect(docsEntry.statusCode).toBe(302);
    expect(docsEntry.headers.location).toBe("/api/docs-json");
    expect(docs.statusCode).toBe(200);
    expect(Object.keys(docs.json().paths)).toEqual(
      expect.arrayContaining([
        "/api/v1/health",
        "/api/v1/demo/reset",
        "/api/v1/demo/bootstrap",
        "/api/v1/demo/setup/complete",
      ]),
    );
  });

  it("serves isolated, deterministic demo bootstrap and setup state", async () => {
    const runtime = createDemoRuntime();
    let resetCount = 0;
    const observedRuntime: DemoRuntime = Object.freeze({
      repositories: runtime.repositories,
      unitOfWork: runtime.unitOfWork,
      reset() {
        resetCount += 1;
        runtime.reset();
      },
    });
    const app = await openDemoApp(observedRuntime);
    const server = app.getHttpAdapter().getInstance();

    const initial = await server.inject({ method: "GET", url: "/api/v1/demo/bootstrap" });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({
      schemaVersion: 1,
      actor: { userId: "user-demo-owner", displayName: "演示店主", role: "owner" },
      setup: { status: "incomplete", acceptedAt: null },
      store: {
        companyId: "company-demo",
        storeId: "store-douyin-demo",
        displayName: "抖音电商演示店",
        platform: "douyin",
      },
    });

    const first = await server.inject({ method: "POST", url: "/api/v1/demo/setup/complete" });
    const second = await server.inject({ method: "POST", url: "/api/v1/demo/setup/complete" });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      schemaVersion: 1,
      setup: { status: "complete", acceptedAt: "2026-07-11T01:05:00.000Z" },
    });
    expect(second.json()).toEqual(first.json());

    const reset = await server.inject({ method: "POST", url: "/api/v1/demo/reset" });
    expect(reset.statusCode).toBe(204);
    expect(reset.body).toBe("");
    expect(resetCount).toBe(1);
    const afterReset = await server.inject({ method: "GET", url: "/api/v1/demo/bootstrap" });
    expect(afterReset.json().setup).toEqual({ status: "incomplete", acceptedAt: null });
  });

  it("returns a stable error envelope without implementation details", async () => {
    const app = await openDemoApp();
    const response = await app.getHttpAdapter().getInstance().inject({
      method: "GET",
      url: "/api/v1/missing",
    });
    const body = response.json();

    expect(response.statusCode).toBe(404);
    expect(body).toEqual({ error: { code: "NOT_FOUND", message: "未找到请求的接口。" } });
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("enables CORS only for the restricted development origins", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      const app = await openDemoApp();
      const server = app.getHttpAdapter().getInstance();
      const allowed = await server.inject({
        method: "OPTIONS",
        url: "/api/v1/health",
        headers: { origin: "http://127.0.0.1:5173", "access-control-request-method": "GET" },
      });
      const denied = await server.inject({
        method: "OPTIONS",
        url: "/api/v1/health",
        headers: { origin: "https://example.com", "access-control-request-method": "GET" },
      });

      expect(allowed.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:5173");
      expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("fails closed for unsupported runtime modes", async () => {
    await expect(createApp({ mode: "production" as "demo" })).rejects.toThrow(
      "Unsupported runtime mode: production",
    );
  });
});

describe("server configuration", () => {
  it("uses the loopback demo defaults and accepts explicit host and port", () => {
    expect(resolveServerConfig({})).toEqual({ mode: "demo", host: "127.0.0.1", port: 4000 });
    expect(resolveServerConfig({ APP_MODE: "demo", HOST: "0.0.0.0", PORT: "4100" })).toEqual({
      mode: "demo",
      host: "0.0.0.0",
      port: 4100,
    });
  });

  it.each(["0", "65536", "abc", "4000junk", ""])("rejects invalid PORT %j", (port) => {
    expect(() => resolveServerConfig({ PORT: port })).toThrow(`Invalid PORT: ${port}`);
  });

  it("rejects every non-demo mode", () => {
    expect(() => resolveServerConfig({ APP_MODE: "production" })).toThrow(
      "Unsupported runtime mode: production",
    );
  });
});
