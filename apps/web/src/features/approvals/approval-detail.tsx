"use client";

import type { ApprovalsResponse } from "@commerce-copilot/contracts";
import { Badge, Button } from "@commerce-copilot/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, FileCheck2, LoaderCircle, ShieldAlert } from "lucide-react";
import { useRef, useState } from "react";

import { ApiClientError } from "../../api/client.ts";
import {
  apiQueryKeys,
  conversationDetailQueryOptions,
  decideDemoApproval,
  executeDemoProposal,
  knowledgeQueryOptions,
} from "../../api/queries.ts";
import { AsyncState } from "../../components/async-state.tsx";

type Proposal = ApprovalsResponse["pending"][number];
type ResultState = "idle" | "executed" | "needs-human" | "error";

const money = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
});

export function ApprovalDetail({ proposal }: { proposal: Proposal }) {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const approvedProposalId = useRef<string | null>(null);
  const [result, setResult] = useState<ResultState>("idle");
  const [message, setMessage] = useState("");
  const [retryPhase, setRetryPhase] = useState<"approval" | "execution">("approval");
  const detail = useQuery(conversationDetailQueryOptions(proposal.conversationId));
  const knowledge = useQuery(knowledgeQueryOptions());
  const impact = money.format(proposal.action.amount.amountMinor / 100);

  const approval = useMutation({
    retry: false,
    mutationFn: async () => {
      let proposalId = approvedProposalId.current;
      if (proposalId === null) {
        const decision = await decideDemoApproval(proposal.proposalId, proposal.version);
        proposalId = decision.proposal.proposalId;
        approvedProposalId.current = proposalId;
        setRetryPhase("execution");
      }
      return executeDemoProposal(proposalId);
    },
    onSuccess: (execution) => {
      if (execution.result.status === "needs_human") {
        setResult("needs-human");
        setMessage(
          execution.result.reason === "ORDER_CHANGED"
            ? "订单已变化，需要人工复核"
            : "执行结果无法确认，需要人工复核",
        );
      } else {
        setResult("executed");
        setMessage("模拟退款已执行");
      }
      invalidateApprovalSurfaces(queryClient, proposal.conversationId);
    },
    onError: (error) => {
      setResult("error");
      setMessage(errorMessage(error));
      setRetryPhase(approvedProposalId.current === null ? "approval" : "execution");
    },
    onSettled: () => {
      inFlight.current = false;
    },
  });

  function approve() {
    if (inFlight.current || approval.isPending) return;
    inFlight.current = true;
    setResult("idle");
    setMessage("");
    approval.mutate();
  }

  if (detail.isPending || knowledge.isPending) return <AsyncState state="loading" />;
  if (detail.isError || knowledge.isError) {
    return (
      <AsyncState
        state="error"
        onRetry={() => {
          void detail.refetch();
          void knowledge.refetch();
        }}
      />
    );
  }

  const citation =
    detail.data.conversation.citations[0] ?? knowledge.data.policies[0]?.citations[0];
  const orderDrifted =
    detail.data.conversation.order.version !== proposal.action.observedOrder.version ||
    detail.data.conversation.order.refundable.amountMinor < proposal.action.amount.amountMinor;

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[var(--text-muted)]">退款操作提案</p>
          <h2 className="mt-1 text-lg font-semibold">破损商品退款</h2>
        </div>
        <Badge status="needs-human">等待主管审批</Badge>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section aria-labelledby={`customer-${proposal.proposalId}`}>
          <h3 id={`customer-${proposal.proposalId}`} className="text-sm font-semibold">
            消费者原文
          </h3>
          <p className="mt-2 rounded-md bg-[var(--surface-subtle)] p-3 text-sm">
            {detail.data.conversation.messages.at(-1)?.content}
          </p>
        </section>
        <section aria-labelledby={`order-${proposal.proposalId}`}>
          <h3 id={`order-${proposal.proposalId}`} className="text-sm font-semibold">
            实时订单事实
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--text-muted)]">订单</dt>
              <dd className="mt-1 break-all">{detail.data.conversation.order.orderId}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-muted)]">可退金额</dt>
              <dd className="mt-1 font-semibold">
                {money.format(detail.data.conversation.order.refundable.amountMinor / 100)}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {citation && (
        <section
          className="mt-5 border-y border-[var(--border)] py-4"
          aria-labelledby={`policy-${proposal.proposalId}`}
        >
          <h3
            id={`policy-${proposal.proposalId}`}
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <FileCheck2 aria-hidden="true" className="size-4" />
            {citation.sourceTitle}
          </h3>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            发布版本 {citation.version} · {citation.excerpt}
          </p>
        </section>
      )}

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-[var(--text-muted)]">金融影响</dt>
          <dd className="mt-1 text-lg font-semibold">退款 {impact}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">风险</dt>
          <dd className="mt-1 text-sm">不可自动撤销</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">权限</dt>
          <dd className="mt-1 text-sm">所需角色：客服主管</dd>
        </div>
      </dl>
      <p className="mt-3 flex items-center gap-2 text-sm text-[var(--warning-text)]">
        <ShieldAlert aria-hidden="true" className="size-4" />
        预期影响：批准后立即执行一次模拟退款，不会自动发送客服消息。
      </p>

      {orderDrifted && (
        <div role="alert" className="mt-4 text-sm text-[var(--warning-text)]">
          订单已变化，需要人工复核
        </div>
      )}
      {result === "error" && (
        <div
          role="alert"
          className="mt-4 flex items-center gap-2 text-sm text-[var(--danger-text)]"
        >
          <AlertCircle aria-hidden="true" className="size-4" />
          {message}
        </div>
      )}
      {result === "needs-human" && (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--warning-text)]">
          <AlertCircle aria-hidden="true" className="size-4" />
          {message}
        </div>
      )}
      {result === "executed" && (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--success-text)]">
          <CheckCircle2 aria-hidden="true" className="size-4" />
          {message}
        </div>
      )}

      {result !== "executed" && result !== "needs-human" && (
        <div className="mt-5">
          <Button
            intent="danger"
            impactLabel={`${result === "error" ? (retryPhase === "execution" ? "重试执行" : "重试批准") : "批准"}退款 ${impact}`}
            disabled={approval.isPending || orderDrifted}
            onClick={approve}
            {...(approval.isPending ? { icon: LoaderCircle } : {})}
          />
        </div>
      )}
    </article>
  );
}

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) return "操作失败，请检查网络后重试";
  if (error.code === "APPROVAL_EXPIRED") return "提案已过期，请重新生成建议";
  if (error.code === "APPROVAL_CONFLICT") return "该操作已被处理，请刷新查看最新状态";
  return "操作失败，请检查网络后重试";
}

function invalidateApprovalSurfaces(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
) {
  const options = { refetchType: "none" as const };
  void queryClient.invalidateQueries({
    queryKey: apiQueryKeys.conversationDetail(conversationId),
    ...options,
  });
  void queryClient.invalidateQueries({ queryKey: apiQueryKeys.conversations, ...options });
  void queryClient.invalidateQueries({ queryKey: apiQueryKeys.approvals, ...options });
  void queryClient.invalidateQueries({ queryKey: apiQueryKeys.workspace, ...options });
  void queryClient.invalidateQueries({ queryKey: apiQueryKeys.audit(conversationId), ...options });
}
