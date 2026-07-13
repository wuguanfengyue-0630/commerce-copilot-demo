"use client";

import { useQuery } from "@tanstack/react-query";
import { approvalsQueryOptions } from "../../api/queries.ts";
import { AsyncState } from "../../components/async-state.tsx";
import { ApprovalDetail } from "./approval-detail.tsx";

export function ApprovalsView() {
  const approvals = useQuery(approvalsQueryOptions());
  if (approvals.isPending) return <AsyncState state="loading" />;
  if (approvals.isError)
    return <AsyncState state="error" onRetry={() => void approvals.refetch()} />;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">审批中心</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">高影响操作必须由主管明确批准</p>
      </header>
      {approvals.data.pending.length === 0 ? (
        <AsyncState state="empty" />
      ) : (
        approvals.data.pending.map((proposal) => (
          <ApprovalDetail key={proposal.proposalId} proposal={proposal} />
        ))
      )}
    </div>
  );
}
