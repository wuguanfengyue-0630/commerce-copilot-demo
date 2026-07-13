import type { ConversationListResponse } from "@commerce-copilot/contracts";
import { Badge } from "@commerce-copilot/ui";

type ConversationSummary = ConversationListResponse["conversations"][number];

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: readonly ConversationSummary[];
  selectedId: string | undefined;
  onSelect: (conversationId: string) => void;
}) {
  return (
    <section aria-labelledby="conversation-list-heading" className="min-w-0">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 id="conversation-list-heading" className="text-sm font-semibold">
          等待处理
        </h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{conversations.length} 个会话</p>
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {conversations.map((conversation) => {
          const selected = conversation.conversationId === selectedId;
          return (
            <li key={conversation.conversationId}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(conversation.conversationId)}
                className={`w-full px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)] ${selected ? "bg-[var(--surface-subtle)]" : "hover:bg-[var(--surface-subtle)]"}`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium">
                    {conversation.customer.displayName}
                  </span>
                  {conversation.unreadCount > 0 && <Badge status="waiting">未读</Badge>}
                </span>
                <span className="mt-2 block truncate text-sm text-[var(--text-muted)]">
                  {conversation.lastMessagePreview}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
