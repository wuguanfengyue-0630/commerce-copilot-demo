"use client";

import type { CapabilityStatus, PlatformCapability } from "@commerce-copilot/contracts";
import { Badge, type BadgeStatus } from "@commerce-copilot/ui";
import { useQuery } from "@tanstack/react-query";
import { PlugZap } from "lucide-react";

import { workspaceQueryOptions } from "../../api/queries.ts";
import { AsyncState } from "../../components/async-state.tsx";

const capabilityLabels: Record<PlatformCapability, string> = {
  "store.authorize": "店铺授权",
  "store.token.refresh": "刷新授权令牌",
  "catalog.product.read": "读取商品",
  "order.read": "读取订单",
  "logistics.read": "读取物流",
  "afterSale.read": "读取售后",
  "afterSale.write": "提交售后操作",
  "message.receive": "接收飞鸽消息",
  "message.send": "发送飞鸽消息",
  "event.subscribe": "订阅事件",
  "event.verify": "验证事件",
};

function capabilityDisplay(capability: PlatformCapability, status: CapabilityStatus) {
  if (capability === "message.receive") {
    return { label: "等待官方资质", badge: "waiting" as const };
  }
  if (capability === "message.send") {
    return { label: "人工辅助发送", badge: "needs-human" as const };
  }
  const labels: Record<CapabilityStatus, { label: string; badge: BadgeStatus }> = {
    available: { label: "可用", badge: "success" },
    unavailable: { label: "不可用", badge: "neutral" },
    waiting_qualification: { label: "等待官方资质", badge: "waiting" },
    degraded: { label: "服务降级", badge: "failed" },
  };
  return labels[status];
}

export function IntegrationsView() {
  const workspace = useQuery(workspaceQueryOptions());

  if (workspace.isPending) {
    return <AsyncState state="loading" />;
  }
  if (workspace.isError) {
    return <AsyncState state="error" onRetry={() => void workspace.refetch()} />;
  }

  const integrations = workspace.data.workspace.integrations;
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <PlugZap aria-hidden="true" className="size-5" />
            平台接入
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">按接口能力核对当前可执行范围</p>
        </div>
        <Badge status="neutral">未接入 / 模拟</Badge>
      </header>

      {integrations.length === 0 ? (
        <div className="border-y border-[var(--border)] py-8 text-sm text-[var(--text-muted)]">
          当前没有模拟平台配置
        </div>
      ) : (
        integrations.map((integration) => (
          <section key={integration.storeId} aria-labelledby={`integration-${integration.storeId}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id={`integration-${integration.storeId}`} className="text-sm font-semibold">
                {integration.displayName}
              </h2>
              <span className="text-xs text-[var(--text-muted)]">发送模式：人工辅助</span>
            </div>
            <div
              data-testid="capability-table-scroll"
              className="max-w-full overflow-x-auto border-y border-[var(--border)]"
            >
              <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
                <thead className="bg-[var(--surface-subtle)] text-xs text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-3 font-medium" scope="col">
                      能力
                    </th>
                    <th className="px-3 py-3 font-medium" scope="col">
                      接口标识
                    </th>
                    <th className="px-3 py-3 font-medium" scope="col">
                      当前状态
                    </th>
                    <th className="px-3 py-3 font-medium" scope="col">
                      说明
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {integration.capabilities.map(({ capability, status, reason }) => {
                    const display = capabilityDisplay(capability, status);
                    return (
                      <tr key={capability}>
                        <th className="whitespace-nowrap px-3 py-3 font-medium" scope="row">
                          {capabilityLabels[capability]}
                        </th>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-[var(--text-muted)]">
                          {capability}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <Badge status={display.badge}>{display.label}</Badge>
                        </td>
                        <td className="min-w-64 px-3 py-3 text-[var(--text-muted)]">
                          {reason ?? "模拟接口已准备"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
