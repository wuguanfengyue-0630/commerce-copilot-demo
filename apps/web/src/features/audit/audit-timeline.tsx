"use client";

import type { AuditEventsResponse } from "@commerce-copilot/contracts";
import { useState } from "react";

export function AuditTimeline({ events }: { events: AuditEventsResponse["events"] }) {
  const [filter, setFilter] = useState("");
  const visible = events.filter((event) =>
    event.eventType.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <section aria-labelledby="audit-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 id="audit-heading" className="text-xl font-semibold">
            审计日志
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            只读、按时间排序且不展示消费者原文
          </p>
        </div>
        <label className="text-sm">
          筛选事件
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="mt-1 block min-h-11 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          />
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--text-muted)]">没有匹配的审计事件</p>
      ) : (
        <ol className="mt-6 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {visible.map((event) => (
            <li
              key={event.auditEventId}
              className="grid gap-2 py-4 text-sm sm:grid-cols-[12rem_1fr]"
            >
              <time className="text-[var(--text-muted)]">
                {new Date(event.occurredAt).toLocaleString("zh-CN")}
              </time>
              <div>
                <div className="font-medium">{event.eventType}</div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">
                  追踪号 {event.correlationId.slice(0, 24)}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
