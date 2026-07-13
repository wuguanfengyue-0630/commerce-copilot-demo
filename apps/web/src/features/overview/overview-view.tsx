"use client";

import { Badge } from "@commerce-copilot/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CircleGauge, ClipboardCheck, MessagesSquare } from "lucide-react";

import { approvalsQueryOptions, workspaceQueryOptions } from "../../api/queries.ts";
import { AsyncState } from "../../components/async-state.tsx";

const moneyFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
});

export function OverviewView() {
  const workspace = useQuery(workspaceQueryOptions());
  const approvals = useQuery(approvalsQueryOptions());

  if (workspace.isPending || approvals.isPending) {
    return <AsyncState state="loading" />;
  }
  if (workspace.isError || approvals.isError) {
    return (
      <AsyncState
        state="error"
        onRetry={() => {
          void workspace.refetch();
          void approvals.refetch();
        }}
      />
    );
  }

  const { metrics, integrations } = workspace.data.workspace;
  const capabilities = integrations.flatMap((integration) => integration.capabilities);
  const availableCount = capabilities.filter(({ status }) => status === "available").length;
  const waitingCount = capabilities.filter(
    ({ status }) => status === "waiting_qualification",
  ).length;

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">运营总览</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">当前演示店铺的客服运行状态</p>
        </div>
        <Badge status="neutral">未接入 / 模拟</Badge>
      </header>

      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <CircleGauge aria-hidden="true" className="size-4" />
          实时指标
        </h2>
        <dl className="grid border-y border-[var(--border)] sm:grid-cols-2 lg:grid-cols-5 lg:divide-x lg:divide-[var(--border)]">
          {[
            ["开放会话", String(metrics.openConversations)],
            ["助手建议", String(metrics.assistantSuggestions)],
            ["等待人工", String(metrics.waitingForAgent)],
            ["待审批", String(approvals.data.pending.length)],
            ["接口健康", `${availableCount} 可用 / ${waitingCount} 等待`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="grid min-h-20 grid-cols-[1fr_auto] items-center gap-3 border-b border-[var(--border)] px-2 py-3 last:border-b-0 sm:px-4 lg:block lg:border-b-0"
            >
              <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
              <dd className="text-lg font-semibold lg:mt-2">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          已模拟退款 {moneyFormatter.format(metrics.refundedAmount.amountMinor / 100)}
        </p>
      </section>

      <section aria-labelledby="approval-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="approval-heading" className="flex items-center gap-2 text-sm font-semibold">
            <ClipboardCheck aria-hidden="true" className="size-4" />
            待审批操作
          </h2>
          <a
            href="/approvals"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            处理审批
            <ArrowRight aria-hidden="true" className="size-4" />
          </a>
        </div>
        {approvals.data.pending.length === 0 ? (
          <div className="flex min-h-20 items-center gap-2 border-y border-[var(--border)] px-2 text-sm text-[var(--text-muted)]">
            <MessagesSquare aria-hidden="true" className="size-5" />
            当前没有待审批操作
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {approvals.data.pending.map((proposal) => (
              <li
                key={proposal.proposalId}
                className="flex min-h-20 flex-col gap-3 px-2 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">破损商品退款</div>
                  <div className="mt-1 text-sm text-[var(--text-muted)]">
                    {proposal.action.orderId} ·{" "}
                    {moneyFormatter.format(proposal.action.amount.amountMinor / 100)}
                  </div>
                </div>
                <Badge status="needs-human">等待人工审批</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
