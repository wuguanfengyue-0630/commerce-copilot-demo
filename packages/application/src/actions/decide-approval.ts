import {
  type ApprovalActor,
  type ApprovedActionProposal,
  approveProposal,
  type Clock,
  createAuditEvent,
  createAuditEventId,
  createUserId,
  toIsoTimestamp,
} from "@commerce-copilot/domain";
import type {
  ApplicationRepositories,
  ApplicationUnitOfWork,
  ApprovalDecisionRecord,
  OperationContext,
} from "../ports/repositories.ts";

export const APPROVAL_ERROR_CODES = [
  "APPROVAL_INVALID_COMMAND",
  "APPROVAL_NOT_FOUND",
  "APPROVAL_ROLE_REQUIRED",
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
  actor: ApprovalCommandActor;
  correlationId: string;
  causationId: string;
}>;

export type DecideApprovalResult = Readonly<{
  proposal: ApprovedActionProposal;
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
          if (proposal.status !== "pending_approval") {
            throw new ApprovalError("APPROVAL_CONFLICT");
          }

          let approved: ApprovedActionProposal;
          try {
            approved = approveProposal(proposal, actor, decidedAt);
          } catch {
            throw new ApprovalError("APPROVAL_CONFLICT");
          }

          const decision = Object.freeze({
            approvalDecisionId: `approval-${proposal.proposalId}`,
            companyId: proposal.companyId,
            proposalId: proposal.proposalId,
            decision: "approved" as const,
            actor,
            correlationId: context.correlationId,
            causationId: context.causationId,
            decidedAt,
          });

          await repositories.proposals.save(context, approved);
          await repositories.approvalDecisions.save(context, decision);
          await repositories.auditEvents.append(
            context,
            createAuditEvent({
              auditEventId: createAuditEventId(`audit-${proposal.proposalId}-04-approval-approved`),
              companyId: proposal.companyId,
              correlationId: context.correlationId,
              causationId: context.causationId,
              eventType: "approval.approved",
              occurredAt: decidedAt,
            }),
          );

          return Object.freeze({ proposal: approved, decision });
        });
      } catch (error) {
        if (error instanceof ApprovalError) {
          throw error;
        }
        throw new ApprovalError("APPROVAL_PERSIST_FAILED");
      }
    },
  });
}

function assertCommand(command: DecideApprovalCommand): void {
  if (
    command === null ||
    command === undefined ||
    !isNonBlank(command.companyId) ||
    !isNonBlank(command.proposalId) ||
    !isNonBlank(command.actor?.id) ||
    !isRole(command.actor?.role) ||
    !isNonBlank(command.correlationId) ||
    !isNonBlank(command.causationId)
  ) {
    throw new ApprovalError("APPROVAL_INVALID_COMMAND");
  }
}

function domainActor(actor: ApprovalCommandActor): ApprovalActor {
  return Object.freeze({
    userId: createUserId(actor.id),
    role: actor.role === "admin" ? "admin" : "supervisor",
  });
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
