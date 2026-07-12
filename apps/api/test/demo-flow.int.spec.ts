import { createDemoRuntime } from "@commerce-copilot/application";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app.ts";

const conversationId = "conversation-damaged-item-1";
const companyId = "company-demo";
const storeId = "store-douyin-demo";

const openApps: Awaited<ReturnType<typeof createApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

async function openDemoApp() {
  const app = await createApp({ mode: "demo", logger: false, runtime: createDemoRuntime() });
  openApps.push(app);
  return app.getHttpAdapter().getInstance();
}

async function reset(server: Awaited<ReturnType<typeof openDemoApp>>) {
  const response = await server.inject({ method: "POST", url: "/api/v1/demo/reset" });
  expect(response.statusCode).toBe(204);
}

describe("typed demo workflow API", () => {
  it.each([
    ["workspace", "/api/v1/workspace"],
    ["conversations", "/api/v1/conversations"],
    ["conversation detail", `/api/v1/conversations/${conversationId}`],
    ["approvals", "/api/v1/approvals"],
    ["knowledge", "/api/v1/knowledge"],
  ])("exposes the seeded %s read model", async (_name, url) => {
    const server = await openDemoApp();
    const response = await server.inject({ method: "GET", url });

    expect(response.statusCode).toBe(200);
    expect(response.json().schemaVersion).toBe(1);
  });

  it("runs the complete assisted customer-service workflow once", async () => {
    const server = await openDemoApp();
    await reset(server);

    const workspace = await server.inject({ method: "GET", url: "/api/v1/workspace" });
    expect(workspace.statusCode).toBe(200);
    expect(workspace.json()).toMatchObject({
      schemaVersion: 1,
      workspace: {
        companyId,
        storeId,
        messageSendMode: "assisted",
        demoModel: { provider: "deterministic-demo" },
        setup: { status: "incomplete" },
      },
    });

    const conversations = await server.inject({
      method: "GET",
      url: "/api/v1/conversations",
    });
    expect(conversations.statusCode).toBe(200);
    expect(conversations.json().conversations).toHaveLength(1);
    expect(conversations.json().conversations[0]).toMatchObject({ conversationId });

    const before = await server.inject({
      method: "GET",
      url: `/api/v1/conversations/${conversationId}`,
    });
    expect(before.statusCode).toBe(200);
    expect(before.json().conversation).toMatchObject({
      conversationId,
      messages: [{ role: "customer", origin: "platform" }],
      order: {
        orderId: "order-delivered-12800",
        refundable: { amountMinor: 12_800, currency: "CNY" },
      },
      latestSuggestion: null,
      proposal: null,
    });

    const suggestion = await server.inject({
      method: "POST",
      url: `/api/v1/conversations/${conversationId}/suggestions`,
    });
    expect(suggestion.statusCode).toBe(201);
    expect(suggestion.json()).toMatchObject({
      schemaVersion: 1,
      suggestion: {
        conversationId,
        disposition: "propose_action",
        provider: "deterministic-demo",
        citations: [{ releaseId: "knowledge-release-damaged-item-v1", version: 1 }],
      },
      proposal: {
        status: "pending_approval",
        version: 1,
        action: {
          kind: "after_sale.refund",
          amount: { amountMinor: 12_800, currency: "CNY" },
          observedOrder: { version: 1, status: "delivered" },
        },
      },
    });
    const proposalId = suggestion.json().proposal.proposalId as string;

    const duplicateSuggestion = await server.inject({
      method: "POST",
      url: `/api/v1/conversations/${conversationId}/suggestions`,
    });
    expect(duplicateSuggestion.statusCode).toBe(409);

    const approvals = await server.inject({ method: "GET", url: "/api/v1/approvals" });
    expect(approvals.statusCode).toBe(200);
    expect(approvals.json()).toMatchObject({
      pending: [{ proposalId, version: 1, status: "pending_approval" }],
      history: [],
    });

    const rejectedActorInput = await server.inject({
      method: "POST",
      url: `/api/v1/approvals/${proposalId}/decisions`,
      payload: {
        outcome: "approved",
        proposalVersion: 1,
        actor: { id: "attacker", role: "admin" },
      },
    });
    expect(rejectedActorInput.statusCode).toBe(422);

    const decision = await server.inject({
      method: "POST",
      url: `/api/v1/approvals/${proposalId}/decisions`,
      payload: { outcome: "approved", proposalVersion: 1, comment: "同意退款" },
    });
    expect(decision.statusCode).toBe(201);
    expect(decision.json()).toMatchObject({
      schemaVersion: 1,
      decision: {
        outcome: "approved",
        actor: { userId: "user-demo-supervisor", role: "supervisor" },
      },
      proposal: { proposalId, status: "approved", version: 2 },
    });

    const staleDecision = await server.inject({
      method: "POST",
      url: `/api/v1/approvals/${proposalId}/decisions`,
      payload: { outcome: "approved", proposalVersion: 1 },
    });
    expect(staleDecision.statusCode).toBe(409);
    expect(staleDecision.json()).toEqual({
      schemaVersion: 1,
      error: { code: "APPROVAL_CONFLICT", message: "该操作已被处理，请刷新后查看最新状态。" },
    });

    const execution = await server.inject({
      method: "POST",
      url: `/api/v1/actions/${proposalId}/execute`,
    });
    expect(execution.statusCode).toBe(201);
    expect(execution.json()).toMatchObject({
      schemaVersion: 1,
      result: { status: "succeeded", proposalId, executionId: "mock-execution-0001" },
    });

    const repeatedExecution = await server.inject({
      method: "POST",
      url: `/api/v1/actions/${proposalId}/execute`,
    });
    expect(repeatedExecution.statusCode).toBe(201);
    expect(repeatedExecution.json()).toEqual(execution.json());

    const audit = await server.inject({
      method: "GET",
      url: `/api/v1/audit-events?conversationId=${conversationId}`,
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().events.map((event: { eventType: string }) => event.eventType)).toEqual([
      "conversation.message_ingested",
      "knowledge.retrieved",
      "agent.suggestion_generated",
      "action.proposed",
      "approval.approved",
      "action.execution_started",
      "action.execution_succeeded",
    ]);

    const unrelatedAudit = await server.inject({
      method: "GET",
      url: "/api/v1/audit-events?conversationId=conversation-other",
    });
    expect(unrelatedAudit.statusCode).toBe(200);
    expect(unrelatedAudit.json().events).toEqual([]);

    const knowledge = await server.inject({ method: "GET", url: "/api/v1/knowledge" });
    expect(knowledge.statusCode).toBe(200);
    expect(knowledge.json().policies).toHaveLength(1);
    expect(knowledge.json().policies[0]).toMatchObject({
      status: "published",
      release: {
        releaseId: "knowledge-release-damaged-item-v1",
        version: 1,
        publishedAt: "2026-07-11T01:00:00.000Z",
      },
    });
  });

  it("returns unified failures for invalid and missing workflow input", async () => {
    const server = await openDemoApp();
    const invalidQuery = await server.inject({
      method: "GET",
      url: "/api/v1/audit-events?conversationId=",
    });
    expect(invalidQuery.statusCode).toBe(422);
    expect(invalidQuery.json()).toMatchObject({
      schemaVersion: 1,
      error: { code: "VALIDATION_ERROR" },
    });

    const missing = await server.inject({
      method: "GET",
      url: "/api/v1/conversations/conversation-missing",
    });
    expect(missing.statusCode).toBe(404);
    expect(JSON.stringify(missing.json())).not.toContain("stack");
  });

  it.each([
    ["suggestion", `/api/v1/conversations/${conversationId}/suggestions`],
    ["execution", "/api/v1/actions/proposal-attacker/execute"],
  ])("rejects untrusted actor fields on the %s command", async (_name, url) => {
    const server = await openDemoApp();
    const response = await server.inject({
      method: "POST",
      url,
      payload: { actor: { id: "attacker", role: "admin" } },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      schemaVersion: 1,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("documents every workflow route and the strict approval request", async () => {
    const server = await openDemoApp();
    const response = await server.inject({ method: "GET", url: "/api/docs-json" });
    const document = response.json();
    const paths = Object.keys(document.paths);

    expect(paths).toEqual(
      expect.arrayContaining([
        "/api/v1/workspace",
        "/api/v1/conversations",
        "/api/v1/conversations/{conversationId}",
        "/api/v1/conversations/{conversationId}/suggestions",
        "/api/v1/approvals",
        "/api/v1/approvals/{proposalId}/decisions",
        "/api/v1/actions/{proposalId}/execute",
        "/api/v1/knowledge",
        "/api/v1/audit-events",
      ]),
    );
    const approvalSchema =
      document.paths["/api/v1/approvals/{proposalId}/decisions"].post.requestBody.content[
        "application/json"
      ].schema;
    expect(approvalSchema).toMatchObject({
      additionalProperties: false,
      required: ["outcome", "proposalVersion"],
      properties: {
        outcome: { enum: ["approved", "rejected"] },
        proposalVersion: { type: "integer", minimum: 1 },
        comment: { type: "string" },
      },
    });
    expect(approvalSchema.properties).not.toHaveProperty("actor");
  });
});
