# Commerce Copilot Demo Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build a polished, locally runnable Chinese customer-service console that demonstrates the complete conversation → grounded suggestion → refund proposal → supervisor approval → idempotent mock execution → audit timeline workflow without platform credentials, model keys, Docker, PostgreSQL, or Redis.

**Architecture:** Use a pnpm TypeScript monorepo with a pure domain package, an application/use-case package, a connector package, a deterministic demo agent, a NestJS/Fastify API, and a Next.js web console. All business behavior goes through explicit ports so the next implementation plan can replace in-memory adapters with PostgreSQL, BullMQ, MinIO, real model gateways, and the official Douyin connector without rewriting the UI or use cases.

**Tech Stack:** Node.js 24.14.1, pnpm 11.7.0, TypeScript 7.0.2, NestJS 11.1.28, Fastify 5.10.0, Next.js 16.2.10, React 19.2.7, Tailwind CSS 4.3.2, Zod 4.4.3, Vitest 4.1.10, Testing Library 16.3.2, Playwright 1.61.1, Biome 2.5.3.

---

## Scope and follow-on plans

This plan is the first independently testable delivery package. It deliberately does not create empty production adapters.

1. **This plan — demo vertical slice:** deterministic model, in-memory repositories, mock commerce connector, complete API and UI workflow.
2. **Plan 2 — production runtime:** PostgreSQL/pgvector, Drizzle migrations, transactional outbox, Redis/BullMQ, MinIO, local authentication/RBAC, encrypted secrets, real model gateway, Docker Compose and deployment checks.
3. **Plan 3 — Douyin connector:** self-use OAuth, token refresh, products, orders, logistics, after-sales APIs, webhook verification, capability probing and FlyPigeon assistant mode.
4. **Plan 4 — production hardening:** observability, backups, data retention, security tests, AI evaluation gates and operating manuals.
5. **Platform plans:** one official-document and real-authorization plan for Taobao/Tmall, JD, Pinduoduo, Xiaohongshu and Kuaishou respectively.

The demo runtime must show a visible “模拟环境” banner. Production mode is not implemented in this plan and must fail closed rather than silently enabling demo authentication or in-memory persistence.

## Locked file map

### Root and tooling

~~~text
package.json                              Workspace scripts and pinned tool versions
pnpm-workspace.yaml                       apps/* and packages/*
pnpm-lock.yaml                            Reproducible dependency graph
tsconfig.base.json                        Strict TypeScript defaults
biome.json                                Formatting and lint rules
vitest.workspace.ts                       Package and app test projects
playwright.config.ts                      API + web test servers and browser settings
.editorconfig                             UTF-8 and line-ending defaults
.gitattributes                            Text normalization
.gitignore                                Secrets, build output and test artifacts
.npmrc                                    exact versions and engine enforcement
.nvmrc                                    Node 24.14.1
.env.example                              Demo-only public configuration
README.md                                 Local run and verification instructions
~~~

### Shared packages

~~~text
packages/domain/src/shared/ids.ts                         Branded identifiers
packages/domain/src/shared/money.ts                       Integer-minor-unit money
packages/domain/src/shared/clock.ts                       Deterministic time port
packages/domain/src/platform/capabilities.ts              Capability names and state
packages/domain/src/orders/order-snapshot.ts              Versioned order facts
packages/domain/src/conversations/conversation.ts         Conversation and message types
packages/domain/src/knowledge/citation.ts                  Immutable knowledge citations
packages/domain/src/actions/action-proposal.ts             Proposal state machine
packages/domain/src/policies/action-policy.ts              Default-deny write policy
packages/domain/src/audit/audit-event.ts                   Whitelisted audit events
packages/domain/src/index.ts                               Public domain exports

packages/contracts/src/api.ts                              Shared API response schemas
packages/contracts/src/workspace.ts                        Dashboard and conversation schemas
packages/contracts/src/actions.ts                          Proposal and approval schemas
packages/contracts/src/settings.ts                         Integration/rule/model/evaluation schemas
packages/contracts/src/index.ts                            Public contract exports

packages/application/src/ports/repositories.ts             Repository boundaries
packages/application/src/ports/commerce-connector.ts       Connector boundary
packages/application/src/ports/suggestion-generator.ts     Model boundary
packages/application/src/runtime/demo-runtime.ts            In-memory composition root
packages/application/src/suggestions/generate-suggestion.ts Grounded suggestion use case
packages/application/src/actions/decide-approval.ts         Approval use case
packages/application/src/actions/execute-action.ts          Recheck and execute use case
packages/application/src/index.ts                           Public use-case exports

packages/connectors/src/mock/mock-commerce-connector.ts     Deterministic store/order/action adapter
packages/connectors/src/mock/mock-fixtures.ts               One stable demo store and conversation
packages/connectors/src/mock/mock-commerce-connector.spec.ts Connector contract tests
packages/connectors/src/index.ts                            Public connector exports

packages/agent/src/deterministic-suggestion-generator.ts    No-key, repeatable demo suggestion
packages/agent/src/deterministic-suggestion-generator.spec.ts Evidence gate tests
packages/agent/src/index.ts                                 Public agent exports

packages/ui/src/styles/tokens.css                           Light/dark design tokens
packages/ui/src/lib/cn.ts                                   Class composition helper
packages/ui/src/button.tsx                                  Button states and danger labels
packages/ui/src/badge.tsx                                   Text-labelled status badge
packages/ui/src/card.tsx                                    Surface primitive
packages/ui/src/dialog.tsx                                  Accessible modal primitive
packages/ui/src/skeleton.tsx                                Stable loading placeholder
packages/ui/src/index.ts                                    Public UI exports
packages/ui/src/primitives.spec.tsx                         Accessibility behavior tests
~~~

### API

~~~text
apps/api/src/main.ts                                        Runtime entry point
apps/api/src/create-app.ts                                  Testable Nest/Fastify bootstrap
apps/api/src/app.module.ts                                  Module composition
apps/api/src/common/api-error.filter.ts                     Unified error envelope
apps/api/src/demo/demo.module.ts                            Demo-only provider graph
apps/api/src/demo/demo.controller.ts                        Reset/bootstrap endpoints
apps/api/src/health/health.controller.ts                    Liveness endpoint
apps/api/src/workspace/workspace.controller.ts              Dashboard, session and settings reads
apps/api/src/conversations/conversations.controller.ts      Conversation and suggestion endpoints
apps/api/src/approvals/approvals.controller.ts              Approval and execution endpoints
apps/api/src/knowledge/knowledge.controller.ts              Demo knowledge endpoints
apps/api/src/audit/audit.controller.ts                      Read-only timeline
apps/api/test/demo-flow.int.spec.ts                         Complete API integration flow
~~~

### Web

~~~text
apps/web/src/app/layout.tsx                                 Root metadata and providers
apps/web/src/app/globals.css                                Tailwind and product styling
apps/web/src/app/providers.tsx                              Query and theme providers
apps/web/src/app/page.tsx                                   Redirect to setup or overview
apps/web/src/app/setup/page.tsx                             First-run demo setup
apps/web/src/app/(console)/layout.tsx                       App shell
apps/web/src/app/(console)/overview/page.tsx                Metrics and health
apps/web/src/app/(console)/workspace/page.tsx               Three-column console
apps/web/src/app/(console)/approvals/page.tsx               Approval queue
apps/web/src/app/(console)/knowledge/page.tsx               Published knowledge
apps/web/src/app/(console)/integrations/page.tsx            Capability matrix
apps/web/src/app/(console)/rules/page.tsx                   Default-deny rules
apps/web/src/app/(console)/models/page.tsx                  Demo provider state
apps/web/src/app/(console)/evaluations/page.tsx             Demo evaluation results
apps/web/src/app/(console)/audit/page.tsx                   Audit timeline
apps/web/src/components/shell/app-shell.tsx                 Navigation and demo banner
apps/web/src/components/shell/side-nav.tsx                  Route navigation
apps/web/src/components/feedback/async-state.tsx            Loading/empty/error/human states
apps/web/src/features/setup/setup-wizard.tsx                Six-step setup flow
apps/web/src/features/workspace/workspace-view.tsx          Three-pane orchestration
apps/web/src/features/workspace/conversation-list.tsx       Conversation selection
apps/web/src/features/workspace/message-thread.tsx          Human/AI-labelled thread
apps/web/src/features/workspace/suggestion-card.tsx         Editable grounded reply
apps/web/src/features/workspace/context-panel.tsx           Order, citation and proposal
apps/web/src/features/approvals/approval-detail.tsx         Explicit-impact approval
apps/web/src/features/audit/audit-timeline.tsx              Immutable event replay
apps/web/src/lib/api/http-client.ts                         Typed error-aware client
apps/web/src/lib/api/queries.ts                             Query functions and keys
apps/web/src/test/setup.ts                                  DOM matcher setup
apps/web/src/features/workspace/workspace-view.spec.tsx     Workspace component tests
apps/web/src/features/approvals/approval-detail.spec.tsx    Approval component tests
~~~

### End-to-end tests

~~~text
tests/e2e/demo-setup.spec.ts                                First-run setup
tests/e2e/demo-vertical-loop.spec.ts                        Conversation to audit loop
tests/e2e/management-pages.spec.ts                          Every route smoke test
tests/e2e/accessibility.spec.ts                             Keyboard and axe checks
~~~

## Type and dependency rules

- IDs are branded strings: CompanyId, StoreId, ConversationId, ProposalId and AuditEventId.
- Monetary values use Money with amountMinor and currency; JavaScript floating-point currency values are forbidden.
- ActionProposal.payload is a discriminated union. This plan implements only after_sale.refund.
- Domain records use nouns; inputs use Command or Query; outputs use Result.
- HTTP request objects use Dto suffix and never enter the domain package.
- Audit codes are lowercase dotted past-tense events such as action.approved.
- Every asynchronous or audited operation carries companyId, correlationId and causationId.
- Dependency direction is domain → application → agent/connectors → apps. Domain imports no Zod, NestJS, React or infrastructure package.
- Helper functions shown in test snippets are local builders declared in the same spec file; implementation must not rely on undeclared globals or hidden shared state.

## Task 1: Bootstrap the pinned pnpm workspace

**Files:**
- Create: package.json
- Create: pnpm-workspace.yaml
- Create: tsconfig.base.json
- Create: biome.json
- Create: vitest.workspace.ts
- Create: .editorconfig
- Create: .gitattributes
- Create: .gitignore
- Create: .npmrc
- Create: .nvmrc
- Create: .env.example
- Create: package manifests and tsconfig files under apps/* and packages/*

- [ ] **Step 1: Create a failing workspace verification script**

Create scripts/verify-workspace.mjs that checks all required workspace directories and package names and exits non-zero when they are absent.

~~~js
import { access } from "node:fs/promises";

const required = [
  "apps/api/package.json",
  "apps/web/package.json",
  "packages/domain/package.json",
  "packages/contracts/package.json",
  "packages/application/package.json",
  "packages/connectors/package.json",
  "packages/agent/package.json",
  "packages/ui/package.json"
];

for (const path of required) {
  await access(new URL("../" + path, import.meta.url));
}

console.log("workspace verified");
~~~

- [ ] **Step 2: Run the verifier and confirm failure**

Run:

~~~powershell
node scripts/verify-workspace.mjs
~~~

Expected: FAIL with ENOENT for the first missing package manifest.

- [ ] **Step 3: Create the root package manifest**

Use the following root scripts and pinned tool versions:

~~~json
{
  "name": "commerce-copilot",
  "private": true,
  "packageManager": "pnpm@11.7.0",
  "engines": { "node": "24.14.1", "pnpm": "11.7.0" },
  "scripts": {
    "dev": "pnpm --parallel --filter @commerce-copilot/api --filter @commerce-copilot/web dev",
    "build": "pnpm -r --if-present build",
    "typecheck": "pnpm -r --if-present typecheck",
    "lint": "biome check .",
    "format": "biome format --write .",
    "format:check": "biome format .",
    "test": "vitest run --workspace vitest.workspace.ts",
    "test:watch": "vitest --workspace vitest.workspace.ts",
    "test:e2e": "playwright test",
    "verify": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build",
    "verify:workspace": "node scripts/verify-workspace.mjs"
  },
  "devDependencies": {
    "@biomejs/biome": "2.5.3",
    "@playwright/test": "1.61.1",
    "@types/node": "26.1.1",
    "@vitest/coverage-v8": "4.1.10",
    "typescript": "7.0.2",
    "vitest": "4.1.10"
  }
}
~~~

- [ ] **Step 4: Create package manifests and strict TypeScript configs**

Each internal package name must use @commerce-copilot/* and expose src/index.ts. Use workspace:* for internal dependencies. Enable strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes and noImplicitOverride in tsconfig.base.json.

- [ ] **Step 5: Install and verify reproducibility**

Run:

~~~powershell
pnpm install
pnpm install --frozen-lockfile
pnpm verify:workspace
~~~

Expected: both installs exit 0, the second install does not modify pnpm-lock.yaml, and the verifier prints workspace verified.

- [ ] **Step 6: Commit**

~~~powershell
git add package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json biome.json vitest.workspace.ts .editorconfig .gitattributes .gitignore .npmrc .nvmrc .env.example scripts apps packages
git commit -m "chore: bootstrap TypeScript workspace"
~~~

## Task 2: Define pure domain values and API contracts

**Files:**
- Create: packages/domain/src/shared/ids.ts
- Create: packages/domain/src/shared/money.ts
- Create: packages/domain/src/shared/clock.ts
- Create: packages/domain/src/platform/capabilities.ts
- Create: packages/domain/src/orders/order-snapshot.ts
- Create: packages/domain/src/conversations/conversation.ts
- Create: packages/domain/src/knowledge/citation.ts
- Create: packages/domain/src/audit/audit-event.ts
- Create: packages/domain/src/shared/domain-values.spec.ts
- Create: packages/contracts/src/api.ts
- Create: packages/contracts/src/workspace.ts
- Create: packages/contracts/src/actions.ts
- Create: packages/contracts/src/settings.ts
- Create: packages/contracts/src/contracts.spec.ts

- [ ] **Step 1: Write failing domain value tests**

~~~ts
import { describe, expect, it } from "vitest";
import { createMoney, hasCapability } from "../index";

describe("domain values", () => {
  it("stores CNY as integer minor units", () => {
    expect(createMoney(12800, "CNY")).toEqual({
      amountMinor: 12800,
      currency: "CNY"
    });
  });

  it("does not infer unavailable platform capabilities", () => {
    expect(
      hasCapability(
        [{ capability: "message.send", status: "waiting_qualification" }],
        "message.send"
      )
    ).toBe(false);
  });
});
~~~

- [ ] **Step 2: Verify the tests fail**

Run:

~~~powershell
pnpm --filter @commerce-copilot/domain test
~~~

Expected: FAIL because createMoney and hasCapability do not exist.

- [ ] **Step 3: Implement branded IDs, Money and capability state**

PlatformCapability must be the exact union:

~~~ts
export type PlatformCapability =
  | "store.authorize"
  | "store.token.refresh"
  | "catalog.product.read"
  | "order.read"
  | "logistics.read"
  | "afterSale.read"
  | "afterSale.write"
  | "message.receive"
  | "message.send"
  | "event.subscribe"
  | "event.verify";

export type CapabilityStatus =
  | "available"
  | "unavailable"
  | "waiting_qualification"
  | "degraded";

export interface CapabilityState {
  capability: PlatformCapability;
  status: CapabilityStatus;
  reason?: string;
}
~~~

- [ ] **Step 4: Write failing Zod contract tests**

Test that API errors use { error: { code, message, details? } }, CNY amounts are integer minor units, conversation message roles are explicit, and an unknown capability is rejected.

- [ ] **Step 5: Implement versioned Zod schemas**

Every response schema must include schemaVersion: 1. Export inferred TypeScript types from the same schema and use ISO datetime strings at the HTTP boundary.

- [ ] **Step 6: Run package tests and typecheck**

~~~powershell
pnpm --filter @commerce-copilot/domain test
pnpm --filter @commerce-copilot/contracts test
pnpm --filter @commerce-copilot/domain typecheck
pnpm --filter @commerce-copilot/contracts typecheck
~~~

Expected: all commands PASS.

- [ ] **Step 7: Commit**

~~~powershell
git add packages/domain packages/contracts
git commit -m "feat: define customer service domain contracts"
~~~

## Task 3: Implement default-deny action policy and approval state machine

**Files:**
- Create: packages/domain/src/actions/action-proposal.ts
- Create: packages/domain/src/actions/action-proposal.spec.ts
- Create: packages/domain/src/policies/action-policy.ts
- Create: packages/domain/src/policies/action-policy.spec.ts
- Modify: packages/domain/src/index.ts

- [ ] **Step 1: Write failing state-machine tests**

Declare local refundProposal, executedRefundProposal, executionResult, fixedNow and supervisor builders at the top of the spec so every fixture value is explicit.

~~~ts
it("cannot execute a pending refund proposal", () => {
  const proposal = refundProposal();
  expect(() => markExecuting(proposal, fixedNow)).toThrowError(
    "ACTION_NOT_APPROVED"
  );
});

it("rejects an expired approval", () => {
  const proposal = refundProposal({ expiresAt: "2026-07-11T01:00:00.000Z" });
  expect(() =>
    approveProposal(proposal, supervisor, "2026-07-11T01:00:01.000Z")
  ).toThrowError("ACTION_EXPIRED");
});

it("keeps a repeated execution idempotent", () => {
  const executed = executedRefundProposal();
  expect(markExecuted(executed, executionResult())).toEqual(executed);
});
~~~

- [ ] **Step 2: Run and verify failure**

~~~powershell
pnpm --filter @commerce-copilot/domain test -- action-proposal.spec.ts
~~~

Expected: FAIL because proposal transition functions are missing.

- [ ] **Step 3: Implement the immutable state machine**

Use these exact statuses:

~~~ts
export type ActionProposalStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "expired"
  | "executing"
  | "executed"
  | "failed"
  | "needs_human";
~~~

The only payload in this plan is:

~~~ts
export interface AfterSaleRefundPayload {
  kind: "after_sale.refund";
  orderId: string;
  amount: Money;
  reasonCode: "damaged_item";
  observedOrderVersion: string;
  observedOrderStatus: "paid" | "shipped" | "delivered";
  observedRefundableAmount: Money;
}
~~~

- [ ] **Step 4: Write failing policy tests**

Assert that all writes are disabled when no explicit rule exists, only supervisor/admin may approve the demo refund, and message.send waiting_qualification forces assisted-send mode.

- [ ] **Step 5: Implement policy evaluation**

PolicyEvaluation must return allowed, requiresApproval, requiredRole, riskLevel and reasons. Never return a model-generated confidence field.

- [ ] **Step 6: Run tests**

~~~powershell
pnpm --filter @commerce-copilot/domain test
pnpm --filter @commerce-copilot/domain typecheck
~~~

Expected: PASS.

- [ ] **Step 7: Commit**

~~~powershell
git add packages/domain
git commit -m "feat: enforce approval policy for write actions"
~~~

## Task 4: Define the connector port and build the idempotent mock connector

**Files:**
- Create: packages/application/src/ports/commerce-connector.ts
- Create: packages/connectors/src/mock/mock-fixtures.ts
- Create: packages/connectors/src/mock/mock-commerce-connector.ts
- Create: packages/connectors/src/mock/mock-commerce-connector.spec.ts
- Create: packages/connectors/src/index.ts

- [ ] **Step 1: Write the connector contract test**

Import mockStoreId, refundExecutionCommand and deterministic order fixtures from mock-fixtures.ts; no test reads mutable global process state.

~~~ts
it("executes the same refund idempotency key once", async () => {
  const connector = createMockCommerceConnector();
  const command = refundExecutionCommand({ idempotencyKey: "refund:proposal-1" });

  const first = await connector.executeAction(command);
  const second = await connector.executeAction(command);

  expect(first).toEqual(second);
  expect(connector.executionCount("refund:proposal-1")).toBe(1);
});

it("does not claim FlyPigeon send access", async () => {
  const connector = createMockCommerceConnector();
  const capabilities = await connector.getCapabilities(mockStoreId);
  expect(capabilities).toContainEqual({
    capability: "message.send",
    status: "waiting_qualification",
    reason: "普通自用型应用未开放飞鸽消息收发 API"
  });
});
~~~

- [ ] **Step 2: Verify failure**

~~~powershell
pnpm --filter @commerce-copilot/connectors test
~~~

Expected: FAIL because the connector is not implemented.

- [ ] **Step 3: Implement the connector interface**

~~~ts
export interface CommerceConnector {
  getCapabilities(storeId: StoreId): Promise<CapabilityState[]>;
  getOrder(command: GetOrderCommand): Promise<OrderSnapshot>;
  executeAction(command: ExecuteActionCommand): Promise<ExecutionResult>;
  findActionResult(idempotencyKey: string): Promise<ExecutionResult | null>;
}
~~~

- [ ] **Step 4: Implement deterministic fixtures**

Seed one mock Douyin store, one delivered order for ¥128.00, one “商品破损，申请退款” conversation, one published damaged-item refund policy and explicit supervisor approval rule.

- [ ] **Step 5: Implement capability and execution behavior**

The mock connector reports order.read, logistics.read, afterSale.read and afterSale.write as available; message.receive and message.send as waiting_qualification. It stores execution results by idempotency key and never mutates the refund twice.

- [ ] **Step 6: Run contract tests**

~~~powershell
pnpm --filter @commerce-copilot/connectors test
pnpm --filter @commerce-copilot/connectors typecheck
~~~

Expected: PASS.

- [ ] **Step 7: Commit**

~~~powershell
git add packages/application/src/ports/commerce-connector.ts packages/connectors
git commit -m "feat: add mock commerce connector"
~~~

## Task 5: Build in-memory repositories and the grounded demo agent

**Files:**
- Create: packages/application/src/ports/repositories.ts
- Create: packages/application/src/runtime/demo-runtime.ts
- Create: packages/agent/src/deterministic-suggestion-generator.ts
- Create: packages/agent/src/deterministic-suggestion-generator.spec.ts
- Create: packages/application/src/suggestions/generate-suggestion.ts
- Create: packages/application/src/suggestions/generate-suggestion.spec.ts
- Create: packages/application/src/index.ts

- [ ] **Step 1: Write evidence-gate tests**

Define groundedRefundContext and ungroundedContext as local immutable builders in the spec. Each case explicitly supplies order facts, knowledge release dates and citations.

~~~ts
it("creates a refund draft only with live order facts and a published citation", async () => {
  const result = await generator.generate(groundedRefundContext());
  expect(result.disposition).toBe("propose_action");
  expect(result.citations).toHaveLength(1);
  expect(result.actionDraft?.kind).toBe("after_sale.refund");
});

it.each(["missing_order", "missing_citation", "expired_policy"])(
  "hands off when evidence is %s",
  async (caseName) => {
    const result = await generator.generate(ungroundedContext(caseName));
    expect(result.disposition).toBe("needs_human");
    expect(result.actionDraft).toBeUndefined();
  }
);
~~~

- [ ] **Step 2: Verify failure**

~~~powershell
pnpm --filter @commerce-copilot/agent test
~~~

Expected: FAIL because the deterministic generator is missing.

- [ ] **Step 3: Implement the deterministic generator**

It must generate a Chinese suggested reply with the published policy citation, never claim the refund has happened, and create a refund draft only for the exact seeded damaged-item scenario. Label provider as deterministic-demo in every run.

- [ ] **Step 4: Write the failing use-case test**

Assert the exact sequence: load conversation → fetch live order → search published knowledge → generate suggestion → evaluate policy → persist suggestion/proposal/audit atomically in the in-memory unit of work.

- [ ] **Step 5: Implement repository ports and DemoRuntime**

DemoRuntime owns deterministic maps for conversations, knowledge releases, suggestions, proposals, approvals, execution attempts and audit events. reset() must reseed identical IDs and timestamps for tests.

The initial seeded conversation must include the first immutable audit event conversation.message_ingested, so the successful end-to-end timeline contains seven events.

- [ ] **Step 6: Implement GenerateSuggestion**

On success, append these audit codes in order:

~~~text
knowledge.retrieved
agent.suggestion_generated
action.proposed
~~~

On insufficient evidence, persist agent.suggestion_generated with disposition needs_human and do not create an action proposal.

- [ ] **Step 7: Run tests**

~~~powershell
pnpm --filter @commerce-copilot/agent test
pnpm --filter @commerce-copilot/application test
pnpm --filter @commerce-copilot/application typecheck
~~~

Expected: PASS.

- [ ] **Step 8: Commit**

~~~powershell
git add packages/agent packages/application
git commit -m "feat: generate grounded demo suggestions"
~~~

## Task 6: Implement approval, precondition recheck and mock execution use cases

**Files:**
- Create: packages/application/src/actions/decide-approval.ts
- Create: packages/application/src/actions/decide-approval.spec.ts
- Create: packages/application/src/actions/execute-action.ts
- Create: packages/application/src/actions/execute-action.spec.ts
- Modify: packages/application/src/index.ts

- [ ] **Step 1: Write failing approval tests**

~~~ts
it("requires a supervisor for the demo refund", async () => {
  await expect(
    decideApproval.execute({
      proposalId,
      actor: { id: "user-agent-1", role: "agent" },
      outcome: "approved"
    })
  ).rejects.toMatchObject({ code: "APPROVAL_ROLE_REQUIRED" });
});

it("creates one immutable decision for concurrent approval", async () => {
  const first = await decideApproval.execute(supervisorApproval());
  await expect(
    decideApproval.execute(supervisorApproval())
  ).rejects.toMatchObject({ code: "APPROVAL_CONFLICT" });
  expect(first.proposal.status).toBe("approved");
});
~~~

- [ ] **Step 2: Verify failure**

~~~powershell
pnpm --filter @commerce-copilot/application test -- decide-approval.spec.ts
~~~

Expected: FAIL because DecideApproval is missing.

- [ ] **Step 3: Implement DecideApproval**

The use case checks actor role, proposal version, expiration and current status; writes ApprovalDecision; updates the immutable proposal snapshot; and appends approval.approved or approval.rejected. A rejection never creates an execution request.

- [ ] **Step 4: Write failing execution tests**

~~~ts
it("rechecks the order before executing", async () => {
  connector.setOrder({ ...seededOrder, version: "order-v2" });
  const result = await executeAction.execute({ proposalId, actor: supervisor });
  expect(result.status).toBe("needs_human");
  expect(connector.executionCount("refund:proposal-1")).toBe(0);
});

it("executes an approved proposal once", async () => {
  const first = await executeAction.execute({ proposalId, actor: supervisor });
  const second = await executeAction.execute({ proposalId, actor: supervisor });
  expect(first).toEqual(second);
  expect(connector.executionCount("refund:proposal-1")).toBe(1);
});
~~~

- [ ] **Step 5: Implement ExecuteAction**

The use case loads the approved proposal, fetches the live order, compares version/status/refundable amount, marks executing, calls the connector with idempotencyKey refund:{proposalId}, and stores the result. Unknown outcomes call findActionResult before permitting a human retry.

- [ ] **Step 6: Verify exact audit order**

Expected successful tail:

~~~text
approval.approved
action.execution_started
action.execution_succeeded
~~~

Order drift must append action.execution_blocked and set needs_human.

- [ ] **Step 7: Run tests**

~~~powershell
pnpm --filter @commerce-copilot/application test
pnpm --filter @commerce-copilot/application typecheck
~~~

Expected: PASS.

- [ ] **Step 8: Commit**

~~~powershell
git add packages/application
git commit -m "feat: approve and execute refund proposals safely"
~~~

## Task 7: Bootstrap the NestJS/Fastify API and health contract

**Files:**
- Modify: apps/api/package.json
- Create: apps/api/tsconfig.json
- Create: apps/api/src/main.ts
- Create: apps/api/src/create-app.ts
- Create: apps/api/src/app.module.ts
- Create: apps/api/src/common/api-error.filter.ts
- Create: apps/api/src/health/health.controller.ts
- Create: apps/api/src/demo/demo.module.ts
- Create: apps/api/src/demo/demo.controller.ts
- Create: apps/api/test/health.int.spec.ts

- [ ] **Step 1: Add exact API dependencies**

Pin:

~~~json
{
  "dependencies": {
    "@commerce-copilot/agent": "workspace:*",
    "@commerce-copilot/application": "workspace:*",
    "@commerce-copilot/connectors": "workspace:*",
    "@commerce-copilot/contracts": "workspace:*",
    "@commerce-copilot/domain": "workspace:*",
    "@fastify/cors": "11.3.0",
    "@fastify/helmet": "13.1.0",
    "@nestjs/common": "11.1.28",
    "@nestjs/core": "11.1.28",
    "@nestjs/platform-fastify": "11.1.28",
    "@nestjs/swagger": "11.4.5",
    "fastify": "5.10.0",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.2",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@nestjs/testing": "11.1.28",
    "tsx": "4.23.0"
  }
}
~~~

- [ ] **Step 2: Write a failing health integration test**

~~~ts
it("returns a demo liveness response without external dependencies", async () => {
  const app = await createApp({ mode: "demo" });
  const response = await app.getHttpAdapter().getInstance().inject({
    method: "GET",
    url: "/api/v1/health"
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    schemaVersion: 1,
    status: "ok",
    mode: "demo"
  });
});
~~~

- [ ] **Step 3: Verify failure**

~~~powershell
pnpm --filter @commerce-copilot/api test -- health.int.spec.ts
~~~

Expected: FAIL because createApp is missing.

- [ ] **Step 4: Implement a testable bootstrap**

createApp accepts mode and optional DemoRuntime. It registers the /api/v1 prefix, Zod-aware validation, Helmet, restricted development CORS, Swagger at /api/docs, and ApiErrorFilter. main.ts must refuse every mode except demo until Plan 2 supplies production adapters.

- [ ] **Step 5: Add explicit demo reset and bootstrap endpoints**

POST /api/v1/demo/reset reseeds deterministic state and returns 204. GET /api/v1/demo/bootstrap returns demo actor, setup status and seeded store. POST /api/v1/demo/setup/complete records the deterministic acceptedAt value used by root-route redirect tests. These endpoints exist only when mode is demo.

- [ ] **Step 6: Run tests and a manual probe**

~~~powershell
pnpm --filter @commerce-copilot/api test
pnpm --filter @commerce-copilot/api dev
Invoke-RestMethod http://127.0.0.1:4000/api/v1/health
~~~

Expected: tests PASS and the probe returns status ok and mode demo. Stop the development server after the probe.

- [ ] **Step 7: Commit**

~~~powershell
git add apps/api
git commit -m "feat: expose demo API runtime"
~~~

## Task 8: Expose the complete typed demo workflow API

**Files:**
- Create: apps/api/src/workspace/workspace.controller.ts
- Create: apps/api/src/conversations/conversations.controller.ts
- Create: apps/api/src/approvals/approvals.controller.ts
- Create: apps/api/src/knowledge/knowledge.controller.ts
- Create: apps/api/src/audit/audit.controller.ts
- Create: apps/api/test/demo-flow.int.spec.ts
- Modify: apps/api/src/app.module.ts

- [ ] **Step 1: Write the failing full API integration test**

The test resets the runtime, then calls:

~~~text
GET  /api/v1/workspace
GET  /api/v1/conversations
GET  /api/v1/conversations/{conversationId}
POST /api/v1/conversations/{conversationId}/suggestions
GET  /api/v1/approvals
POST /api/v1/approvals/{proposalId}/decisions
POST /api/v1/actions/{proposalId}/execute
GET  /api/v1/audit-events?conversationId={conversationId}
~~~

Assert 200/201 responses, a pending refund of amountMinor 12800, explicit assisted-send mode, supervisor approval, one mock execution, and the exact audit sequence.

- [ ] **Step 2: Verify failure**

~~~powershell
pnpm --filter @commerce-copilot/api test -- demo-flow.int.spec.ts
~~~

Expected: FAIL with 404 for the first unimplemented route.

- [ ] **Step 3: Implement read endpoints**

GET /workspace returns dashboard metrics, integrations, active rules, demo model, evaluation summary and setup state. Conversation detail returns messages, order snapshot, latest suggestion, citations and proposal. Knowledge returns the single published demo policy and immutable release metadata.

- [ ] **Step 4: Implement write endpoints**

POST suggestion returns 201. Approval accepts only { outcome: approved | rejected, proposalVersion, comment? } and derives the demo supervisor from the server-side demo session. Execute returns the persisted execution result. Do not accept actor role from the browser.

- [ ] **Step 5: Implement unified failures**

Use:

~~~json
{
  "error": {
    "code": "APPROVAL_CONFLICT",
    "message": "该操作已被处理，请刷新后查看最新状态。"
  }
}
~~~

Return 404 for missing resources, 409 for state/version conflicts, and 422 for semantically invalid requests. Never expose a stack trace.

- [ ] **Step 6: Run API tests and inspect OpenAPI**

~~~powershell
pnpm --filter @commerce-copilot/api test
pnpm --filter @commerce-copilot/api typecheck
~~~

Expected: PASS. The generated OpenAPI document lists every route above under /api/v1.

- [ ] **Step 7: Commit**

~~~powershell
git add apps/api
git commit -m "feat: expose demo customer service workflow"
~~~

## Task 9: Build the design system and Chinese console shell

**Files:**
- Modify: packages/ui/package.json
- Create: packages/ui/src/styles/tokens.css
- Create: packages/ui/src/lib/cn.ts
- Create: packages/ui/src/button.tsx
- Create: packages/ui/src/badge.tsx
- Create: packages/ui/src/card.tsx
- Create: packages/ui/src/dialog.tsx
- Create: packages/ui/src/skeleton.tsx
- Create: packages/ui/src/primitives.spec.tsx
- Modify: apps/web/package.json
- Create: apps/web/next.config.ts
- Create: apps/web/postcss.config.mjs
- Create: apps/web/src/app/layout.tsx
- Create: apps/web/src/app/globals.css
- Create: apps/web/src/app/providers.tsx
- Create: apps/web/src/components/shell/app-shell.tsx
- Create: apps/web/src/components/shell/side-nav.tsx
- Create: apps/web/src/components/feedback/async-state.tsx

- [ ] **Step 1: Add exact web dependencies**

Pin Next 16.2.10, React/React DOM 19.2.7, Tailwind and @tailwindcss/postcss 4.3.2, TanStack Query 5.101.2, next-themes 0.4.6, lucide-react 1.24.0, Radix Dialog 1.1.19, clsx 2.1.1, tailwind-merge 3.6.0 and class-variance-authority 0.7.1. Pin Testing Library React 16.3.2, jest-dom 6.9.1, user-event 14.6.1, jsdom 29.1.1 and Vite React plugin 6.0.3 as development dependencies.

- [ ] **Step 2: Write failing primitive accessibility tests**

~~~tsx
it("returns focus to the trigger after closing a dialog", async () => {
  const user = userEvent.setup();
  render(<ApprovalDialog />);
  await user.click(screen.getByRole("button", { name: "查看审批" }));
  await user.click(screen.getByRole("button", { name: "关闭" }));
  expect(screen.getByRole("button", { name: "查看审批" })).toHaveFocus();
});

it("requires an explicit impact label for danger actions", () => {
  render(<Button intent="danger">批准退款 ¥128.00</Button>);
  expect(
    screen.getByRole("button", { name: "批准退款 ¥128.00" })
  ).toBeEnabled();
});
~~~

- [ ] **Step 3: Verify failure**

~~~powershell
pnpm --filter @commerce-copilot/ui test
~~~

Expected: FAIL because UI primitives do not exist.

- [ ] **Step 4: Implement tokens and primitives**

Use neutral gray surfaces, blue for primary actions, amber for needs-human/waiting, and red only for destructive or failed states. Every status includes text and icon, never color alone. Add focus-visible rings, 44px touch targets and reduced-motion rules.

- [ ] **Step 5: Build the app shell**

Navigation labels: 总览、统一会话、审批中心、知识库、平台接入、规则中心、模型配置、评测中心、审计日志. The shell must show a persistent 模拟环境 banner and never say an unavailable connector is connected.

- [ ] **Step 6: Configure same-origin API proxy**

In development, rewrite /api/v1/* to http://127.0.0.1:4000/api/v1/*. The browser client uses relative URLs and validates responses with contracts schemas.

- [ ] **Step 7: Run tests and visual smoke**

~~~powershell
pnpm --filter @commerce-copilot/ui test
pnpm --filter @commerce-copilot/web test
pnpm --filter @commerce-copilot/web dev
~~~

Expected: tests PASS and the console shell renders in Chinese at http://127.0.0.1:3000 with a visible demo banner. Stop the server after inspection.

- [ ] **Step 8: Commit**

~~~powershell
git add packages/ui apps/web
git commit -m "feat: add customer service console design system"
~~~

## Task 10: Implement first-run setup, overview and integration capability pages

**Files:**
- Create: apps/web/src/app/page.tsx
- Create: apps/web/src/app/setup/page.tsx
- Create: apps/web/src/app/(console)/layout.tsx
- Create: apps/web/src/app/(console)/overview/page.tsx
- Create: apps/web/src/app/(console)/integrations/page.tsx
- Create: apps/web/src/features/setup/setup-wizard.tsx
- Create: apps/web/src/features/setup/setup-wizard.spec.tsx
- Create: apps/web/src/lib/api/http-client.ts
- Create: apps/web/src/lib/api/queries.ts

- [ ] **Step 1: Write failing setup tests**

Test a six-step path: 管理员演示身份 → 确定性演示模型 → 模拟抖音店铺 → 同步夹具 → 发布破损退款政策 → 运行验收对话. Refreshing the page must preserve completed demo setup via the API runtime.

- [ ] **Step 2: Verify failure**

~~~powershell
pnpm --filter @commerce-copilot/web test -- setup-wizard.spec.tsx
~~~

Expected: FAIL because the wizard is missing.

- [ ] **Step 3: Implement typed API loading states**

Each request surface renders loading, empty, retryable error, success and needs-human states. Do not import mock fixtures into web code; all state comes through the typed HTTP client.

- [ ] **Step 4: Implement setup and redirect behavior**

The root route redirects to /setup until acceptedAt exists, then to /overview. Completing setup calls the demo API and shows “模拟环境已就绪，不代表已获得飞鸽消息权限”.

- [ ] **Step 5: Implement overview and integrations**

Overview shows deterministic metrics and pending approvals. Integrations shows a capability matrix; message.receive and message.send must visibly read “等待官方资质 / 人工辅助发送”, while order and after-sales read capabilities show available.

- [ ] **Step 6: Run tests**

~~~powershell
pnpm --filter @commerce-copilot/web test
pnpm --filter @commerce-copilot/web typecheck
~~~

Expected: PASS.

- [ ] **Step 7: Commit**

~~~powershell
git add apps/web
git commit -m "feat: guide users through demo setup"
~~~

## Task 11: Implement the three-column workspace and grounded suggestion UI

**Files:**
- Create: apps/web/src/app/(console)/workspace/page.tsx
- Create: apps/web/src/features/workspace/workspace-view.tsx
- Create: apps/web/src/features/workspace/conversation-list.tsx
- Create: apps/web/src/features/workspace/message-thread.tsx
- Create: apps/web/src/features/workspace/suggestion-card.tsx
- Create: apps/web/src/features/workspace/context-panel.tsx
- Create: apps/web/src/features/workspace/workspace-view.spec.tsx

- [ ] **Step 1: Write failing component tests**

Assert:

- selecting the seeded conversation loads the message and order;
- AI suggestion is labelled AI 建议 and customer text is labelled 消费者;
- the knowledge citation expands to source, release and excerpt;
- generating the suggestion creates a pending refund proposal;
- message.send unavailable shows “请复制到飞鸽并由人工发送”;
- no control claims that the message was sent;
- Ctrl+Enter does not trigger while an IME composition is active.

- [ ] **Step 2: Verify failure**

~~~powershell
pnpm --filter @commerce-copilot/web test -- workspace-view.spec.tsx
~~~

Expected: FAIL because the workspace is missing.

- [ ] **Step 3: Implement desktop and narrow layouts**

At 1440px use 280px / minmax(480px, 1fr) / 360px. At 1024px the right context panel becomes a drawer. At 390px conversation list, thread and context are separate navigable views with no page-level horizontal scrolling.

- [ ] **Step 4: Implement the suggestion flow**

The reply is editable before copy. Display the citation and current order separately from model text. The proposal card says “申请退款 ¥128.00，需主管审批” and links to /approvals.

- [ ] **Step 5: Implement robust mutation feedback**

Disable the generate button while pending; duplicate clicks produce one suggestion/proposal. Show actionable retry text for network errors and needs-human text for evidence failures.

- [ ] **Step 6: Run tests**

~~~powershell
pnpm --filter @commerce-copilot/web test -- workspace-view.spec.tsx
pnpm --filter @commerce-copilot/web typecheck
~~~

Expected: PASS.

- [ ] **Step 7: Commit**

~~~powershell
git add apps/web
git commit -m "feat: add grounded customer service workspace"
~~~

## Task 12: Complete approval, knowledge, rules, models, evaluation and audit pages

**Files:**
- Create: apps/web/src/app/(console)/approvals/page.tsx
- Create: apps/web/src/app/(console)/knowledge/page.tsx
- Create: apps/web/src/app/(console)/rules/page.tsx
- Create: apps/web/src/app/(console)/models/page.tsx
- Create: apps/web/src/app/(console)/evaluations/page.tsx
- Create: apps/web/src/app/(console)/audit/page.tsx
- Create: apps/web/src/features/approvals/approval-detail.tsx
- Create: apps/web/src/features/approvals/approval-detail.spec.tsx
- Create: apps/web/src/features/audit/audit-timeline.tsx

- [ ] **Step 1: Write failing approval tests**

~~~tsx
it("names the exact financial impact and executes once", async () => {
  const user = userEvent.setup();
  render(<ApprovalDetail proposal={pendingRefund} />);
  const approve = screen.getByRole("button", {
    name: "批准退款 ¥128.00"
  });
  await user.click(approve);
  expect(approve).toBeDisabled();
  expect(await screen.findByText("模拟退款已执行")).toBeVisible();
});
~~~

Also test expired, order-drift, duplicate approval and retryable network failure states.

- [ ] **Step 2: Verify failure**

~~~powershell
pnpm --filter @commerce-copilot/web test -- approval-detail.spec.tsx
~~~

Expected: FAIL because ApprovalDetail is missing.

- [ ] **Step 3: Implement approval and execution flow**

The detail view shows consumer text, live order, policy citation, amount, risk, required role and expected impact before the button. After approval it invokes execution, then invalidates conversation, approvals, overview and audit queries. It never retries a financial write automatically.

- [ ] **Step 4: Implement management pages with truthful demo data**

- Knowledge: one published immutable release with source/version/excerpt.
- Rules: writes default disabled except the explicit demo supervisor refund rule.
- Models: deterministic-demo, no secret field and a note that model quality is not evaluated.
- Evaluations: one flow conformance result and no fabricated accuracy percentage.
- Audit: filterable chronological events, read-only, PII-minimized.

- [ ] **Step 5: Run all web tests**

~~~powershell
pnpm --filter @commerce-copilot/web test
pnpm --filter @commerce-copilot/web typecheck
~~~

Expected: PASS.

- [ ] **Step 6: Commit**

~~~powershell
git add apps/web
git commit -m "feat: complete approval and audit console"
~~~

## Task 13: Verify the complete browser journey, accessibility and release gates

**Files:**
- Create: playwright.config.ts
- Create: tests/e2e/demo-setup.spec.ts
- Create: tests/e2e/demo-vertical-loop.spec.ts
- Create: tests/e2e/management-pages.spec.ts
- Create: tests/e2e/accessibility.spec.ts
- Modify: README.md
- Modify: package.json

- [ ] **Step 1: Configure production-like test servers**

Playwright starts API on port 4000 and Web on port 3000 using explicit readiness URLs. Use Chromium, workers 1, forbidOnly true, one CI retry, trace on first retry and screenshots only on failure. Do not wait for networkidle or arbitrary timeouts.

Add @axe-core/playwright 4.12.1 to root development dependencies before writing accessibility tests.

- [ ] **Step 2: Write the failing setup journey**

Reset demo runtime, open /setup, complete the six named steps, verify the demo disclaimer and land on /overview.

- [ ] **Step 3: Write the failing vertical-loop journey**

The browser test must:

1. open the damaged-item conversation;
2. generate the grounded suggestion;
3. expand the policy citation;
4. verify assisted-send mode;
5. open the refund proposal;
6. click “批准退款 ¥128.00”;
7. verify the action executes once;
8. open audit and assert the seven-event ordered timeline.

- [ ] **Step 4: Write route and accessibility tests**

Visit every console route and assert a unique h1. Use @axe-core/playwright 4.12.1 on setup, overview, workspace and approval pages. Verify keyboard navigation, dialog focus return, text-labelled statuses and no critical/serious violations.

- [ ] **Step 5: Run E2E and repeat the risky flow**

~~~powershell
pnpm exec playwright install chromium
pnpm test:e2e
pnpm exec playwright test tests/e2e/demo-vertical-loop.spec.ts --repeat-each=5
~~~

Expected: all tests PASS and the vertical loop passes five consecutive times without retry.

- [ ] **Step 6: Document exact local usage**

README must include:

~~~powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm verify
pnpm test:e2e
~~~

It must state that the first delivery is demo-only, requires no platform/model secrets, and cannot send FlyPigeon messages or perform real refunds.

- [ ] **Step 7: Run the full release gate**

~~~powershell
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
git diff --check
git status --short
~~~

Expected: every command exits 0. git status may contain only intended plan-tracking changes; no secret, trace, screenshot, build output or browser state is tracked.

- [ ] **Step 8: Commit**

~~~powershell
git add .
git commit -m "test: verify demo customer service workflow"
~~~

## Plan 1 definition of done

- A new user can run the product locally with no external service.
- The Chinese UI exposes every planned console route with truthful demo data.
- The seeded damaged-item conversation produces a cited suggestion and a pending refund proposal.
- The user sees assisted-send mode because FlyPigeon message access is unavailable.
- Only a supervisor approval can unlock the mock refund.
- The executor rechecks order facts and applies one business effect for repeated requests.
- The audit timeline records the entire decision chain in order.
- Domain, connector, API, component and browser tests pass.
- Production mode, real OAuth, real model calls and real financial writes remain impossible until their dedicated plans are implemented.

## Spec coverage self-review

| Design requirement | This plan | Follow-on plan |
| --- | --- | --- |
| Modular monorepo and connector boundaries | Tasks 1–5 | Production adapters in Plans 2–3 |
| Grounded suggestion with published citation | Task 5 and Task 11 | Real embedding/model gateway in Plan 2 |
| Default-deny writes and human approval | Tasks 3, 6 and 12 | Multi-stage RBAC approval in Plan 2 |
| Idempotent action execution and order recheck | Tasks 4, 6 and 13 | Transactional outbox/BullMQ in Plan 2 |
| Douyin capability truthfulness | Tasks 4, 10 and 11 | Official APIs and OAuth in Plan 3 |
| Good Chinese UI and all console routes | Tasks 9–12 | Production settings persistence in Plan 2 |
| OpenAPI and complete demo API | Tasks 7–8 | Production API adapters in Plan 2 |
| Knowledge version traceability | Tasks 2, 5 and 12 | pgvector ingestion and object storage in Plan 2 |
| Error, empty, retry and needs-human states | Tasks 8–12 | Platform-specific degradation in Plan 3 |
| Audit and AI regression verification | Tasks 5, 6, 12 and 13 | Persistent audit/evaluation runs in Plans 2 and 4 |
| Security and secrets | Demo is fail-closed and contains no secrets | Auth, encryption, PII retention and security tests in Plans 2 and 4 |
| Docker deployment and backup | Not executable on current machine | Plans 2 and 4 |

No design requirement is silently represented as complete when it is deferred. The UI must display demo or waiting-qualification states for every deferred external capability.
