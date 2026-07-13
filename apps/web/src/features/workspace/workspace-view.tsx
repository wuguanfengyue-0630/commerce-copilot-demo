"use client";

import type { ConversationDetailResponse } from "@commerce-copilot/contracts";
import { Button, Dialog } from "@commerce-copilot/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { List, MessageSquareText, PanelRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  apiQueryKeys,
  conversationDetailQueryOptions,
  conversationsQueryOptions,
  generateDemoSuggestion,
  workspaceQueryOptions,
} from "../../api/queries.ts";
import { AsyncState } from "../../components/async-state.tsx";
import { ContextPanel } from "./context-panel.tsx";
import { ConversationList } from "./conversation-list.tsx";
import { MessageThread } from "./message-thread.tsx";

type MobileView = "list" | "thread" | "context";

export function WorkspaceView() {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [generationState, setGenerationState] = useState<
    "idle" | "pending" | "error" | "needs-human"
  >("idle");
  const workspace = useQuery(workspaceQueryOptions());
  const conversations = useQuery(conversationsQueryOptions());
  const effectiveId = selectedId ?? conversations.data?.conversations[0]?.conversationId;
  const detail = useQuery(conversationDetailQueryOptions(effectiveId));

  useEffect(() => {
    if (selectedId === undefined && effectiveId !== undefined) setSelectedId(effectiveId);
  }, [effectiveId, selectedId]);

  const generation = useMutation({
    mutationFn: async (conversationId: string) => {
      setGenerationState("pending");
      return generateDemoSuggestion(conversationId);
    },
    onSuccess: (result, conversationId) => {
      const key = apiQueryKeys.conversationDetail(conversationId);
      queryClient.setQueryData<ConversationDetailResponse>(key, (current) =>
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
      setGenerationState(result.suggestion.disposition === "needs_human" ? "needs-human" : "idle");
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.approvals, refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: apiQueryKeys.workspace, refetchType: "none" });
    },
    onError: () => setGenerationState("error"),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  function generate() {
    if (effectiveId === undefined || inFlight.current || generation.isPending) return;
    inFlight.current = true;
    generation.mutate(effectiveId);
  }

  if (workspace.isPending || conversations.isPending || detail.isPending)
    return <AsyncState state="loading" />;
  if (workspace.isError || conversations.isError || detail.isError) {
    return (
      <AsyncState
        state="error"
        onRetry={() => {
          void workspace.refetch();
          void conversations.refetch();
          void detail.refetch();
        }}
      />
    );
  }
  if (conversations.data.conversations.length === 0 || detail.data === undefined)
    return <AsyncState state="empty" />;

  const thread = (
    <MessageThread
      conversation={detail.data.conversation}
      assisted={workspace.data.workspace.messageSendMode === "assisted"}
      generationState={generationState}
      onGenerate={generate}
    />
  );
  const context = <ContextPanel order={detail.data.conversation.order} />;

  return (
    <div className="min-w-0 space-y-3">
      <nav aria-label="移动工作台视图" className="grid grid-cols-3 gap-2 md:hidden">
        <Button
          intent={mobileView === "list" ? "primary" : "secondary"}
          onClick={() => setMobileView("list")}
        >
          <List aria-hidden="true" className="size-4" />
          会话
        </Button>
        <Button
          intent={mobileView === "thread" ? "primary" : "secondary"}
          onClick={() => setMobileView("thread")}
        >
          <MessageSquareText aria-hidden="true" className="size-4" />
          对话
        </Button>
        <Button
          intent={mobileView === "context" ? "primary" : "secondary"}
          onClick={() => setMobileView("context")}
        >
          <PanelRight aria-hidden="true" className="size-4" />
          订单
        </Button>
      </nav>

      <div className="hidden min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] md:grid md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(480px,1fr)_360px]">
        <div className="border-r border-[var(--border)]">
          <ConversationList
            conversations={conversations.data.conversations}
            selectedId={effectiveId}
            onSelect={(id) => {
              setSelectedId(id);
              setGenerationState("idle");
            }}
          />
        </div>
        <div className="min-w-0">{thread}</div>
        <div className="hidden border-l border-[var(--border)] xl:block">{context}</div>
      </div>

      <div className="hidden justify-end md:flex xl:hidden">
        <Dialog
          trigger={
            <Button intent="secondary">
              <PanelRight aria-hidden="true" className="size-4" />
              查看订单上下文
            </Button>
          }
          title="订单上下文"
          description="当前会话绑定的订单事实。"
          contentClassName="right-0 left-auto top-0 h-dvh max-h-dvh w-[min(360px,calc(100vw-1rem))] translate-x-0 translate-y-0 rounded-none"
        >
          {context}
        </Dialog>
      </div>

      <div className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] md:hidden">
        {mobileView === "list" && (
          <ConversationList
            conversations={conversations.data.conversations}
            selectedId={effectiveId}
            onSelect={(id) => {
              setSelectedId(id);
              setGenerationState("idle");
              setMobileView("thread");
            }}
          />
        )}
        {mobileView === "thread" && thread}
        {mobileView === "context" && context}
      </div>
    </div>
  );
}
