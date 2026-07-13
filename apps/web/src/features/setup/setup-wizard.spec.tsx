import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiClientError, apiRequest } from "../../api/client.ts";
import { apiQueryKeys } from "../../api/queries.ts";
import { SetupWizard } from "./setup-wizard.tsx";

vi.mock("../../api/client.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/client.ts")>();
  return { ...actual, apiRequest: vi.fn() };
});

const acceptedAt = "2026-07-11T01:05:00.000Z";
const observedAt = "2026-07-11T01:20:00.000Z";

const bootstrap = {
  schemaVersion: 1,
  actor: { userId: "user-demo-owner", displayName: "演示店主", role: "owner" },
  setup: { status: "incomplete", acceptedAt: null },
  store: {
    companyId: "company-demo",
    storeId: "store-douyin-demo",
    displayName: "抖音电商演示店",
    platform: "douyin",
  },
} as const;

const workspace = {
  schemaVersion: 1,
  workspace: {
    companyId: "company-demo",
    storeId: "store-douyin-demo",
    metrics: {
      openConversations: 1,
      waitingForAgent: 1,
      assistantSuggestions: 0,
      proposalsAwaitingApproval: 0,
      refundedAmount: { amountMinor: 0, currency: "CNY" },
      measuredAt: observedAt,
    },
    integrations: [],
    activeRules: [],
    messageSendMode: "assisted",
    demoModel: { provider: "deterministic-demo", deterministic: true },
    evaluationSummary: { scenario: "damaged_item", status: "ready", score: 1 },
    setup: { status: "incomplete", acceptedAt: null },
  },
} as const;

const conversationSummary = {
  companyId: "company-demo",
  storeId: "store-douyin-demo",
  conversationId: "conversation-damaged-item-1",
  customer: { customerId: "customer-demo", displayName: "演示顾客" },
  status: "waiting_for_agent",
  lastMessagePreview: "收到的商品破损了",
  unreadCount: 1,
  updatedAt: observedAt,
} as const;

const conversations = {
  schemaVersion: 1,
  conversations: [conversationSummary],
  generatedAt: observedAt,
} as const;

const pendingProposal = {
  proposalId: "proposal-demo-refund",
  version: 1,
  companyId: "company-demo",
  storeId: "store-douyin-demo",
  conversationId: conversationSummary.conversationId,
  action: {
    kind: "after_sale.refund",
    orderId: "order-delivered-12800",
    amount: { amountMinor: 12800, currency: "CNY" },
    reasonCode: "damaged_item",
    observedOrder: {
      version: 1,
      status: "delivered",
      refundable: { amountMinor: 12800, currency: "CNY" },
    },
  },
  status: "pending_approval",
  createdAt: observedAt,
  expiresAt: "2026-07-11T02:20:00.000Z",
  approval: null,
  rejection: null,
  execution: null,
} as const;

const suggestion = {
  suggestionId: "suggestion-demo-refund",
  companyId: "company-demo",
  storeId: "store-douyin-demo",
  conversationId: conversationSummary.conversationId,
  orderId: "order-delivered-12800",
  correlationId: "demo-suggestion",
  causationId: "message-customer-1",
  provider: "deterministic-demo",
  disposition: "propose_action",
  suggestedReply: "已为您准备退款方案。",
  citations: [],
  actionDraft: {
    kind: "after_sale.refund",
    orderId: "order-delivered-12800",
    amount: { amountMinor: 12800, currency: "CNY" },
    reasonCode: "damaged_item",
    observedOrderVersion: 1,
    observedOrderStatus: "delivered",
    observedRefundableAmount: { amountMinor: 12800, currency: "CNY" },
  },
  reason: null,
  createdAt: observedAt,
} as const;

const conversationDetail = {
  schemaVersion: 1,
  conversation: {
    ...conversationSummary,
    messages: [
      {
        messageId: "message-customer-1",
        role: "customer",
        origin: "platform",
        content: "收到的商品破损了",
        occurredAt: observedAt,
      },
    ],
    order: {
      companyId: "company-demo",
      storeId: "store-douyin-demo",
      orderId: "order-delivered-12800",
      version: 1,
      status: "delivered",
      total: { amountMinor: 12800, currency: "CNY" },
      refundable: { amountMinor: 12800, currency: "CNY" },
      updatedAt: observedAt,
    },
    latestSuggestion: null,
    citations: [],
    proposal: null,
  },
} as const;

const detailWithProposal = {
  ...conversationDetail,
  conversation: {
    ...conversationDetail.conversation,
    latestSuggestion: suggestion,
    proposal: pendingProposal,
  },
} as const;

const detailWithExecutedProposal = {
  ...detailWithProposal,
  conversation: {
    ...detailWithProposal.conversation,
    proposal: {
      ...pendingProposal,
      version: 4,
      status: "executed",
      approval: {
        actor: { userId: "user-demo-supervisor", role: "supervisor" },
        approvedAt: observedAt,
      },
      execution: {
        status: "succeeded",
        startedAt: observedAt,
        executionId: "mock-execution-0001",
        completedAt: observedAt,
      },
    },
  },
} as const;

const knowledge = {
  schemaVersion: 1,
  policies: [
    {
      policyId: "policy-damaged-refund",
      title: "破损商品退款政策",
      status: "published",
      scenario: "damaged_item",
      content: "破损商品可申请退款。",
      refundRule: { kind: "after_sale.refund", enabled: true },
      citations: [],
      release: {
        releaseId: "release-damaged-refund-v1",
        version: 1,
        publishedAt: observedAt,
        expiresAt: null,
        immutable: true,
      },
    },
  ],
} as const;

const suggestionResponse = {
  schemaVersion: 1,
  suggestion,
  proposal: pendingProposal,
} as const;

const completion = {
  schemaVersion: 1,
  setup: { status: "complete", acceptedAt },
} as const;

type ScenarioValue = unknown | Error | Promise<unknown>;
type Scenario = Partial<{
  bootstrap: ScenarioValue[];
  workspace: ScenarioValue[];
  conversations: ScenarioValue[];
  detail: ScenarioValue[];
  knowledge: ScenarioValue[];
  suggestion: ScenarioValue[];
  completion: ScenarioValue[];
}>;

function installApi(scenario: Scenario = {}) {
  const queues = {
    bootstrap: [...(scenario.bootstrap ?? [bootstrap])],
    workspace: [...(scenario.workspace ?? [workspace])],
    conversations: [...(scenario.conversations ?? [conversations])],
    detail: [...(scenario.detail ?? [conversationDetail])],
    knowledge: [...(scenario.knowledge ?? [knowledge])],
    suggestion: [...(scenario.suggestion ?? [suggestionResponse])],
    completion: [...(scenario.completion ?? [completion])],
  };
  const last = new Map<string, ScenarioValue>();

  function take(key: keyof typeof queues) {
    const value = queues[key].shift() ?? last.get(key);
    if (value === undefined) throw new Error(`No response configured for ${key}`);
    last.set(key, value);
    return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  }

  vi.mocked(apiRequest).mockImplementation((path) => {
    if (typeof path !== "string") return Promise.resolve(bootstrap);
    if (path === "/api/v1/demo/bootstrap") return take("bootstrap");
    if (path === "/api/v1/workspace") return take("workspace");
    if (path === "/api/v1/conversations") return take("conversations");
    if (path === `/api/v1/conversations/${conversationSummary.conversationId}`) {
      return take("detail");
    }
    if (path === "/api/v1/knowledge") return take("knowledge");
    if (path === "/api/v1/demo/reset") return Promise.resolve(undefined);
    if (path.endsWith("/suggestions")) return take("suggestion");
    if (path === "/api/v1/demo/setup/complete") return take("completion");
    return Promise.reject(new Error(`Unexpected path: ${path}`));
  });
}

function renderWizard(client?: QueryClient) {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  return {
    client: queryClient,
    ...render(<SetupWizard />, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    }),
  };
}

async function reachFinalStep(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("heading", { name: "管理员演示身份" });
  for (const heading of [
    "确定性演示模型",
    "模拟抖音店铺",
    "同步夹具",
    "发布破损退款政策",
    "运行验收对话",
  ]) {
    const next = await screen.findByRole("button", { name: "下一步" });
    await waitFor(() => expect(next).toBeEnabled());
    await user.click(next);
    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
  }
}

function callsTo(path: string) {
  return vi.mocked(apiRequest).mock.calls.filter(([calledPath]) => calledPath === path);
}

describe("SetupWizard API readiness", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("grounds all six steps in typed API facts before accepting setup", async () => {
    installApi();
    const user = userEvent.setup();
    renderWizard();

    expect(await screen.findByText("管理员身份已验证")).toBeVisible();
    expect(screen.getByText("演示店主")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(await screen.findByText("确定性模型与评测已就绪")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(await screen.findByText("模拟抖音店铺已识别")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(await screen.findByText("order-delivered-12800")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(await screen.findByText("破损商品退款政策")).toBeVisible();
    expect(screen.getByText("发布版本 1")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(await screen.findByText("验收对话待运行")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "运行验收并完成设置" }));
    expect(await screen.findByText("模拟环境已就绪，不代表已获得飞鸽消息权限")).toBeVisible();
    expect(
      callsTo(`/api/v1/conversations/${conversationSummary.conversationId}/suggestions`),
    ).toHaveLength(1);
    expect(callsTo("/api/v1/demo/setup/complete")).toHaveLength(1);
  });

  it("keeps next disabled while the current API fact is loading", async () => {
    let resolveWorkspace: ((value: unknown) => void) | undefined;
    installApi({
      workspace: [
        new Promise((resolve) => {
          resolveWorkspace = resolve;
        }),
      ],
    });
    const user = userEvent.setup();
    renderWizard();

    await screen.findByText("管理员身份已验证");
    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("status")).toHaveTextContent("正在验证确定性演示模型");
    expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
    resolveWorkspace?.(workspace);
    expect(await screen.findByText("确定性模型与评测已就绪")).toBeVisible();
    expect(screen.getByRole("button", { name: "下一步" })).toBeEnabled();
  });

  it("stays on the current step and retries a failed readiness request", async () => {
    installApi({ knowledge: [new Error("offline"), knowledge] });
    const user = userEvent.setup();
    renderWizard();

    await screen.findByText("管理员身份已验证");
    for (let index = 0; index < 4; index += 1) {
      const next = screen.getByRole("button", { name: "下一步" });
      await waitFor(() => expect(next).toBeEnabled());
      await user.click(next);
    }
    expect(screen.getByRole("heading", { name: "发布破损退款政策" })).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent("退款政策验证失败");
    expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "重试验证" }));
    expect(await screen.findByText("破损商品退款政策")).toBeVisible();
  });
});

describe("SetupWizard completion reconciliation", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("submits only one suggestion when the final button is double-clicked", async () => {
    let resolveSuggestion: ((value: unknown) => void) | undefined;
    installApi({
      suggestion: [
        new Promise((resolve) => {
          resolveSuggestion = resolve;
        }),
      ],
    });
    const user = userEvent.setup();
    renderWizard();
    await reachFinalStep(user);

    await user.dblClick(screen.getByRole("button", { name: "运行验收并完成设置" }));
    expect(
      callsTo(`/api/v1/conversations/${conversationSummary.conversationId}/suggestions`),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: "正在运行验收" })).toBeDisabled();
    resolveSuggestion?.(suggestionResponse);
  });

  it("does not repeat a successful suggestion when acceptance retry is needed", async () => {
    installApi({ completion: [new Error("offline"), completion] });
    const user = userEvent.setup();
    renderWizard();
    await reachFinalStep(user);

    await user.click(screen.getByRole("button", { name: "运行验收并完成设置" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("设置未能保存");
    expect(screen.getAllByRole("button", { name: "重试完成设置" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "重试完成设置" }));
    expect(await screen.findByText("模拟环境已就绪，不代表已获得飞鸽消息权限")).toBeVisible();
    expect(
      callsTo(`/api/v1/conversations/${conversationSummary.conversationId}/suggestions`),
    ).toHaveLength(1);
    expect(callsTo("/api/v1/demo/setup/complete")).toHaveLength(2);
  });

  it("stays on step six and retries when suggestion generation fails", async () => {
    installApi({ suggestion: [new Error("offline"), suggestionResponse] });
    const user = userEvent.setup();
    renderWizard();
    await reachFinalStep(user);

    await user.click(screen.getByRole("button", { name: "运行验收并完成设置" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("验收对话运行失败");
    expect(screen.getByRole("heading", { name: "运行验收对话" })).toBeVisible();
    expect(callsTo("/api/v1/demo/setup/complete")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "重试完成设置" }));
    expect(await screen.findByText("模拟环境已就绪，不代表已获得飞鸽消息权限")).toBeVisible();
    expect(
      callsTo(`/api/v1/conversations/${conversationSummary.conversationId}/suggestions`),
    ).toHaveLength(2);
  });

  it("refetches detail after duplicate suggestion conflict before accepting", async () => {
    installApi({
      detail: [conversationDetail, detailWithProposal],
      suggestion: [
        new ApiClientError(
          "该操作已被处理，请刷新后查看最新状态。",
          "GENERATE_SUGGESTION_DUPLICATE_COMMAND",
        ),
      ],
    });
    const user = userEvent.setup();
    renderWizard();
    await reachFinalStep(user);

    await user.click(screen.getByRole("button", { name: "运行验收并完成设置" }));
    expect(await screen.findByText("模拟环境已就绪，不代表已获得飞鸽消息权限")).toBeVisible();
    expect(callsTo(`/api/v1/conversations/${conversationSummary.conversationId}`)).toHaveLength(2);
    expect(callsTo("/api/v1/demo/setup/complete")).toHaveLength(1);
  });

  it("does not accept a duplicate conflict when detail has no pending proposal", async () => {
    installApi({
      detail: [conversationDetail, conversationDetail],
      suggestion: [
        new ApiClientError(
          "该操作已被处理，请刷新后查看最新状态。",
          "GENERATE_SUGGESTION_DUPLICATE_COMMAND",
        ),
      ],
    });
    const user = userEvent.setup();
    renderWizard();
    await reachFinalStep(user);

    await user.click(screen.getByRole("button", { name: "运行验收并完成设置" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("验收提案尚未确认");
    expect(callsTo("/api/v1/demo/setup/complete")).toHaveLength(0);
  });

  it("resets a completed shared demo before rerunning setup acceptance", async () => {
    installApi({
      detail: [conversationDetail, detailWithExecutedProposal],
      suggestion: [
        new ApiClientError(
          "The shared demo command was already processed.",
          "GENERATE_SUGGESTION_DUPLICATE_COMMAND",
        ),
        suggestionResponse,
      ],
    });
    const user = userEvent.setup();
    renderWizard();
    await reachFinalStep(user);

    await user.click(screen.getByRole("button", { name: "运行验收并完成设置" }));

    expect(await screen.findByText("模拟环境已就绪，不代表已获得飞鸽消息权限")).toBeVisible();
    expect(callsTo("/api/v1/demo/reset")).toHaveLength(1);
    expect(
      callsTo(`/api/v1/conversations/${conversationSummary.conversationId}/suggestions`),
    ).toHaveLength(2);
    expect(callsTo("/api/v1/demo/setup/complete")).toHaveLength(1);
  });

  it("completes directly when refresh finds an existing pending proposal", async () => {
    installApi({ detail: [detailWithProposal] });
    const user = userEvent.setup();
    renderWizard();
    await reachFinalStep(user);

    expect(screen.getByText("待审批退款提案已就绪")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "完成设置" }));
    expect(await screen.findByText("模拟环境已就绪，不代表已获得飞鸽消息权限")).toBeVisible();
    expect(
      callsTo(`/api/v1/conversations/${conversationSummary.conversationId}/suggestions`),
    ).toHaveLength(0);
  });

  it("synchronizes setup caches and invalidates affected operational queries", async () => {
    installApi({ detail: [detailWithProposal] });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    client.setQueryData(apiQueryKeys.workspace, workspace);
    client.setQueryData(apiQueryKeys.approvals, { schemaVersion: 1, pending: [], history: [] });
    const user = userEvent.setup();
    renderWizard(client);
    await reachFinalStep(user);
    await user.click(screen.getByRole("button", { name: "完成设置" }));
    await screen.findByText("模拟环境已就绪，不代表已获得飞鸽消息权限");

    expect(client.getQueryData<typeof workspace>(apiQueryKeys.workspace)?.workspace.setup).toEqual(
      completion.setup,
    );
    expect(client.getQueryState(apiQueryKeys.approvals)?.isInvalidated).toBe(true);
    expect(client.getQueryState(apiQueryKeys.conversations)?.isInvalidated).toBe(true);
    expect(
      client.getQueryState(apiQueryKeys.conversationDetail(conversationSummary.conversationId))
        ?.isInvalidated,
    ).toBe(true);
  });

  it("invalidates stale workspace metrics after the acceptance suggestion changes runtime state", async () => {
    installApi({ detail: [conversationDetail] });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    client.setQueryData(apiQueryKeys.workspace, workspace);
    const user = userEvent.setup();
    renderWizard(client);
    await reachFinalStep(user);
    await user.click(screen.getByRole("button", { name: "运行验收并完成设置" }));
    await screen.findByText("模拟环境已就绪，不代表已获得飞鸽消息权限");

    expect(
      client.getQueryData<typeof workspace>(apiQueryKeys.workspace)?.workspace.metrics,
    ).toEqual(workspace.workspace.metrics);
    expect(client.getQueryState(apiQueryKeys.workspace)?.isInvalidated).toBe(true);
  });
});
