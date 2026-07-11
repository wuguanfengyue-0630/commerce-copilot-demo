import {
  type ActionPolicyInput,
  type ActionPolicyRole,
  type Clock,
  createActionProposal,
  createAuditEvent,
  createAuditEventId,
  createProposalId,
  createSuggestionId,
  type DemoRefundRule,
  type OrderSnapshot,
  type PendingActionProposal,
  type PolicyEvaluation,
  toIsoTimestamp,
} from "@commerce-copilot/domain";
import type { CommerceConnector } from "../ports/commerce-connector.ts";
import type {
  ApplicationRepositories,
  ApplicationUnitOfWork,
  OperationContext,
  SuggestionRecord,
} from "../ports/repositories.ts";
import type {
  PublishedKnowledgeEvidence,
  SuggestionGenerationResult,
  SuggestionGenerator,
} from "../ports/suggestion-generator.ts";
import { snapshotGroundedGenerationResult } from "./grounded-suggestion-result.ts";

const PROPOSAL_LIFETIME_MS = 30 * 60 * 1_000;

export const GENERATE_SUGGESTION_ERROR_CODES = [
  "GENERATE_SUGGESTION_CONNECTOR_FAILED",
  "GENERATE_SUGGESTION_CONVERSATION_NOT_FOUND",
  "GENERATE_SUGGESTION_DUPLICATE_COMMAND",
  "GENERATE_SUGGESTION_GENERATOR_FAILED",
  "GENERATE_SUGGESTION_INVALID_COMMAND",
  "GENERATE_SUGGESTION_KNOWLEDGE_FAILED",
  "GENERATE_SUGGESTION_ORDER_SCOPE_MISMATCH",
  "GENERATE_SUGGESTION_PERSIST_FAILED",
  "GENERATE_SUGGESTION_POLICY_DENIED",
  "GENERATE_SUGGESTION_SCOPE_MISMATCH",
] as const;

export type GenerateSuggestionErrorCode = (typeof GENERATE_SUGGESTION_ERROR_CODES)[number];

export class GenerateSuggestionError extends Error {
  readonly code: GenerateSuggestionErrorCode;

  constructor(code: GenerateSuggestionErrorCode) {
    super(code);
    this.name = "GenerateSuggestionError";
    this.code = code;
  }
}

export type GenerateSuggestionCommand = Readonly<{
  companyId: OperationContext["companyId"];
  storeId: SuggestionRecord["storeId"];
  conversationId: SuggestionRecord["conversationId"];
  orderId: SuggestionRecord["orderId"];
  correlationId: string;
  causationId: string;
  actorRole: ActionPolicyRole;
}>;

export type GenerateSuggestionResult = Readonly<{
  companyId: GenerateSuggestionCommand["companyId"];
  storeId: GenerateSuggestionCommand["storeId"];
  conversationId: GenerateSuggestionCommand["conversationId"];
  orderId: GenerateSuggestionCommand["orderId"];
  correlationId: string;
  causationId: string;
  suggestion: SuggestionRecord;
  proposal?: PendingActionProposal;
}>;

export type PolicyEvaluator = (input: ActionPolicyInput) => PolicyEvaluation;

export type CreateGenerateSuggestionDependencies = Readonly<{
  repositories: ApplicationRepositories;
  unitOfWork: ApplicationUnitOfWork;
  commerceConnector: CommerceConnector;
  suggestionGenerator: SuggestionGenerator;
  clock: Clock;
  policyRules: readonly DemoRefundRule[];
  policyEvaluator: PolicyEvaluator;
}>;

export interface GenerateSuggestionUseCase {
  execute(command: GenerateSuggestionCommand): Promise<GenerateSuggestionResult>;
}

export function createGenerateSuggestionUseCase(
  dependencies: CreateGenerateSuggestionDependencies,
): GenerateSuggestionUseCase {
  return Object.freeze({
    async execute(command: GenerateSuggestionCommand): Promise<GenerateSuggestionResult> {
      assertCommand(command);
      const operationContext = createOperationContext(command);
      const conversation = await loadConversation(dependencies, operationContext, command);
      assertConversationScope(command, conversation);
      await rejectDuplicate(dependencies, operationContext, command);

      const order = await fetchLiveOrder(dependencies, command);
      assertOrderScope(command, order);

      const evaluatedAt = toIsoTimestamp(dependencies.clock.now());
      const publishedKnowledge = await searchPublishedKnowledge(
        dependencies,
        operationContext,
        command,
        evaluatedAt,
      );
      const generationResult = await generateSuggestion(dependencies, {
        companyId: command.companyId,
        storeId: command.storeId,
        conversation,
        order,
        publishedKnowledge,
        evaluatedAt,
      });
      const trustedResult = snapshotGenerationResult(generationResult, order, publishedKnowledge);
      const proposal = evaluateAndIssueProposal(dependencies, command, trustedResult, evaluatedAt);
      const suggestion = createSuggestionRecord(command, trustedResult, evaluatedAt);

      return persistWorkflow(
        dependencies,
        operationContext,
        suggestion,
        proposal,
        publishedKnowledge.length > 0,
        evaluatedAt,
      );
    },
  });
}

async function loadConversation(
  dependencies: CreateGenerateSuggestionDependencies,
  context: OperationContext,
  command: GenerateSuggestionCommand,
) {
  let conversation: Awaited<ReturnType<ApplicationRepositories["conversations"]["get"]>>;
  try {
    conversation = await dependencies.repositories.conversations.get(
      context,
      command.conversationId,
    );
  } catch {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_CONVERSATION_NOT_FOUND");
  }
  if (conversation === null) {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_CONVERSATION_NOT_FOUND");
  }
  return conversation;
}

async function rejectDuplicate(
  dependencies: CreateGenerateSuggestionDependencies,
  context: OperationContext,
  command: GenerateSuggestionCommand,
): Promise<void> {
  let existing: SuggestionRecord | null;
  try {
    existing = await dependencies.repositories.suggestions.findByCorrelation(
      context,
      command.conversationId,
      command.correlationId,
    );
  } catch {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_PERSIST_FAILED");
  }
  if (existing !== null) {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_DUPLICATE_COMMAND");
  }
}

async function fetchLiveOrder(
  dependencies: CreateGenerateSuggestionDependencies,
  command: GenerateSuggestionCommand,
): Promise<OrderSnapshot> {
  try {
    return await dependencies.commerceConnector.getOrder({
      storeId: command.storeId,
      orderId: command.orderId,
    });
  } catch {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_CONNECTOR_FAILED");
  }
}

async function searchPublishedKnowledge(
  dependencies: CreateGenerateSuggestionDependencies,
  context: OperationContext,
  command: GenerateSuggestionCommand,
  evaluatedAt: SuggestionRecord["createdAt"],
): Promise<readonly PublishedKnowledgeEvidence[]> {
  let searchResults: readonly PublishedKnowledgeEvidence[];
  try {
    searchResults = await dependencies.repositories.publishedKnowledge.search({
      ...context,
      storeId: command.storeId,
      conversationId: command.conversationId,
      query: "damaged_item",
      evaluatedAt,
    });
  } catch {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_KNOWLEDGE_FAILED");
  }

  if (!Array.isArray(searchResults)) {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_KNOWLEDGE_FAILED");
  }
  return Object.freeze(
    searchResults.filter(
      (evidence) =>
        evidence !== null &&
        evidence !== undefined &&
        evidence.companyId === command.companyId &&
        evidence.status === "published" &&
        evidence.publishedAt <= evaluatedAt &&
        (evidence.expiresAt === undefined || evidence.expiresAt > evaluatedAt),
    ),
  );
}

async function generateSuggestion(
  dependencies: CreateGenerateSuggestionDependencies,
  context: Parameters<SuggestionGenerator["generate"]>[0],
): Promise<SuggestionGenerationResult> {
  try {
    return await dependencies.suggestionGenerator.generate(Object.freeze(context));
  } catch {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_GENERATOR_FAILED");
  }
}

function snapshotGenerationResult(
  result: SuggestionGenerationResult,
  order: OrderSnapshot,
  evidence: readonly PublishedKnowledgeEvidence[],
): SuggestionGenerationResult {
  try {
    return snapshotGroundedGenerationResult(result, order, evidence);
  } catch {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_GENERATOR_FAILED");
  }
}

function evaluateAndIssueProposal(
  dependencies: CreateGenerateSuggestionDependencies,
  command: GenerateSuggestionCommand,
  result: SuggestionGenerationResult,
  createdAt: SuggestionRecord["createdAt"],
): PendingActionProposal | undefined {
  if (result.disposition === "needs_human") {
    return undefined;
  }
  const actionDraft = result.actionDraft;
  if (actionDraft === undefined) {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_GENERATOR_FAILED");
  }

  let evaluation: PolicyEvaluation;
  try {
    evaluation = dependencies.policyEvaluator({
      actionKind: actionDraft.kind,
      actorRole: command.actorRole,
      rules: dependencies.policyRules,
    });
  } catch {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_POLICY_DENIED");
  }
  if (
    !evaluation.allowed ||
    !evaluation.requiresApproval ||
    evaluation.requiredRole !== "supervisor"
  ) {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_POLICY_DENIED");
  }

  try {
    return createActionProposal({
      proposalId: createProposalId(`proposal-${command.correlationId}`),
      companyId: command.companyId,
      storeId: command.storeId,
      conversationId: command.conversationId,
      payload: actionDraft,
      createdAt,
      expiresAt: toIsoTimestamp(new Date(Date.parse(createdAt) + PROPOSAL_LIFETIME_MS)),
    });
  } catch {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_GENERATOR_FAILED");
  }
}

function createSuggestionRecord(
  command: GenerateSuggestionCommand,
  result: SuggestionGenerationResult,
  createdAt: SuggestionRecord["createdAt"],
): SuggestionRecord {
  const base = {
    suggestionId: createSuggestionId(`suggestion-${command.correlationId}`),
    companyId: command.companyId,
    storeId: command.storeId,
    conversationId: command.conversationId,
    orderId: command.orderId,
    correlationId: command.correlationId,
    causationId: command.causationId,
    provider: result.provider,
    disposition: result.disposition,
    suggestedReply: result.suggestedReply,
    citations: result.citations,
    createdAt,
  };
  const withReason = result.reason === undefined ? base : { ...base, reason: result.reason };
  return result.actionDraft === undefined
    ? Object.freeze(withReason)
    : Object.freeze({ ...withReason, actionDraft: result.actionDraft });
}

async function persistWorkflow(
  dependencies: CreateGenerateSuggestionDependencies,
  context: OperationContext,
  suggestion: SuggestionRecord,
  proposal: PendingActionProposal | undefined,
  retrievedKnowledge: boolean,
  occurredAt: SuggestionRecord["createdAt"],
): Promise<GenerateSuggestionResult> {
  try {
    return await dependencies.unitOfWork.run(context, async (repositories) => {
      await repositories.suggestions.save(context, suggestion);
      if (proposal !== undefined) {
        await repositories.proposals.save(context, proposal);
      }

      if (retrievedKnowledge) {
        await repositories.auditEvents.append(
          context,
          createWorkflowAudit(context, occurredAt, "01-knowledge-retrieved", "knowledge.retrieved"),
        );
      }
      await repositories.auditEvents.append(
        context,
        createWorkflowAudit(
          context,
          occurredAt,
          "02-suggestion-generated",
          "agent.suggestion_generated",
        ),
      );
      if (proposal !== undefined) {
        await repositories.auditEvents.append(
          context,
          createWorkflowAudit(context, occurredAt, "03-action-proposed", "action.proposed"),
        );
      }

      const persistedSuggestion = await repositories.suggestions.get(
        context,
        suggestion.suggestionId,
      );
      if (persistedSuggestion === null) {
        throw new Error("suggestion was not persisted");
      }
      const resultIdentity = {
        companyId: persistedSuggestion.companyId,
        storeId: persistedSuggestion.storeId,
        conversationId: persistedSuggestion.conversationId,
        orderId: persistedSuggestion.orderId,
        correlationId: persistedSuggestion.correlationId,
        causationId: persistedSuggestion.causationId,
      };
      return proposal === undefined
        ? Object.freeze({ ...resultIdentity, suggestion: persistedSuggestion })
        : Object.freeze({ ...resultIdentity, suggestion: persistedSuggestion, proposal });
    });
  } catch {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_PERSIST_FAILED");
  }
}

function createWorkflowAudit(
  context: OperationContext,
  occurredAt: SuggestionRecord["createdAt"],
  suffix: string,
  eventType: Parameters<typeof createAuditEvent>[0]["eventType"],
) {
  return createAuditEvent({
    auditEventId: createAuditEventId(`audit-${context.correlationId}-${suffix}`),
    companyId: context.companyId,
    correlationId: context.correlationId,
    causationId: context.causationId,
    eventType,
    occurredAt,
  });
}

function assertConversationScope(
  command: GenerateSuggestionCommand,
  conversation: Awaited<ReturnType<ApplicationRepositories["conversations"]["get"]>>,
): void {
  if (
    conversation === null ||
    conversation.companyId !== command.companyId ||
    conversation.storeId !== command.storeId ||
    conversation.conversationId !== command.conversationId
  ) {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_SCOPE_MISMATCH");
  }
}

function assertOrderScope(command: GenerateSuggestionCommand, order: OrderSnapshot): void {
  if (
    order === null ||
    order === undefined ||
    order.companyId !== command.companyId ||
    order.storeId !== command.storeId ||
    order.orderId !== command.orderId
  ) {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_ORDER_SCOPE_MISMATCH");
  }
}

function createOperationContext(command: GenerateSuggestionCommand): OperationContext {
  return Object.freeze({
    companyId: command.companyId,
    correlationId: command.correlationId,
    causationId: command.causationId,
  });
}

function assertCommand(command: GenerateSuggestionCommand): void {
  if (
    command === null ||
    command === undefined ||
    !isNonBlank(command.companyId) ||
    !isNonBlank(command.storeId) ||
    !isNonBlank(command.conversationId) ||
    !isNonBlank(command.orderId) ||
    !isNonBlank(command.correlationId) ||
    !isNonBlank(command.causationId) ||
    !isPolicyRole(command.actorRole)
  ) {
    throw new GenerateSuggestionError("GENERATE_SUGGESTION_INVALID_COMMAND");
  }
}

function isPolicyRole(role: ActionPolicyRole): boolean {
  return role === "agent" || role === "supervisor" || role === "admin";
}

function isNonBlank(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
