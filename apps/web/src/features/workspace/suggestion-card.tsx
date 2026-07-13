import type { ConversationDetail } from "@commerce-copilot/contracts";
import { Badge, Button } from "@commerce-copilot/ui";
import { Check, Clipboard, ExternalLink, Sparkles } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

type Suggestion = NonNullable<ConversationDetail["latestSuggestion"]>;
type Proposal = NonNullable<ConversationDetail["proposal"]>;

export function SuggestionCard({
  suggestion,
  proposal,
  assisted,
}: {
  suggestion: Suggestion;
  proposal: Proposal | null;
  assisted: boolean;
}) {
  const [reply, setReply] = useState(suggestion.suggestedReply);
  const [copied, setCopied] = useState(false);

  async function copyReply() {
    await navigator.clipboard.writeText(reply);
    setCopied(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.ctrlKey && event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void copyReply();
    }
  }

  return (
    <section aria-labelledby="suggestion-heading" className="border-t border-[var(--border)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="suggestion-heading" className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles aria-hidden="true" className="size-4 text-[var(--primary)]" />
          AI 建议
        </h2>
        <Badge status="neutral">确定性演示模型</Badge>
      </div>

      <label
        className="mt-4 block text-xs font-medium text-[var(--text-muted)]"
        htmlFor="suggested-reply"
      >
        建议回复
      </label>
      <textarea
        id="suggested-reply"
        aria-label="建议回复"
        value={reply}
        onChange={(event) => setReply(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={5}
        className="mt-2 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      />

      {suggestion.citations.map((citation) => (
        <details
          key={citation.chunkId}
          className="mt-3 border-y border-[var(--border)] py-3 text-sm"
        >
          <summary className="cursor-pointer font-medium text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
            查看引用依据
          </summary>
          <dl className="mt-3 grid gap-2 text-[var(--text-muted)]">
            <div>
              <dt className="sr-only">来源</dt>
              <dd>{citation.sourceTitle}</dd>
            </div>
            <div>
              <dt className="sr-only">版本</dt>
              <dd>发布版本 {citation.version}</dd>
            </div>
            <div>
              <dt className="sr-only">摘录</dt>
              <dd>{citation.excerpt}</dd>
            </div>
          </dl>
        </details>
      ))}

      {proposal && (
        <div className="mt-4 flex flex-col gap-3 border-l-2 border-[var(--warning-border)] pl-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-medium">申请退款 ¥128.00，需主管审批</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              操作尚未执行，也不会自动发送消息。
            </div>
          </div>
          <a
            href="/approvals"
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            前往审批 <ExternalLink aria-hidden="true" className="size-4" />
          </a>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--text-muted)]">
          {assisted ? "请复制到飞鸽并由人工发送" : "复制后在已授权渠道中发送"}
        </p>
        <Button intent="secondary" onClick={() => void copyReply()}>
          {copied ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Clipboard aria-hidden="true" className="size-4" />
          )}
          {copied ? "已复制" : "复制回复"}
        </Button>
      </div>
    </section>
  );
}
