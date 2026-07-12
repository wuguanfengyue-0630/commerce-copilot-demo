import { createDemoRuntime, type DemoRuntime } from "@commerce-copilot/application";
import {
  approvalDecisionRequestSchema,
  approvalDecisionResponseSchema,
  approvalsResponseSchema,
  auditEventsResponseSchema,
  conversationDetailResponseSchema,
  conversationListResponseSchema,
  errorEnvelopeSchema,
  executionResponseSchema,
  knowledgeResponseSchema,
  suggestionResponseSchema,
  workspaceResponseSchema,
} from "@commerce-copilot/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    workspaceResponseSchema.parse(workspace.json());
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
    conversationListResponseSchema.parse(conversations.json());
    expect(conversations.json().conversations).toHaveLength(1);
    expect(conversations.json().conversations[0]).toMatchObject({ conversationId });

    const before = await server.inject({
      method: "GET",
      url: `/api/v1/conversations/${conversationId}`,
    });
    expect(before.statusCode).toBe(200);
    conversationDetailResponseSchema.parse(before.json());
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
    suggestionResponseSchema.parse(suggestion.json());
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
    approvalsResponseSchema.parse(approvals.json());
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

    const decisionPayload = approvalDecisionRequestSchema.parse({
      outcome: "approved",
      proposalVersion: 1,
      comment: "同意退款",
    });
    const decision = await server.inject({
      method: "POST",
      url: `/api/v1/approvals/${proposalId}/decisions`,
      payload: decisionPayload,
    });
    expect(decision.statusCode).toBe(201);
    approvalDecisionResponseSchema.parse(decision.json());
    expect(decision.json()).toMatchObject({
      schemaVersion: 1,
      decision: {
        outcome: "approved",
        actor: { userId: "user-demo-supervisor", role: "supervisor" },
      },
      proposal: {
        proposalId,
        status: "approved",
        version: 2,
        approval: {
          actor: { userId: "user-demo-supervisor", role: "supervisor" },
          approvedAt: "2026-07-11T01:15:00.000Z",
        },
        rejection: null,
        execution: null,
      },
    });

    const staleDecision = await server.inject({
      method: "POST",
      url: `/api/v1/approvals/${proposalId}/decisions`,
      payload: { outcome: "approved", proposalVersion: 1 },
    });
    expect(staleDecision.statusCode).toBe(409);
    errorEnvelopeSchema.parse(staleDecision.json());
    expect(staleDecision.json()).toEqual({
      schemaVersion: 1,
      error: { code: "APPROVAL_CONFLICT", message: "该操作已被处理，请刷新后查看最新状态。" },
    });

    const execution = await server.inject({
      method: "POST",
      url: `/api/v1/actions/${proposalId}/execute`,
    });
    expect(execution.statusCode).toBe(201);
    executionResponseSchema.parse(execution.json());
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

    const completedDetail = await server.inject({
      method: "GET",
      url: `/api/v1/conversations/${conversationId}`,
    });
    expect(completedDetail.json().conversation.proposal).toMatchObject({
      status: "executed",
      approval: { actor: { userId: "user-demo-supervisor", role: "supervisor" } },
      rejection: null,
      execution: {
        status: "succeeded",
        executionId: "mock-execution-0001",
        completedAt: "2026-07-11T01:20:00.000Z",
      },
    });

    const completedApprovals = await server.inject({ method: "GET", url: "/api/v1/approvals" });
    expect(completedApprovals.json()).toMatchObject({
      pending: [],
      history: [
        {
          proposalId,
          proposalVersion: 1,
          outcome: "approved",
          actor: { userId: "user-demo-supervisor", role: "supervisor" },
          comment: expect.any(String),
        },
      ],
    });

    const audit = await server.inject({
      method: "GET",
      url: `/api/v1/audit-events?conversationId=${conversationId}`,
    });
    expect(audit.statusCode).toBe(200);
    auditEventsResponseSchema.parse(audit.json());
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
    knowledgeResponseSchema.parse(knowledge.json());
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
      error: {
        code: "VALIDATION_ERROR",
        details: { issues: [{ path: ["conversationId"] }] },
      },
    });

    const missing = await server.inject({
      method: "GET",
      url: "/api/v1/conversations/conversation-missing",
    });
    expect(missing.statusCode).toBe(404);
    expect(JSON.stringify(missing.json())).not.toContain("stack");
  });

  it("treats canonical response mismatches as sanitized server failures", async () => {
    const runtime = createDemoRuntime();
    const invalidRuntime: DemoRuntime = {
      repositories: {
        ...runtime.repositories,
        conversations: {
          async get(context, id) {
            const conversation = await runtime.repositories.conversations.get(context, id);
            return conversation === null
              ? null
              : ({ ...conversation, customerId: "" } as typeof conversation);
          },
        },
      },
      unitOfWork: runtime.unitOfWork,
      reset: runtime.reset,
    };
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const app = await createApp({ mode: "demo", runtime: invalidRuntime, logger });
    openApps.push(app);
    logger.error.mockClear();

    const response = await app.getHttpAdapter().getInstance().inject({
      method: "GET",
      url: "/api/v1/conversations",
    });
    const serialized = JSON.stringify(response.json());

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      schemaVersion: 1,
      error: { code: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试。" },
    });
    expect(serialized).not.toContain("issues");
    expect(serialized).not.toContain("customerId");
    expect(serialized).not.toContain("stack");
    expect(logger.error).toHaveBeenCalledTimes(1);
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
    const references = collectReferences(document);
    for (const reference of references) {
      expect(
        resolveReference(document, reference),
        `Unresolved OpenAPI ref ${reference}`,
      ).toBeDefined();
    }
    expect(findTypeLessNullableUnions(document)).toEqual([]);
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

    const detailErrors = document.paths["/api/v1/conversations/{conversationId}"].get.responses;
    expect(Object.keys(detailErrors)).toEqual(expect.arrayContaining(["404", "422", "500"]));
    expectRequired(detailErrors["404"].content["application/json"].schema, [
      "schemaVersion",
      "error",
    ]);
    const decisionErrors =
      document.paths["/api/v1/approvals/{proposalId}/decisions"].post.responses;
    expect(Object.keys(decisionErrors)).toEqual(
      expect.arrayContaining(["404", "409", "422", "500"]),
    );
    expectRequired(decisionErrors["409"].content["application/json"].schema, [
      "schemaVersion",
      "error",
    ]);

    const workspaceSchema = responseSchema(document, "/api/v1/workspace", "get", "200");
    const workspaceModel = requiredObject(workspaceSchema, "workspace");
    expectRequired(workspaceModel, [
      "companyId",
      "storeId",
      "metrics",
      "integrations",
      "activeRules",
      "messageSendMode",
      "demoModel",
      "evaluationSummary",
      "setup",
    ]);
    expectRequired(requiredObject(workspaceModel, "metrics"), [
      "openConversations",
      "waitingForAgent",
      "assistantSuggestions",
      "proposalsAwaitingApproval",
      "refundedAmount",
      "measuredAt",
    ]);
    expectRequired(arrayItem(workspaceModel, "integrations"), [
      "storeId",
      "platform",
      "displayName",
      "status",
      "capabilities",
    ]);
    expectRequired(arrayItem(workspaceModel, "activeRules"), [
      "kind",
      "enabled",
      "requiresApproval",
      "requiredRole",
    ]);
    expectRequired(requiredObject(workspaceModel, "evaluationSummary"), [
      "scenario",
      "status",
      "score",
    ]);
    expectRequired(requiredObject(workspaceModel, "setup"), ["status", "acceptedAt"]);

    const detailSchema = responseSchema(
      document,
      "/api/v1/conversations/{conversationId}",
      "get",
      "200",
    );
    const conversation = requiredObject(detailSchema, "conversation");
    expectRequired(conversation, [
      "companyId",
      "storeId",
      "conversationId",
      "customer",
      "status",
      "lastMessagePreview",
      "unreadCount",
      "updatedAt",
      "messages",
      "order",
      "latestSuggestion",
      "citations",
      "proposal",
    ]);
    expectRequired(arrayItem(conversation, "messages"), [
      "messageId",
      "role",
      "origin",
      "content",
      "occurredAt",
    ]);
    expectRequired(requiredObject(conversation, "order"), [
      "companyId",
      "storeId",
      "orderId",
      "version",
      "status",
      "total",
      "refundable",
      "updatedAt",
    ]);
    expectRequired(nullableVariant(propertySchema(conversation, "latestSuggestion")), [
      "suggestionId",
      "companyId",
      "storeId",
      "conversationId",
      "orderId",
      "provider",
      "disposition",
      "suggestedReply",
      "citations",
      "createdAt",
    ]);
    expectRequired(arrayItem(conversation, "citations"), [
      "releaseId",
      "chunkId",
      "sourceTitle",
      "excerpt",
      "version",
    ]);

    const proposal = nullableVariant(propertySchema(conversation, "proposal"));
    expectRequired(proposal, [
      "proposalId",
      "version",
      "companyId",
      "storeId",
      "conversationId",
      "action",
      "status",
      "createdAt",
      "expiresAt",
      "approval",
      "rejection",
      "execution",
    ]);
    expectRequired(requiredObject(proposal, "action"), [
      "kind",
      "orderId",
      "amount",
      "reasonCode",
      "observedOrder",
    ]);
    const proposalExecution = propertySchema(proposal, "execution");
    expect(proposalExecution).toMatchObject({ type: "object", nullable: true });
    expect(proposalExecution.oneOf).toHaveLength(3);

    const approvalsSchema = responseSchema(document, "/api/v1/approvals", "get", "200");
    expectRequired(arrayItem(approvalsSchema, "history"), [
      "proposalId",
      "proposalVersion",
      "outcome",
      "actor",
      "decidedAt",
    ]);

    const executionSchema = responseSchema(
      document,
      "/api/v1/actions/{proposalId}/execute",
      "post",
      "201",
    );
    const executionResult = propertySchema(executionSchema, "result");
    expect(executionResult.oneOf).toHaveLength(2);
    const needsHumanReasons = [
      "ORDER_CHANGED",
      "ORDER_UNAVAILABLE",
      "POLICY_CHANGED",
      "PROPOSAL_EXPIRED",
      "EXECUTION_UNCONFIRMED",
    ];
    expect(propertySchema(oneOfStatus(proposalExecution, "needs_human"), "reason").enum).toEqual(
      needsHumanReasons,
    );
    expect(propertySchema(oneOfStatus(executionResult, "needs_human"), "reason").enum).toEqual(
      needsHumanReasons,
    );

    const auditSchema = responseSchema(document, "/api/v1/audit-events", "get", "200");
    expectRequired(arrayItem(auditSchema, "events"), [
      "auditEventId",
      "companyId",
      "correlationId",
      "causationId",
      "eventType",
      "occurredAt",
    ]);

    const knowledgeSchema = responseSchema(document, "/api/v1/knowledge", "get", "200");
    const policy = arrayItem(knowledgeSchema, "policies");
    expectRequired(policy, [
      "policyId",
      "title",
      "status",
      "scenario",
      "content",
      "refundRule",
      "citations",
      "release",
    ]);
    expectRequired(requiredObject(policy, "release"), [
      "releaseId",
      "version",
      "publishedAt",
      "expiresAt",
      "immutable",
    ]);
  });

  it("resets repositories and connector effects before replaying the full workflow", async () => {
    const server = await openDemoApp();
    const first = await approveAndExecute(server, "approved");
    expect(first.execution.statusCode).toBe(201);
    expect(first.execution.json().result.executionId).toBe("mock-execution-0001");

    await reset(server);
    const seededAudit = await server.inject({
      method: "GET",
      url: `/api/v1/audit-events?conversationId=${conversationId}`,
    });
    expect(
      seededAudit.json().events.map((event: { eventType: string }) => event.eventType),
    ).toEqual(["conversation.message_ingested"]);

    const replay = await approveAndExecute(server, "approved");
    expect(replay.execution.statusCode).toBe(201);
    expect(replay.execution.json().result.executionId).toBe("mock-execution-0001");
  });

  it("isolates workflow mutation between concurrently created apps", async () => {
    const first = await openDemoApp();
    const second = await openDemoApp();

    const mutated = await first.inject({
      method: "POST",
      url: `/api/v1/conversations/${conversationId}/suggestions`,
    });
    expect(mutated.statusCode).toBe(201);

    const firstApprovals = await first.inject({ method: "GET", url: "/api/v1/approvals" });
    const secondApprovals = await second.inject({ method: "GET", url: "/api/v1/approvals" });
    expect(firstApprovals.json().pending).toHaveLength(1);
    expect(secondApprovals.json()).toMatchObject({ pending: [], history: [] });
  });

  it("does not execute or audit execution after a rejection", async () => {
    const server = await openDemoApp();
    const rejected = await approveAndExecute(server, "rejected");

    expect(rejected.execution.statusCode).toBe(409);
    const audit = await server.inject({
      method: "GET",
      url: `/api/v1/audit-events?conversationId=${conversationId}`,
    });
    expect(audit.json().events.map((event: { eventType: string }) => event.eventType)).toEqual([
      "conversation.message_ingested",
      "knowledge.retrieved",
      "agent.suggestion_generated",
      "action.proposed",
      "approval.rejected",
    ]);
  });
});

async function approveAndExecute(
  server: Awaited<ReturnType<typeof openDemoApp>>,
  outcome: "approved" | "rejected",
) {
  const suggestion = await server.inject({
    method: "POST",
    url: `/api/v1/conversations/${conversationId}/suggestions`,
  });
  expect(suggestion.statusCode).toBe(201);
  const proposalId = suggestion.json().proposal.proposalId as string;
  const decision = await server.inject({
    method: "POST",
    url: `/api/v1/approvals/${proposalId}/decisions`,
    payload: { outcome, proposalVersion: 1 },
  });
  expect(decision.statusCode).toBe(201);
  const execution = await server.inject({
    method: "POST",
    url: `/api/v1/actions/${proposalId}/execute`,
  });
  return { proposalId, decision, execution };
}

type OpenApiSchema = {
  type?: string;
  nullable?: boolean;
  enum?: unknown[];
  required?: string[];
  properties: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  oneOf?: OpenApiSchema[];
};

type OpenApiDocument = {
  paths: Record<
    string,
    Record<
      string,
      {
        responses: Record<string, { content: { "application/json": { schema: OpenApiSchema } } }>;
      }
    >
  >;
};

function responseSchema(
  document: OpenApiDocument,
  path: string,
  method: "get" | "post",
  status: string,
): OpenApiSchema {
  const operation = document.paths[path]?.[method];
  const response = operation?.responses[status];
  if (response === undefined)
    throw new Error(`Missing OpenAPI response ${method} ${path} ${status}`);
  return response.content["application/json"].schema;
}

function expectRequired(schema: OpenApiSchema, fields: string[]): void {
  expect(schema.type).toBe("object");
  expect(schema.required).toEqual(expect.arrayContaining(fields));
  expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(fields));
}

function requiredObject(schema: OpenApiSchema, property: string): OpenApiSchema {
  const nested = propertySchema(schema, property);
  expect(nested).toBeDefined();
  return nested as OpenApiSchema;
}

function propertySchema(schema: OpenApiSchema, property: string): OpenApiSchema {
  const nested = schema.properties[property];
  if (nested === undefined) throw new Error(`Missing OpenAPI property ${property}`);
  return nested;
}

function arrayItem(schema: OpenApiSchema, property: string): OpenApiSchema {
  const array = requiredObject(schema, property);
  expect(array.type).toBe("array");
  expect(array.items).toBeDefined();
  return array.items as OpenApiSchema;
}

function nullableVariant(schema: OpenApiSchema): OpenApiSchema {
  expect(schema.nullable).toBe(true);
  expect(schema.type).toBe("object");
  return schema;
}

function oneOfStatus(schema: OpenApiSchema, status: string): OpenApiSchema {
  const branch = schema.oneOf?.find((candidate) =>
    propertySchema(candidate, "status").enum?.includes(status),
  );
  if (branch === undefined) throw new Error(`Missing OpenAPI oneOf status ${status}`);
  return branch;
}

function collectReferences(value: unknown, references: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, references);
  } else if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (key === "$ref" && typeof nested === "string") references.push(nested);
      else collectReferences(nested, references);
    }
  }
  return references;
}

function resolveReference(document: unknown, reference: string): unknown {
  if (!reference.startsWith("#/")) return undefined;
  return reference
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce<unknown>((current, segment) => {
      if (current === null || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[segment];
    }, document);
}

function findTypeLessNullableUnions(value: unknown, paths: string[] = [], path = "$"): string[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      findTypeLessNullableUnions(item, paths, `${path}[${index}]`);
    });
  } else if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (object.nullable === true && Array.isArray(object.oneOf) && object.type === undefined) {
      paths.push(path);
    }
    for (const [key, nested] of Object.entries(object)) {
      findTypeLessNullableUnions(nested, paths, `${path}.${key}`);
    }
  }
  return paths;
}
