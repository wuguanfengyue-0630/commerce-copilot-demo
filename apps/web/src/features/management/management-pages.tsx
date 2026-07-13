"use client";

import { Badge } from "@commerce-copilot/ui";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, Bot, FlaskConical, Scale } from "lucide-react";
import { knowledgeQueryOptions, workspaceQueryOptions } from "../../api/queries.ts";
import { AsyncState } from "../../components/async-state.tsx";

export function KnowledgeView() {
  const knowledge = useQuery(knowledgeQueryOptions());
  if (knowledge.isPending) return <AsyncState state="loading" />;
  if (knowledge.isError)
    return <AsyncState state="error" onRetry={() => void knowledge.refetch()} />;
  const policy = knowledge.data.policies[0];
  if (!policy) return <AsyncState state="empty" />;
  return (
    <Page
      title="知识库"
      description="当前演示只使用一个已发布且不可变的政策版本"
      icon={BookOpenCheck}
    >
      <section className="border-y border-[var(--border)] py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{policy.title}</h2>
          <Badge status="success">已发布 · 不可变</Badge>
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          发布版本 {policy.release.version} · {policy.release.releaseId}
        </p>
        <p className="mt-3 text-sm">{policy.content}</p>
        {policy.citations.map((citation) => (
          <blockquote
            key={citation.chunkId}
            className="mt-4 border-l-2 border-[var(--border)] pl-3 text-sm text-[var(--text-muted)]"
          >
            来源：{citation.sourceTitle} · {citation.excerpt}
          </blockquote>
        ))}
      </section>
    </Page>
  );
}

export function RulesView() {
  const workspace = useQuery(workspaceQueryOptions());
  if (workspace.isPending) return <AsyncState state="loading" />;
  if (workspace.isError)
    return <AsyncState state="error" onRetry={() => void workspace.refetch()} />;
  const rule = workspace.data.workspace.activeRules[0];
  return (
    <Page title="规则中心" description="默认禁止写操作，仅开放明确配置的演示规则" icon={Scale}>
      <div className="border-y border-[var(--border)] py-5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">破损商品退款</span>
          <Badge status={rule?.enabled ? "success" : "neutral"}>
            {rule?.enabled ? "已启用" : "已禁用"}
          </Badge>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-[var(--text-muted)]">写操作默认值</dt>
            <dd>禁用</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">审批要求</dt>
            <dd>必须审批</dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">所需角色</dt>
            <dd>客服主管</dd>
          </div>
        </dl>
      </div>
    </Page>
  );
}

export function ModelsView() {
  const workspace = useQuery(workspaceQueryOptions());
  if (workspace.isPending) return <AsyncState state="loading" />;
  if (workspace.isError)
    return <AsyncState state="error" onRetry={() => void workspace.refetch()} />;
  return (
    <Page title="模型配置" description="演示环境不保存或展示任何模型密钥" icon={Bot}>
      <dl className="border-y border-[var(--border)] py-5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--text-muted)]">提供方</dt>
          <dd className="font-medium">{workspace.data.workspace.demoModel.provider}</dd>
        </div>
        <div className="mt-3 flex justify-between gap-4">
          <dt className="text-[var(--text-muted)]">输出模式</dt>
          <dd>确定性</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-[var(--warning-text)]">
        当前仅验证流程一致性，尚未评估模型质量。
      </p>
    </Page>
  );
}

export function EvaluationsView() {
  const workspace = useQuery(workspaceQueryOptions());
  if (workspace.isPending) return <AsyncState state="loading" />;
  if (workspace.isError)
    return <AsyncState state="error" onRetry={() => void workspace.refetch()} />;
  return (
    <Page title="评测中心" description="只报告有证据支持的流程符合性结果" icon={FlaskConical}>
      <section className="border-y border-[var(--border)] py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">破损商品退款流程</h2>
          <Badge status="success">流程符合</Badge>
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          已验证：引用政策、生成提案、主管审批、单次执行。
        </p>
        <p className="mt-2 text-sm">未提供准确率、满意度或模型质量百分比。</p>
      </section>
    </Page>
  );
}

function Page({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: typeof Scale;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Icon aria-hidden="true" className="size-5" />
          {title}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
      </header>
      {children}
    </div>
  );
}
