"use client";
import { useQuery } from "@tanstack/react-query";
import { auditEventsQueryOptions, conversationsQueryOptions } from "../../api/queries.ts";
import { AsyncState } from "../../components/async-state.tsx";
import { AuditTimeline } from "./audit-timeline.tsx";
export function AuditView() {
  const conversations = useQuery(conversationsQueryOptions());
  const id = conversations.data?.conversations[0]?.conversationId;
  const audit = useQuery(auditEventsQueryOptions(id));
  if (conversations.isPending || audit.isPending) return <AsyncState state="loading" />;
  if (conversations.isError || audit.isError)
    return (
      <AsyncState
        state="error"
        onRetry={() => {
          void conversations.refetch();
          void audit.refetch();
        }}
      />
    );
  return (
    <AuditTimeline
      events={[...audit.data.events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))}
    />
  );
}
