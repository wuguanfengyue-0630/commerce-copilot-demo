import { Badge } from "@commerce-copilot/ui";
import { FlaskConical } from "lucide-react";

export function DemoBanner() {
  return (
    <div className="flex min-h-12 items-center gap-3 border-b border-[var(--warning-border)] bg-[var(--warning-soft)] px-4 py-2 text-sm text-[var(--warning-text)] sm:px-6">
      <FlaskConical aria-hidden="true" className="size-5 shrink-0" />
      <Badge status="waiting">模拟环境</Badge>
      <span className="min-w-0">当前数据与操作仅用于演示，不会触达真实平台。</span>
    </div>
  );
}
