import { readFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDeterministicSuggestionGenerator } from "@commerce-copilot/agent";
import {
  type ApprovalDecisionRecord,
  type AuditEventRepository,
  createDecideApprovalUseCase,
  createDemoRuntime,
  createExecuteActionUseCase,
  createGenerateSuggestionUseCase,
  type ExecutionResultRecord,
  type SuggestionRecord,
} from "@commerce-copilot/application";
import {
  createMockCommerceConnector,
  mockCompanyId,
  mockDamagedItemConversation,
  mockOrderId,
  mockStoreId,
} from "@commerce-copilot/connectors";
import {
  type ActionProposal,
  createProposalId,
  evaluateActionPolicy,
  FixedClock,
  type OrderSnapshot,
} from "@commerce-copilot/domain";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const staticFiles = new Map([
  ["/", { name: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/app.js", { name: "app.js", contentType: "text/javascript; charset=utf-8" }],
  ["/styles.css", { name: "styles.css", contentType: "text/css; charset=utf-8" }],
]);

export type DemoStateView = Readonly<{
  mode: "demo";
  conversation: typeof mockDamagedItemConversation;
  order: OrderSnapshot;
  suggestion: SuggestionRecord | null;
  proposal: ActionProposal | null;
  approvals: readonly ApprovalDecisionRecord[];
  executionResult: ExecutionResultRecord | null;
  capabilities: Awaited<
    ReturnType<ReturnType<typeof createMockCommerceConnector>["getCapabilities"]>
  >;
  auditEvents: Awaited<ReturnType<AuditEventRepository["list"]>>;
}>;

type DemoComposition = ReturnType<typeof createComposition>;

export function createDemoServer() {
  let composition = createComposition();

  return createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", `http://${HOST}`);

      if (method === "GET" && url.pathname === "/health") {
        writeJson(response, 200, { status: "ok", mode: "demo" });
        return;
      }
      if (method === "GET" && url.pathname === "/favicon.ico") {
        response.writeHead(204, { "cache-control": "public, max-age=86400" });
        response.end();
        return;
      }
      if (method === "GET" && url.pathname === "/api/v1/demo/state") {
        writeJson(response, 200, await readState(composition));
        return;
      }
      if (method === "POST" && url.pathname === "/api/v1/demo/reset") {
        composition = createComposition();
        writeJson(response, 200, await readState(composition));
        return;
      }
      if (method === "POST" && url.pathname === "/api/v1/demo/suggestions") {
        const before = await readState(composition);
        if (before.suggestion !== null) {
          writeJson(response, 200, before);
          return;
        }
        await composition.generateSuggestion.execute({
          companyId: mockCompanyId,
          storeId: mockStoreId,
          conversationId: mockDamagedItemConversation.conversationId,
          orderId: mockOrderId,
          correlationId: "demo-suggestion-1",
          causationId: "message-damaged-item-1",
          actorRole: "supervisor",
        });
        writeJson(response, 201, await readState(composition));
        return;
      }

      const proposalRoute = matchProposalRoute(url.pathname);
      if (method === "POST" && proposalRoute !== null) {
        const proposalId = createProposalId(proposalRoute.proposalId);
        if (proposalRoute.action === "approve") {
          const state = await readState(composition);
          if (state.proposal?.proposalId !== proposalId) {
            throw new DemoHttpError("APPROVAL_NOT_FOUND", 404);
          }
          if (state.proposal.status === "pending_approval") {
            await composition.decideApproval.execute({
              companyId: mockCompanyId,
              proposalId,
              proposalVersion: state.proposal.version,
              outcome: "approved",
              actor: { id: "supervisor-demo", role: "supervisor" },
              correlationId: "demo-approval-1",
              causationId: proposalId,
            });
          }
          writeJson(response, 200, await readState(composition));
          return;
        }

        await composition.executeAction.execute({
          companyId: mockCompanyId,
          proposalId,
          actor: { id: "supervisor-demo", role: "supervisor" },
          correlationId: "demo-execution-1",
          causationId: proposalId,
        });
        writeJson(response, 200, await readState(composition));
        return;
      }

      const staticFile = method === "GET" ? staticFiles.get(url.pathname) : undefined;
      if (staticFile !== undefined) {
        const contents = await readFile(
          new URL(`../../web/public/${staticFile.name}`, import.meta.url),
        );
        response.writeHead(200, {
          "cache-control": "no-store",
          "content-type": staticFile.contentType,
        });
        response.end(contents);
        return;
      }

      writeJson(response, 404, errorBody("DEMO_ROUTE_NOT_FOUND", "未找到该演示接口。"));
    } catch (error) {
      const code = errorCode(error);
      writeJson(response, errorStatus(error, code), errorBody(code, errorMessage(code)));
    }
  });
}

function createComposition() {
  const runtime = createDemoRuntime();
  const connector = createMockCommerceConnector();
  const generateSuggestion = createGenerateSuggestionUseCase({
    repositories: runtime.repositories,
    unitOfWork: runtime.unitOfWork,
    commerceConnector: connector,
    suggestionGenerator: createDeterministicSuggestionGenerator(),
    clock: new FixedClock(new Date("2026-07-11T01:10:00.000Z")),
    policyRules: Object.freeze([{ kind: "after_sale.refund", enabled: true }]),
    policyEvaluator: evaluateActionPolicy,
  });
  const decideApproval = createDecideApprovalUseCase({
    repositories: runtime.repositories,
    unitOfWork: runtime.unitOfWork,
    clock: new FixedClock(new Date("2026-07-11T01:11:00.000Z")),
  });
  const executeAction = createExecuteActionUseCase({
    repositories: runtime.repositories,
    unitOfWork: runtime.unitOfWork,
    commerceConnector: connector,
    clock: new FixedClock(new Date("2026-07-11T01:12:00.000Z")),
  });

  return Object.freeze({ runtime, connector, generateSuggestion, decideApproval, executeAction });
}

async function readState(composition: DemoComposition): Promise<DemoStateView> {
  const context = Object.freeze({
    companyId: mockCompanyId,
    correlationId: "demo-state-read",
    causationId: "demo-state-read",
  });
  const [conversation, order, suggestions, proposals, capabilities, auditEvents] =
    await Promise.all([
      composition.runtime.repositories.conversations.get(
        context,
        mockDamagedItemConversation.conversationId,
      ),
      composition.connector.getOrder({ storeId: mockStoreId, orderId: mockOrderId }),
      composition.runtime.repositories.suggestions.listByConversation(
        context,
        mockDamagedItemConversation.conversationId,
      ),
      composition.runtime.repositories.proposals.listByConversation(
        context,
        mockDamagedItemConversation.conversationId,
      ),
      composition.connector.getCapabilities(mockStoreId),
      composition.runtime.repositories.auditEvents.list(context),
    ]);
  if (conversation === null) {
    throw new DemoHttpError("DEMO_STATE_UNAVAILABLE", 500);
  }

  const suggestion = suggestions.at(-1) ?? null;
  const proposal = proposals.at(-1) ?? null;
  const approvals =
    proposal === null
      ? Object.freeze([])
      : await composition.runtime.repositories.approvalDecisions.listByProposal(
          context,
          proposal.proposalId,
        );
  const executionResults =
    proposal === null
      ? Object.freeze([])
      : await composition.runtime.repositories.executionResults.listByProposal(
          context,
          proposal.proposalId,
        );

  return Object.freeze({
    mode: "demo",
    conversation,
    order,
    suggestion,
    proposal,
    approvals,
    executionResult: executionResults.at(-1) ?? null,
    capabilities,
    auditEvents,
  });
}

function matchProposalRoute(pathname: string) {
  const match = /^\/api\/v1\/demo\/proposals\/([^/]+)\/(approve|execute)$/.exec(pathname);
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }
  try {
    return { proposalId: decodeURIComponent(match[1]), action: match[2] as "approve" | "execute" };
  } catch {
    throw new DemoHttpError("DEMO_INVALID_PATH", 422);
  }
}

function writeJson(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

function errorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "DEMO_REQUEST_FAILED";
}

function errorStatus(error: unknown, code: string): number {
  if (error instanceof DemoHttpError) {
    return error.status;
  }
  if (code.includes("NOT_FOUND")) return 404;
  if (code.includes("CONFLICT") || code.includes("DUPLICATE")) return 409;
  if (code.includes("INVALID") || code.includes("ROLE_REQUIRED")) return 422;
  return 500;
}

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    APPROVAL_NOT_FOUND: "未找到待审批的退款提案，请先生成建议。",
    APPROVAL_CONFLICT: "该退款提案已处理，请刷新后查看最新状态。",
    EXECUTION_NOT_FOUND: "未找到可执行的退款提案。",
    EXECUTION_CONFLICT: "当前退款状态不可执行，请刷新后重试。",
    GENERATE_SUGGESTION_DUPLICATE_COMMAND: "本次建议已经生成。",
    DEMO_INVALID_PATH: "请求路径无效。",
    DEMO_STATE_UNAVAILABLE: "演示状态暂不可用，请重置演示。",
  };
  return messages[code] ?? "操作未完成，请重试；如仍失败，请重置演示。";
}

class DemoHttpError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
  const port = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
  const host = process.env.HOST ?? HOST;
  createDemoServer().listen(port, host, () => {
    console.log(`Commerce Copilot demo: http://${host}:${port}`);
  });
}
