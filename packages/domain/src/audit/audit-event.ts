import type { AuditEventId, CompanyId } from "../shared/ids.ts";

export const AUDIT_EVENT_TYPES = [
  "conversation.message_ingested",
  "knowledge.retrieved",
  "agent.suggestion_generated",
  "action.proposed",
  "approval.approved",
  "approval.rejected",
  "action.execution_started",
  "action.execution_succeeded",
  "action.execution_blocked",
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export type AuditEvent = Readonly<{
  auditEventId: AuditEventId;
  companyId: CompanyId;
  correlationId: string;
  causationId: string;
  eventType: AuditEventType;
  occurredAt: Date;
}>;
