import type { ConversationDetail } from "@commerce-copilot/contracts";
import { Badge, Button } from "@commerce-copilot/ui";
import { AlertCircle, LoaderCircle, Sparkles, UserRound } from "lucide-react";

import { SuggestionCard } from "./suggestion-card.tsx";

export function MessageThread({
  conversation,
  assisted,
  generationState,
  onGenerate,
}: {
  conversation: ConversationDetail;
  assisted: boolean;
  generationState: "idle" | "pending" | "error" | "needs-human";
  onGenerate: () => void;
}) {
  return (
    <section aria-labelledby="thread-heading" className="min-w-0">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h1 id="thread-heading" className="truncate text-base font-semibold">
            {conversation.customer.displayName}
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">等待客服处理</p>
        </div>
        <Badge status="needs-human">等待人工</Badge>
      </header>

      <div className="space-y-4 p-4">
        {conversation.messages.map((message) => (
          <article key={message.messageId} className="max-w-[90%]">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
              <UserRound aria-hidden="true" className="size-4" />
              消费者
            </div>
            <p className="rounded-lg rounded-tl-sm bg-[var(--surface-subtle)] p-3 text-sm">
              {message.content}
            </p>
          </article>
        ))}
      </div>

      {generationState === "error" && (
        <div
          role="alert"
          className="mx-4 flex items-center gap-2 text-sm text-[var(--danger-text)]"
        >
          <AlertCircle aria-hidden="true" className="size-4" />
          生成失败，请检查网络后重试
        </div>
      )}
      {generationState === "needs-human" && (
        <div className="mx-4 flex items-center gap-2 text-sm text-[var(--warning-text)]">
          <AlertCircle aria-hidden="true" className="size-4" />
          证据不足，需要人工处理
        </div>
      )}

      {conversation.latestSuggestion?.disposition === "propose_action" ? (
        <SuggestionCard
          key={conversation.latestSuggestion.suggestionId}
          suggestion={conversation.latestSuggestion}
          proposal={conversation.proposal}
          assisted={assisted}
        />
      ) : (
        <div className="border-t border-[var(--border)] p-4">
          <Button disabled={generationState === "pending"} onClick={onGenerate}>
            {generationState === "pending" ? (
              <>
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> 正在生成
              </>
            ) : (
              <>
                <Sparkles aria-hidden="true" className="size-4" />{" "}
                {generationState === "error" ? "重新生成" : "生成 AI 建议"}
              </>
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
