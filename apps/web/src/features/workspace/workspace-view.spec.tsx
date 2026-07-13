import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../../api/client.ts";
import { WorkspaceView } from "./workspace-view.tsx";

vi.mock("../../api/client.ts", () => ({ apiRequest: vi.fn() }));

const conversationId = "conversation-damaged-item-1";
const conversation = {
  companyId: "company-demo",
  storeId: "store-douyin-demo",
  conversationId,
  customer: { customerId: "customer-demo", displayName: "演示顾客" },
  status: "waiting_for_agent",
  lastMessagePreview: "商品破损，申请退款",
  unreadCount: 1,
  updatedAt: "2026-07-11T01:02:03.000Z",
} as const;

const citation = {
  releaseId: "release-damaged-item-v1",
  chunkId: "chunk-damaged-item-v1",
  sourceTitle: "破损商品退款政策",
  excerpt: "商品破损可提交退款申请，须经主管审批。",
  version: 1,
} as const;

const order = {
  companyId: "company-demo",
  storeId: "store-douyin-demo",
  orderId: "order-delivered-12800",
  version: 1,
  status: "delivered",
  total: { amountMinor: 12800, currency: "CNY" },
  refundable: { amountMinor: 12800, currency: "CNY" },
  updatedAt: "2026-07-11T01:02:03.000Z",
} as const;

const suggestion = {
  suggestionId: "suggestion-demo",
  companyId: "company-demo",
  storeId: "store-douyin-demo",
  conversationId,
  orderId: order.orderId,
  correlationId: "demo-workflow:conversation-damaged-item-1",
  causationId: "message-demo",
  provider: "deterministic-demo",
  disposition: "propose_action",
  suggestedReply:
    "根据已发布政策《破损商品退款政策》，建议为该破损商品提交退款申请，需审批并由主管确认后执行。",
  citations: [citation],
  actionDraft: {
    kind: "after_sale.refund",
    orderId: order.orderId,
    amount: { amountMinor: 12800, currency: "CNY" },
    reasonCode: "damaged_item",
    observedOrderVersion: 1,
    observedOrderStatus: "delivered",
    observedRefundableAmount: { amountMinor: 12800, currency: "CNY" },
  },
  reason: null,
  createdAt: "2026-07-11T01:10:00.000Z",
} as const;

const proposal = {
  proposalId: "proposal-demo-refund",
  version: 1,
  companyId: "company-demo",
  storeId: "store-douyin-demo",
  conversationId,
  action: {
    kind: "after_sale.refund",
    orderId: order.orderId,
    amount: { amountMinor: 12800, currency: "CNY" },
    reasonCode: "damaged_item",
    observedOrder: {
      version: 1,
      status: "delivered",
      refundable: { amountMinor: 12800, currency: "CNY" },
    },
  },
  status: "pending_approval",
  createdAt: "2026-07-11T01:10:00.000Z",
  expiresAt: "2026-07-11T02:10:00.000Z",
  approval: null,
  rejection: null,
  execution: null,
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
      measuredAt: "2026-07-11T01:20:00.000Z",
    },
    integrations: [],
    activeRules: [],
    messageSendMode: "assisted",
    demoModel: { provider: "deterministic-demo", deterministic: true },
    evaluationSummary: { scenario: "damaged_item", status: "ready", score: 1 },
    setup: { status: "complete", acceptedAt: "2026-07-11T01:30:00.000Z" },
  },
} as const;

const detail = {
  schemaVersion: 1,
  conversation: {
    ...conversation,
    messages: [
      {
        messageId: "message-demo",
        role: "customer",
        origin: "platform",
        content: "商品破损，申请退款",
        externalMessageId: "external-message-demo",
        occurredAt: "2026-07-11T01:02:03.000Z",
      },
    ],
    order,
    latestSuggestion: null,
    citations: [],
    proposal: null,
  },
} as const;

function installApi(
  options: {
    generated?: unknown;
    generation?: Promise<unknown>;
    generationError?: Error;
    detailOverride?: unknown;
  } = {},
) {
  vi.mocked(apiRequest).mockImplementation((path, _schema, init) => {
    if (path === "/api/v1/workspace") return Promise.resolve(workspace);
    if (path === "/api/v1/conversations") {
      return Promise.resolve({
        schemaVersion: 1,
        conversations: [conversation],
        generatedAt: "2026-07-11T01:20:00.000Z",
      });
    }
    if (path === `/api/v1/conversations/${conversationId}`) {
      return Promise.resolve(options.detailOverride ?? detail);
    }
    if (path === `/api/v1/conversations/${conversationId}/suggestions` && init?.method === "POST") {
      if (options.generationError) return Promise.reject(options.generationError);
      return (
        options.generation ??
        Promise.resolve(options.generated ?? { schemaVersion: 1, suggestion, proposal })
      );
    }
    if (path === undefined) return Promise.resolve(workspace);
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
}

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<WorkspaceView />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("WorkspaceView", () => {
  beforeEach(() => vi.mocked(apiRequest).mockClear());

  it("loads the seeded customer message and current order", async () => {
    installApi();
    renderWorkspace();

    expect(await screen.findByRole("heading", { name: "演示顾客" })).toBeVisible();
    expect(screen.getByText("消费者")).toBeVisible();
    expect(screen.getAllByText("商品破损，申请退款")[0]).toBeVisible();
    expect(screen.getAllByText(order.orderId)[0]).toBeVisible();
    expect(screen.getAllByText("¥128.00")[0]).toBeVisible();
  });

  it("shows an editable grounded AI suggestion and expandable citation", async () => {
    installApi({
      detailOverride: {
        ...detail,
        conversation: {
          ...detail.conversation,
          latestSuggestion: suggestion,
          citations: [citation],
          proposal,
        },
      },
    });
    renderWorkspace();

    expect((await screen.findAllByText("AI 建议"))[0]).toBeVisible();
    expect(screen.getAllByRole("textbox", { name: "建议回复" })[0]).toHaveValue(
      suggestion.suggestedReply,
    );
    const citationToggle = screen.getAllByText("查看引用依据").at(0);
    if (citationToggle === undefined) throw new Error("Citation toggle is missing");
    await userEvent.click(citationToggle);
    expect(screen.getAllByText(citation.sourceTitle)[0]).toBeVisible();
    expect(screen.getAllByText("发布版本 1")[0]).toBeVisible();
    expect(screen.getAllByText(citation.excerpt)[0]).toBeVisible();
    expect(screen.getAllByText("申请退款 ¥128.00，需主管审批")[0]).toBeVisible();
    expect(screen.getAllByRole("link", { name: "前往审批" })[0]).toHaveAttribute(
      "href",
      "/approvals",
    );
  });

  it("creates one pending proposal and never claims a message was sent", async () => {
    let resolveGeneration!: (value: unknown) => void;
    const generation = new Promise((resolve) => {
      resolveGeneration = resolve;
    });
    installApi({ generation });
    renderWorkspace();
    const user = userEvent.setup();
    const generate = await screen.findByRole("button", { name: "生成 AI 建议" });

    await user.dblClick(generate);
    expect(generate).toBeDisabled();
    expect(
      vi
        .mocked(apiRequest)
        .mock.calls.filter(([path]) => typeof path === "string" && path.endsWith("/suggestions")),
    ).toHaveLength(1);
    resolveGeneration({ schemaVersion: 1, suggestion, proposal });
    expect((await screen.findAllByText("申请退款 ¥128.00，需主管审批"))[0]).toBeVisible();
    expect(screen.getAllByText("请复制到飞鸽并由人工发送")[0]).toBeVisible();
    expect(screen.queryByText(/已发送|发送成功/)).not.toBeInTheDocument();
  });

  it("does not copy on Ctrl+Enter while IME composition is active", async () => {
    installApi({
      detailOverride: {
        ...detail,
        conversation: {
          ...detail.conversation,
          latestSuggestion: suggestion,
          citations: [citation],
          proposal,
        },
      },
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    renderWorkspace();
    const editor = (await screen.findAllByRole("textbox", { name: "建议回复" })).at(0);
    if (editor === undefined) throw new Error("Suggestion editor is missing");

    fireEvent.compositionStart(editor);
    fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true, isComposing: true });
    fireEvent.compositionEnd(editor);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("shows actionable retry feedback for generation failures", async () => {
    installApi({ generationError: new Error("offline") });
    renderWorkspace();
    await userEvent.click(await screen.findByRole("button", { name: "生成 AI 建议" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("生成失败，请检查网络后重试");
    expect(screen.getByRole("button", { name: "重新生成" })).toBeEnabled();
  });

  it("shows needs-human feedback when evidence cannot support an action", async () => {
    installApi({
      generated: {
        schemaVersion: 1,
        suggestion: {
          ...suggestion,
          disposition: "needs_human",
          actionDraft: null,
          reason: "ORDER_UNAVAILABLE",
        },
        proposal: null,
      },
    });
    renderWorkspace();
    await userEvent.click(await screen.findByRole("button", { name: "生成 AI 建议" }));
    expect((await screen.findAllByText("证据不足，需要人工处理"))[0]).toBeVisible();
    expect(screen.queryByText("申请退款 ¥128.00，需主管审批")).not.toBeInTheDocument();
  });
});
