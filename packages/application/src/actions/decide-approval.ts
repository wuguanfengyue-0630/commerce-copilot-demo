import {
  type ApprovalActor,
  type ApprovedActionProposal,
  approveProposal,
  type Clock,
  createAuditEvent,
  createAuditEventId,
  createUserId,
  type RejectedActionProposal,
  rejectProposal,
  toIsoTimestamp,
} from "@commerce-copilot/domain";
import type {
  ApplicationRepositories,
  ApplicationUnitOfWork,
  ApprovalDecisionRecord,
  OperationContext,
} from "../ports/repositories.ts";
import { RepositoryConflictError } from "../ports/repositories.ts";

export const APPROVAL_ERROR_CODES = [
  "APPROVAL_INVALID_COMMAND",
  "APPROVAL_NOT_FOUND",
  "APPROVAL_ROLE_REQUIRED",
  "APPROVAL_EXPIRED",
  "APPROVAL_CONFLICT",
  "APPROVAL_PERSIST_FAILED",
] as const;

export type ApprovalErrorCode = (typeof APPROVAL_ERROR_CODES)[number];

export class ApprovalError extends Error {
  readonly code: ApprovalErrorCode;

  constructor(code: ApprovalErrorCode) {
    super(code);
    this.name = "ApprovalError";
    this.code = code;
  }
}

export type ApprovalCommandActor = Readonly<{
  id: string;
  role: "agent" | "supervisor" | "admin";
}>;

export type DecideApprovalCommand = Readonly<{
  companyId: OperationContext["companyId"];
  proposalId: ApprovalDecisionRecord["proposalId"];
  proposalVersion: number;
  outcome: "approved" | "rejected";
  comment?: string;
  actor: ApprovalCommandActor;
  correlationId: string;
  causationId: string;
}>;

export type DecideApprovalResult = Readonly<{
  proposal: ApprovedActionProposal | RejectedActionProposal;
  decision: ApprovalDecisionRecord;
}>;

export type CreateDecideApprovalDependencies = Readonly<{
  repositories: ApplicationRepositories;
  unitOfWork: ApplicationUnitOfWork;
  clock: Clock;
}>;

export interface DecideApprovalUseCase {
  execute(command: DecideApprovalCommand): Promise<DecideApprovalResult>;
}

export function createDecideApprovalUseCase(
  dependencies: CreateDecideApprovalDependencies,
): DecideApprovalUseCase {
  return Object.freeze({
    async execute(command: DecideApprovalCommand): Promise<DecideApprovalResult> {
      assertCommand(command);
      if (command.actor.role !== "supervisor" && command.actor.role !== "admin") {
        throw new ApprovalError("APPROVAL_ROLE_REQUIRED");
      }

      const context = operationContext(command);
      const decidedAt = toIsoTimestamp(dependencies.clock.now());
      const actor = domainActor(command.actor);

      try {
        return await dependencies.unitOfWork.run(context, async (repositories) => {
          const proposal = await repositories.proposals.get(context, command.proposalId);
          if (proposal === null) {
            throw new ApprovalError("APPROVAL_NOT_FOUND");
          }
          if (
            proposal.status !== "pending_approval" ||
            proposal.version !== command.proposalVersion
          ) {
            throw new ApprovalError("APPROVAL_CONFLICT");
          }
          if (decidedAt >= proposal.expiresAt) {
            throw new ApprovalError("APPROVAL_EXPIRED");
          }

          const next =
            command.outcome === "approved"
              ? approveProposal(proposal, actor, decidedAt)
              : rejectProposal(proposal, actor, decidedAt);
          const decision = approvalDecision(command, proposal, actor, decidedAt);

          await repositories.proposals.replace(context, next, proposal.version);
          await repositories.approvalDecisions.save(context, decision);
          await repositories.auditEvents.append(
            context,
            createAuditEvent({
              auditEventId: createAuditEventId(
                `audit-${proposal.proposalId}-04-approval-${command.outcome}`,
              ),
              companyId: proposal.companyId,
              correlationId: context.correlationId,
              causationId: context.causationId,
              eventType: command.outcome === "approved" ? "approval.approved" : "approval.rejected",
              occurredAt: decidedAt,
            }),
          );

          return Object.freeze({ proposal: next, decision });
        });
      } catch (error) {
        if (error instanceof ApprovalError) {
          throw error;
        }
        if (error instanceof RepositoryConflictError) {
          throw new ApprovalError("APPROVAL_CONFLICT");
        }
        throw new ApprovalError("APPROVAL_PERSIST_FAILED");
      }
    },
  });
}

function approvalDecision(
  command: DecideApprovalCommand,
  proposal: ApprovedActionProposal | RejectedActionProposal | Parameters<typeof approveProposal>[0],
  actor: ApprovalActor,
  decidedAt: ApprovalDecisionRecord["decidedAt"],
): ApprovalDecisionRecord {
  const base = {
    approvalDecisionId: `approval-${proposal.proposalId}`,
    companyId: proposal.companyId,
    proposalId: proposal.proposalId,
    proposalVersion: command.proposalVersion,
    decision: command.outcome,
    actor,
    correlationId: command.correlationId,
    causationId: command.causationId,
    decidedAt,
  };
  return command.comment === undefined
    ? Object.freeze(base)
    : Object.freeze({ ...base, comment: command.comment.trim() });
}

function assertCommand(command: DecideApprovalCommand): void {
  if (
    command === null ||
    command === undefined ||
    !isNonBlank(command.companyId) ||
    !isNonBlank(command.proposalId) ||
    !Number.isSafeInteger(command.proposalVersion) ||
    command.proposalVersion < 1 ||
    (command.outcome !== "approved" && command.outcome !== "rejected") ||
    !isNonBlank(command.actor?.id) ||
    !isRole(command.actor?.role) ||
    !isNonBlank(command.correlationId) ||
    !isNonBlank(command.causationId) ||
    (command.comment !== undefined && !isNonBlank(command.comment))
  ) {
    throw new ApprovalError("APPROVAL_INVALID_COMMAND");
  }
}

function domainActor(actor: ApprovalCommandActor): ApprovalActor {
  if (actor.role !== "supervisor" && actor.role !== "admin") {
    throw new ApprovalError("APPROVAL_ROLE_REQUIRED");
  }
  return Object.freeze({ userId: createUserId(actor.id), role: actor.role });
}

function operationContext(command: DecideApprovalCommand): OperationContext {
  return Object.freeze({
    companyId: command.companyId,
    correlationId: command.correlationId,
    causationId: command.causationId,
  });
}

function isRole(role: ApprovalCommandActor["role"]): boolean {
  return role === "agent" || role === "supervisor" || role === "admin";
}

function isNonBlank(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
