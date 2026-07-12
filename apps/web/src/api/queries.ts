import {
  approvalsResponseSchema,
  demoBootstrapResponseSchema,
  demoSetupCompleteResponseSchema,
  workspaceResponseSchema,
} from "@commerce-copilot/contracts";
import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "./client.ts";

export const apiQueryKeys = {
  demoBootstrap: ["demo", "bootstrap"] as const,
  workspace: ["workspace"] as const,
  approvals: ["approvals"] as const,
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

export function completeDemoSetup() {
  return apiRequest("/api/v1/demo/setup/complete", demoSetupCompleteResponseSchema, {
    method: "POST",
  });
}
