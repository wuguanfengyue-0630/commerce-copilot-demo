import { Badge } from "@commerce-copilot/ui";
import { ArrowRight, ClipboardCheck, MessagesSquare } from "lucide-react";

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">总览</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            查看当前客服队列与需要处理的事项。
          </p>
        </div>
        <Badge status="neutral">平台尚未接入</Badge>
      </section>
      <section aria-labelledby="queue-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="queue-heading" className="text-sm font-semibold">
            今日工作队列
          </h2>
          <span className="text-xs text-[var(--text-muted)]">模拟数据</span>
        </div>
        <div className="grid border-y border-[var(--border)] sm:grid-cols-2 sm:divide-x sm:divide-[var(--border)]">
          <a
            href="/conversations"
            className="group flex min-h-28 items-center gap-4 px-2 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] sm:px-5"
          >
            <MessagesSquare aria-hidden="true" className="size-6 text-[var(--primary)]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">统一会话</div>
              <div className="mt-1 text-sm text-[var(--text-muted)]">等待后续任务接入会话数据</div>
            </div>
            <ArrowRight aria-hidden="true" className="size-5 text-[var(--text-muted)]" />
          </a>
          <a
            href="/approvals"
            className="group flex min-h-28 items-center gap-4 border-t border-[var(--border)] px-2 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] sm:border-t-0 sm:px-5"
          >
            <ClipboardCheck aria-hidden="true" className="size-6 text-[var(--warning-text)]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">审批中心</div>
              <div className="mt-1 text-sm text-[var(--text-muted)]">暂无待审批操作</div>
            </div>
            <ArrowRight aria-hidden="true" className="size-5 text-[var(--text-muted)]" />
          </a>
        </div>
      </section>
    </div>
  );
}
