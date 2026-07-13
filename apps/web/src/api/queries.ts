import {
  approvalDecisionResponseSchema,
  approvalsResponseSchema,
  auditEventsResponseSchema,
  conversationDetailResponseSchema,
  conversationListResponseSchema,
  demoBootstrapResponseSchema,
  demoSetupCompleteResponseSchema,
  executionResponseSchema,
  knowledgeResponseSchema,
  suggestionResponseSchema,
  workspaceResponseSchema,
} from "@commerce-copilot/contracts";
import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "./client.ts";

const noContentSchema = {
  safeParse: (value: unknown) =>
    value === undefined ? { success: true as const, data: undefined } : { success: false as const },
};

export const apiQueryKeys = {
  demoBootstrap: ["demo", "bootstrap"] as const,
  workspace: ["workspace"] as const,
  approvals: ["approvals"] as const,
  conversations: ["conversations"] as const,
  conversationDetail: (conversationId: string) =>
    ["conversations", "detail", conversationId] as const,
  knowledge: ["knowledge"] as const,
  audit: (conversationId: string) => ["audit", conversationId] as const,
};

export function demoBootstrapQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.demoBootstrap,
    queryFn: ({ signal }) =>
      apiRequest("/api/v1/demo/bootstrap", demoBootstrapResponseSchema, { signal }),
  });
}

export function workspaceQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.workspace,
    queryFn: ({ signal }) => apiRequest("/api/v1/workspace", workspaceResponseSchema, { signal }),
  });
}

export function approvalsQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.approvals,
    queryFn: ({ signal }) => apiRequest("/api/v1/approvals", approvalsResponseSchema, { signal }),
  });
}

export function conversationsQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.conversations,
    queryFn: ({ signal }) =>
      apiRequest("/api/v1/conversations", conversationListResponseSchema, { signal }),
  });
}

export function getConversationDetail(conversationId: string, signal?: AbortSignal) {
  return apiRequest(
    `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
    conversationDetailResponseSchema,
    signal === undefined ? {} : { signal },
  );
}

export function conversationDetailQueryOptions(conversationId: string | undefined) {
  return queryOptions({
    queryKey: apiQueryKeys.conversationDetail(conversationId ?? "pending"),
    enabled: conversationId !== undefined,
    queryFn: ({ signal }) => {
      if (conversationId === undefined) {
        throw new Error("Conversation detail requires an id");
      }
      return getConversationDetail(conversationId, signal);
    },
  });
}

export function knowledgeQueryOptions() {
  return queryOptions({
    queryKey: apiQueryKeys.knowledge,
    queryFn: ({ signal }) => apiRequest("/api/v1/knowledge", knowledgeResponseSchema, { signal }),
  });
}

export function generateDemoSuggestion(conversationId: string) {
  return apiRequest(
    `/api/v1/conversations/${encodeURIComponent(conversationId)}/suggestions`,
    suggestionResponseSchema,
    { method: "POST" },
  );
}

export function completeDemoSetup() {
  return apiRequest("/api/v1/demo/setup/complete", demoSetupCompleteResponseSchema, {
    method: "POST",
  });
}

export function resetDemoState() {
  return apiRequest("/api/v1/demo/reset", noContentSchema, { method: "POST" });
}

export function decideDemoApproval(proposalId: string, proposalVersion: number) {
  return apiRequest(
    `/api/v1/approvals/${encodeURIComponent(proposalId)}/decisions`,
    approvalDecisionResponseSchema,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome: "approved", proposalVersion }),
    },
  );
}

export function executeDemoProposal(proposalId: string) {
  return apiRequest(
    `/api/v1/actions/${encodeURIComponent(proposalId)}/execute`,
    executionResponseSchema,
    { method: "POST" },
  );
}

export function auditEventsQueryOptions(conversationId: string | undefined) {
  return queryOptions({
    queryKey: apiQueryKeys.audit(conversationId ?? "pending"),
    enabled: conversationId !== undefined,
    queryFn: ({ signal }) => {
      if (conversationId === undefined) throw new Error("Audit events require a conversation id");
      const query = new URLSearchParams({ conversationId });
      return apiRequest(`/api/v1/audit-events?${query}`, auditEventsResponseSchema, { signal });
    },
  });
}
