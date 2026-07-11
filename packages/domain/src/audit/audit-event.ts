import type { IsoTimestamp } from "../shared/clock.ts";
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

declare const auditEventBrand: unique symbol;

export type AuditEvent = Readonly<{
  auditEventId: AuditEventId;
  companyId: CompanyId;
  correlationId: string;
  causationId: string;
  eventType: AuditEventType;
  occurredAt: IsoTimestamp;
  [auditEventBrand]: true;
}>;

export type AuditEventInput = {
  auditEventId: AuditEventId;
  companyId: CompanyId;
  correlationId: string;
  causationId: string;
  eventType: AuditEventType;
  occurredAt: IsoTimestamp;
};

export function createAuditEvent(input: AuditEventInput): AuditEvent {
  return Object.freeze({
    auditEventId: input.auditEventId,
    companyId: input.companyId,
    correlationId: input.correlationId,
    causationId: input.causationId,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
  }) as AuditEvent;
}
