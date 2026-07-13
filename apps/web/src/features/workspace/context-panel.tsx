import type { ConversationDetail } from "@commerce-copilot/contracts";
import { Badge } from "@commerce-copilot/ui";
import { PackageCheck } from "lucide-react";

const money = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "CNY",
  minimumFractionDigits: 2,
});

export function ContextPanel({ order }: { order: ConversationDetail["order"] }) {
  return (
    <aside aria-labelledby="order-context-heading" className="min-w-0 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="order-context-heading" className="flex items-center gap-2 text-sm font-semibold">
          <PackageCheck aria-hidden="true" className="size-4" />
          当前订单
        </h2>
        <Badge status="success">已送达</Badge>
      </div>
      <dl className="mt-5 grid gap-4 text-sm">
        <div>
          <dt className="text-xs text-[var(--text-muted)]">订单号</dt>
          <dd className="mt-1 break-all font-medium">{order.orderId}</dd>
        </div>
        <div className="grid grid-cols-2 gap-4 border-y border-[var(--border)] py-4">
          <div>
            <dt className="text-xs text-[var(--text-muted)]">订单金额</dt>
            <dd className="mt-1 font-semibold">{money.format(order.total.amountMinor / 100)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--text-muted)]">可退金额</dt>
            <dd className="mt-1 font-semibold">
              {money.format(order.refundable.amountMinor / 100)}
            </dd>
          </div>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">订单版本</dt>
          <dd className="mt-1">版本 {order.version}</dd>
        </div>
      </dl>
    </aside>
  );
}
