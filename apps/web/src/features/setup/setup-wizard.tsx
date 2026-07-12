"use client";

import { Button } from "@commerce-copilot/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import { apiQueryKeys, completeDemoSetup, demoBootstrapQueryOptions } from "../../api/queries.ts";
import { AsyncState } from "../../components/async-state.tsx";

const steps = [
  {
    title: "管理员演示身份",
    description: "以演示店主身份进入客服主管工作区。",
  },
  {
    title: "确定性演示模型",
    description: "使用固定输入与输出的演示模型，保证验收结果可复现。",
  },
  {
    title: "模拟抖音店铺",
    description: "连接抖音电商演示店，仅使用本地模拟数据。",
  },
  {
    title: "同步夹具",
    description: "准备订单、会话和售后所需的确定性夹具。",
  },
  {
    title: "发布破损退款政策",
    description: "启用需要主管审批的破损商品退款规则。",
  },
  {
    title: "运行验收对话",
    description: "验证建议、审批和模拟退款链路可以完整运行。",
  },
] as const;

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

export function SetupWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const queryClient = useQueryClient();
  const bootstrap = useQuery(demoBootstrapQueryOptions());
  const completion = useMutation({
    mutationFn: completeDemoSetup,
    onSuccess: (result) => {
      queryClient.setQueryData(apiQueryKeys.demoBootstrap, (current: typeof bootstrap.data) =>
        current ? { ...current, setup: result.setup } : current,
      );
    },
  });

  if (bootstrap.isPending) {
    return <AsyncState state="loading" />;
  }
  if (bootstrap.isError) {
    return <AsyncState state="error" onRetry={() => void bootstrap.refetch()} />;
  }
  if (bootstrap.data.setup.acceptedAt !== null || completion.isSuccess) {
    return <CompletedSetup />;
  }

  const step = steps[stepIndex] ?? steps[0];
  const isLast = stepIndex === steps.length - 1;
  const busy = completion.isPending;

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
        className="min-h-64 border-y border-[var(--border)] py-8"
      >
        <p className="text-xs font-medium text-[var(--text-muted)]">Commerce Copilot 演示配置</p>
        <h1 id="setup-step-heading" className="mt-3 text-xl font-semibold">
          {step.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)]">{step.description}</p>
        <dl className="mt-7 grid gap-3 text-sm sm:grid-cols-[9rem_1fr]">
          <dt className="text-[var(--text-muted)]">当前店铺</dt>
          <dd>{bootstrap.data.store.displayName}</dd>
          <dt className="text-[var(--text-muted)]">演示身份</dt>
          <dd>{bootstrap.data.actor.displayName}</dd>
        </dl>
      </section>

      {completion.isError && (
        <div
          role="alert"
          className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[var(--danger-text)]"
        >
          <span>设置未能保存，请检查服务后重试。</span>
          <Button intent="secondary" onClick={() => completion.mutate()}>
            <RotateCcw aria-hidden="true" className="size-4" />
            重试完成设置
          </Button>
        </div>
      )}

      {busy && (
        <div
          role="status"
          aria-live="polite"
          className="mt-5 flex items-center gap-2 text-sm text-[var(--text-muted)]"
        >
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          正在保存设置
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
          <Button disabled={busy} onClick={() => completion.mutate()}>
            {busy ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                正在完成
              </>
            ) : (
              <>
                <CheckCircle2 aria-hidden="true" className="size-4" />
                完成设置
              </>
            )}
          </Button>
        ) : (
          <Button
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
