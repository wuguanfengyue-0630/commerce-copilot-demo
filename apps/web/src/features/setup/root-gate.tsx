"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { demoBootstrapQueryOptions } from "../../api/queries.ts";
import { AsyncState } from "../../components/async-state.tsx";

export function setupDestination(acceptedAt: string | null) {
  return acceptedAt === null ? "/setup" : "/overview";
}

export function RootGate() {
  const router = useRouter();
  const bootstrap = useQuery(demoBootstrapQueryOptions());

  useEffect(() => {
    if (bootstrap.data) {
      router.replace(setupDestination(bootstrap.data.setup.acceptedAt));
    }
  }, [bootstrap.data, router]);

  if (bootstrap.isError) {
    return <AsyncState state="error" onRetry={() => void bootstrap.refetch()} />;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-dvh items-center justify-center gap-2 bg-[var(--canvas)] px-4 text-sm text-[var(--text-muted)]"
    >
      <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
      正在检查演示环境
    </div>
  );
}
