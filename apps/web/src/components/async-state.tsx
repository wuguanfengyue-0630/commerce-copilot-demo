import { Button, Skeleton } from "@commerce-copilot/ui";
import { AlertCircle, Inbox } from "lucide-react";

export type AsyncStateProps =
  | { state: "error"; onRetry: () => void }
  | { state: "loading" | "empty"; onRetry?: never };

export function AsyncState(props: AsyncStateProps) {
  const { state } = props;
  if (state === "loading") {
    return (
      <div role="status" aria-live="polite" aria-label="正在加载数据" className="space-y-3 py-4">
        <span className="sr-only">正在加载数据</span>
        <Skeleton decorative className="w-2/3" />
        <Skeleton decorative className="w-1/2" />
      </div>
    );
  }
  if (state === "error") {
    if (typeof props.onRetry !== "function") {
      throw new Error("AsyncState error requires onRetry");
    }
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 py-4 text-sm text-[var(--text-muted)]"
      >
        <span className="flex items-center gap-2">
          <AlertCircle aria-hidden="true" className="size-5 text-[var(--danger-text)]" />
          暂时无法加载数据，请重试。
        </span>
        <Button intent="secondary" onClick={props.onRetry}>
          重新加载
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
      <Inbox aria-hidden="true" className="size-5" />
      暂无数据
    </div>
  );
}
