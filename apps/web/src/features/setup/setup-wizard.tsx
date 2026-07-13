"use client";

import type {
  ConversationDetailResponse,
  DemoBootstrapResponse,
  SuggestionResponse,
  WorkspaceResponse,
} from "@commerce-copilot/contracts";
import { Button } from "@commerce-copilot/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { ApiClientError } from "../../api/client.ts";
import {
  apiQueryKeys,
  completeDemoSetup,
  conversationDetailQueryOptions,
  conversationsQueryOptions,
  demoBootstrapQueryOptions,
  generateDemoSuggestion,
  getConversationDetail,
  knowledgeQueryOptions,
  workspaceQueryOptions,
} from "../../api/queries.ts";

const steps = [
  {
    title: "管理员演示身份",
    description: "验证当前演示管理员与客服主管工作区身份。",
  },
  {
    title: "确定性演示模型",
    description: "验证确定性模型与破损退款评测已经就绪。",
  },
  {
    title: "模拟抖音店铺",
    description: "确认当前店铺来自抖音电商模拟平台。",
  },
  {
    title: "同步夹具",
    description: "核对验收会话、消息和订单夹具已经同步。",
  },
  {
    title: "发布破损退款政策",
    description: "核对唯一发布的破损商品退款政策与版本。",
  },
  {
    title: "运行验收对话",
    description: "生成确定性建议与待审批退款提案，再接受演示设置。",
  },
] as const;

type StepFact = Readonly<{
  ready: boolean;
  state: "loading" | "error" | "ready" | "waiting";
  status: string;
  details?: ReactNode;
  retry?: () => void;
}>;

class SetupFlowError extends Error {}

function hasPendingProposal(data: ConversationDetailResponse | undefined): boolean {
  return (
    data?.conversation.latestSuggestion?.disposition === "propose_action" &&
    data.conversation.proposal?.status === "pending_approval"
  );
}

function hasPendingSuggestion(result: SuggestionResponse): boolean {
  return (
    result.suggestion.disposition === "propose_action" &&
    result.proposal?.status === "pending_approval"
  );
}

function CompletedSetup() {
  return (
    <div className="flex min-h-72 flex-col items-start justify-center gap-4 py-8">
      <CheckCircle2 aria-hidden="true" className="size-10 text-[var(--success-text)]" />
      <div>
        <h1 className="text-xl font-semibold">演示环境设置完成</h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--text-muted)]">
          模拟环境已就绪，不代表已获得飞鸽消息权限
        </p>
      </div>
      <a
        href="/overview"
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--primary)] px-4 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      >
        进入总览
        <ArrowRight aria-hidden="true" className="size-4" />
      </a>
    </div>
  );
}

function FactStatus({ fact }: { fact: StepFact }) {
  if (fact.state === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mt-7 flex items-center gap-2 text-sm text-[var(--text-muted)]"
      >
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        {fact.status}
      </div>
    );
  }
  if (fact.state === "error") {
    return (
      <div role="alert" className="mt-7 space-y-3 text-sm text-[var(--danger-text)]">
        <div className="flex items-center gap-2">
          <AlertCircle aria-hidden="true" className="size-5 shrink-0" />
          {fact.status}
        </div>
        <Button intent="secondary" onClick={fact.retry}>
          <RotateCcw aria-hidden="true" className="size-4" />
          重试验证
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-7 space-y-4 text-sm">
      <div
        className={`flex items-center gap-2 font-medium ${fact.state === "ready" ? "text-[var(--success-text)]" : "text-[var(--warning-text)]"}`}
      >
        {fact.state === "ready" ? (
          <CheckCircle2 aria-hidden="true" className="size-5 shrink-0" />
        ) : (
          <Clock3 aria-hidden="true" className="size-5 shrink-0" />
        )}
        {fact.status}
      </div>
      {fact.details}
    </div>
  );
}

export function SetupWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const submitting = useRef(false);
  const queryClient = useQueryClient();
  const bootstrap = useQuery(demoBootstrapQueryOptions());
  const workspace = useQuery(workspaceQueryOptions());
  const conversations = useQuery(conversationsQueryOptions());
  const conversationId = conversations.data?.conversations[0]?.conversationId;
  const detail = useQuery(conversationDetailQueryOptions(conversationId));
  const knowledge = useQuery(knowledgeQueryOptions());

  async function ensurePendingProposal(id: string): Promise<void> {
    const detailKey = apiQueryKeys.conversationDetail(id);
    const cached = queryClient.getQueryData<ConversationDetailResponse>(detailKey);
    if (hasPendingProposal(cached)) return;

    try {
      const result = await generateDemoSuggestion(id);
      if (!hasPendingSuggestion(result)) {
        throw new SetupFlowError("验收提案尚未确认，请重新运行验收。");
      }
      queryClient.setQueryData<ConversationDetailResponse>(detailKey, (current) =>
        current
          ? {
              ...current,
              conversation: {
                ...current.conversation,
                latestSuggestion: result.suggestion,
                proposal: result.proposal,
                citations: result.suggestion.citations,
              },
            }
          : current,
      );
    } catch (error) {
      if (error instanceof SetupFlowError) throw error;
      if (
        !(error instanceof ApiClientError) ||
        error.code !== "GENERATE_SUGGESTION_DUPLICATE_COMMAND"
      ) {
        throw new SetupFlowError("验收对话运行失败，请检查服务后重试。");
      }
      const reconciled = await getConversationDetail(id);
      queryClient.setQueryData(detailKey, reconciled);
      if (!hasPendingProposal(reconciled)) {
        throw new SetupFlowError("验收提案尚未确认，请重新运行验收。");
      }
    }
  }

  const completion = useMutation({
    mutationFn: async () => {
      if (conversationId === undefined) {
        throw new SetupFlowError("验收会话尚未就绪，请先重试验证。");
      }
      await ensurePendingProposal(conversationId);
      return completeDemoSetup();
    },
    onSuccess: (result) => {
      queryClient.setQueryData<DemoBootstrapResponse>(apiQueryKeys.demoBootstrap, (current) =>
        current ? { ...current, setup: result.setup } : current,
      );
      queryClient.setQueryData<WorkspaceResponse>(apiQueryKeys.workspace, (current) =>
        current
          ? { ...current, workspace: { ...current.workspace, setup: result.setup } }
          : current,
      );
      void queryClient.invalidateQueries({
        queryKey: apiQueryKeys.workspace,
        refetchType: "none",
      });
      void queryClient.invalidateQueries({
        queryKey: apiQueryKeys.approvals,
        refetchType: "none",
      });
      void queryClient.invalidateQueries({
        queryKey: apiQueryKeys.conversations,
        refetchType: "none",
      });
      void queryClient.invalidateQueries({
        queryKey: apiQueryKeys.knowledge,
        refetchType: "none",
      });
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  if (bootstrap.data?.setup.acceptedAt !== null && bootstrap.data?.setup.acceptedAt !== undefined) {
    return <CompletedSetup />;
  }
  if (completion.isSuccess) {
    return <CompletedSetup />;
  }

  const retryBootstrap = () => void bootstrap.refetch();
  const retryWorkspace = () => void workspace.refetch();
  const retryConversations = () => {
    void conversations.refetch();
    if (conversationId !== undefined) void detail.refetch();
  };
  const retryKnowledge = () => void knowledge.refetch();
  const retryDetail = () => void detail.refetch();

  let fact: StepFact;
  switch (stepIndex) {
    case 0:
      fact = bootstrap.isPending
        ? { ready: false, state: "loading", status: "正在验证管理员演示身份" }
        : bootstrap.isError || bootstrap.data.actor.role !== "owner"
          ? {
              ready: false,
              state: "error",
              status: "管理员身份验证失败，请重新加载身份信息。",
              retry: retryBootstrap,
            }
          : {
              ready: true,
              state: "ready",
              status: "管理员身份已验证",
              details: (
                <dl className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                  <dt className="text-[var(--text-muted)]">演示管理员</dt>
                  <dd>{bootstrap.data.actor.displayName}</dd>
                  <dt className="text-[var(--text-muted)]">工作区身份</dt>
                  <dd>店铺负责人 / 客服主管</dd>
                </dl>
              ),
            };
      break;
    case 1:
      fact = workspace.isPending
        ? { ready: false, state: "loading", status: "正在验证确定性演示模型" }
        : workspace.isError ||
            !workspace.data.workspace.demoModel.deterministic ||
            workspace.data.workspace.evaluationSummary.status !== "ready"
          ? {
              ready: false,
              state: "error",
              status: "确定性模型验证失败，请重新加载模型状态。",
              retry: retryWorkspace,
            }
          : {
              ready: true,
              state: "ready",
              status: "确定性模型与评测已就绪",
              details: (
                <dl className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                  <dt className="text-[var(--text-muted)]">模型</dt>
                  <dd>{workspace.data.workspace.demoModel.provider}</dd>
                  <dt className="text-[var(--text-muted)]">破损退款评测</dt>
                  <dd>{workspace.data.workspace.evaluationSummary.score * 100}%</dd>
                </dl>
              ),
            };
      break;
    case 2:
      fact = bootstrap.isPending
        ? { ready: false, state: "loading", status: "正在验证模拟抖音店铺" }
        : bootstrap.isError || bootstrap.data.store.platform !== "douyin"
          ? {
              ready: false,
              state: "error",
              status: "模拟店铺验证失败，请重新加载店铺信息。",
              retry: retryBootstrap,
            }
          : {
              ready: true,
              state: "ready",
              status: "模拟抖音店铺已识别",
              details: (
                <dl className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                  <dt className="text-[var(--text-muted)]">店铺</dt>
                  <dd>{bootstrap.data.store.displayName}</dd>
                  <dt className="text-[var(--text-muted)]">店铺 ID</dt>
                  <dd>{bootstrap.data.store.storeId}</dd>
                </dl>
              ),
            };
      break;
    case 3: {
      const empty = conversations.data?.conversations.length === 0;
      const invalidDetail =
        detail.data !== undefined &&
        (detail.data.conversation.messages.length === 0 || !detail.data.conversation.order.orderId);
      fact =
        conversations.isPending || (conversationId !== undefined && detail.isPending)
          ? { ready: false, state: "loading", status: "正在验证会话与订单夹具" }
          : conversations.isError || detail.isError || empty || invalidDetail
            ? {
                ready: false,
                state: "error",
                status: "会话与订单夹具验证失败，请重新同步。",
                retry: retryConversations,
              }
            : {
                ready: detail.data !== undefined,
                state: detail.data === undefined ? "loading" : "ready",
                status:
                  detail.data === undefined ? "正在验证会话与订单夹具" : "会话与订单夹具已同步",
                details: detail.data && (
                  <dl className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                    <dt className="text-[var(--text-muted)]">验收会话</dt>
                    <dd>{detail.data.conversation.conversationId}</dd>
                    <dt className="text-[var(--text-muted)]">订单</dt>
                    <dd>{detail.data.conversation.order.orderId}</dd>
                  </dl>
                ),
              };
      break;
    }
    case 4: {
      const policy = knowledge.data?.policies[0];
      fact = knowledge.isPending
        ? { ready: false, state: "loading", status: "正在验证破损退款政策" }
        : knowledge.isError || knowledge.data.policies.length !== 1 || policy === undefined
          ? {
              ready: false,
              state: "error",
              status: "退款政策验证失败，请重新加载发布版本。",
              retry: retryKnowledge,
            }
          : {
              ready: true,
              state: "ready",
              status: "破损退款政策已发布",
              details: (
                <dl className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                  <dt className="text-[var(--text-muted)]">政策</dt>
                  <dd>{policy.title}</dd>
                  <dt className="text-[var(--text-muted)]">发布版本</dt>
                  <dd>发布版本 {policy.release.version}</dd>
                </dl>
              ),
            };
      break;
    }
    default:
      fact = detail.isPending
        ? { ready: false, state: "loading", status: "正在检查验收对话状态" }
        : detail.isError || detail.data === undefined
          ? {
              ready: false,
              state: "error",
              status: "验收对话状态验证失败，请重新加载。",
              retry: retryDetail,
            }
          : hasPendingProposal(detail.data)
            ? {
                ready: true,
                state: "ready",
                status: "待审批退款提案已就绪",
                details: (
                  <p className="text-[var(--text-muted)]">
                    {detail.data.conversation.proposal?.proposalId}
                  </p>
                ),
              }
            : {
                ready: true,
                state: "waiting",
                status: "验收对话待运行",
                details: (
                  <p className="text-[var(--text-muted)]">
                    将为 {detail.data.conversation.order.orderId} 生成建议与待审批提案。
                  </p>
                ),
              };
  }

  const step = steps[stepIndex] ?? steps[0];
  const isLast = stepIndex === steps.length - 1;
  const busy = completion.isPending;
  const existingProposal = hasPendingProposal(detail.data);

  function submitCompletion() {
    if (submitting.current || completion.isPending || !fact.ready) return;
    submitting.current = true;
    completion.mutate();
  }

  const completionError =
    completion.error instanceof SetupFlowError
      ? completion.error.message
      : "设置未能保存，请检查服务后重试。";

  return (
    <div className="mx-auto w-full max-w-3xl py-4 sm:py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="font-medium">设置演示环境</span>
          <span className="shrink-0 text-[var(--text-muted)]">
            第 {stepIndex + 1} 步，共 {steps.length} 步
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="设置进度"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={stepIndex + 1}
          className="mt-3 grid h-2 grid-cols-6 gap-1"
        >
          {steps.map(({ title }, index) => (
            <span
              key={title}
              aria-hidden="true"
              className={`rounded-sm ${index <= stepIndex ? "bg-[var(--primary)]" : "bg-[var(--surface-subtle)]"}`}
            />
          ))}
        </div>
      </div>

      <section
        aria-labelledby="setup-step-heading"
        className="min-h-72 border-y border-[var(--border)] py-8"
      >
        <p className="text-xs font-medium text-[var(--text-muted)]">Commerce Copilot 演示配置</p>
        <h1 id="setup-step-heading" className="mt-3 text-xl font-semibold">
          {step.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)]">{step.description}</p>
        <FactStatus fact={fact} />
      </section>

      {completion.isError && (
        <div
          role="alert"
          className="mt-5 flex items-center gap-2 text-sm text-[var(--danger-text)]"
        >
          <AlertCircle aria-hidden="true" className="size-5 shrink-0" />
          {completionError}
        </div>
      )}

      {busy && (
        <div
          role="status"
          aria-live="polite"
          className="mt-5 flex items-center gap-2 text-sm text-[var(--text-muted)]"
        >
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          正在保存验收结果
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          intent="secondary"
          disabled={stepIndex === 0 || busy}
          onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          上一步
        </Button>
        {isLast ? (
          <Button disabled={!fact.ready || busy} onClick={submitCompletion}>
            {busy ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                正在运行验收
              </>
            ) : completion.isError ? (
              <>
                <RotateCcw aria-hidden="true" className="size-4" />
                重试完成设置
              </>
            ) : existingProposal ? (
              <>
                <CheckCircle2 aria-hidden="true" className="size-4" />
                完成设置
              </>
            ) : (
              <>
                <CheckCircle2 aria-hidden="true" className="size-4" />
                运行验收并完成设置
              </>
            )}
          </Button>
        ) : (
          <Button
            disabled={!fact.ready || busy}
            onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
          >
            下一步
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
