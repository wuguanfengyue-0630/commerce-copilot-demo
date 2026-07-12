import {
  BookOpen,
  Bot,
  ClipboardCheck,
  FileClock,
  Gauge,
  MessagesSquare,
  Network,
  Plug,
  Scale,
} from "lucide-react";

export const navigationItems = [
  { label: "总览", href: "/", icon: Gauge },
  { label: "统一会话", href: "/conversations", icon: MessagesSquare },
  { label: "审批中心", href: "/approvals", icon: ClipboardCheck },
  { label: "知识库", href: "/knowledge", icon: BookOpen },
  { label: "平台接入", href: "/integrations", icon: Plug },
  { label: "规则中心", href: "/rules", icon: Scale },
  { label: "模型配置", href: "/models", icon: Bot },
  { label: "评测中心", href: "/evaluations", icon: Network },
  { label: "审计日志", href: "/audit", icon: FileClock },
] as const;

export function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="主导航" className="flex flex-col gap-1">
      {navigationItems.map(({ label, href, icon: Icon }) => (
        <a
          key={label}
          href={href}
          onClick={onNavigate}
          className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          <Icon aria-hidden="true" className="size-5 shrink-0" />
          <span className="min-w-0 truncate">{label}</span>
        </a>
      ))}
    </nav>
  );
}
