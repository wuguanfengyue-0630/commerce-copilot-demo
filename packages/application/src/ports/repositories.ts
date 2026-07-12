import type {
  ActionProposal,
  ApprovalActor,
  AuditEvent,
  CompanyId,
  Conversation,
  ConversationId,
  IsoTimestamp,
  KnowledgeCitation,
  OrderId,
  ProposalId,
  StoreId,
  SuggestionId,
} from "@commerce-copilot/domain";
import type {
  PublishedKnowledgeEvidence,
  SuggestionDisposition,
  SuggestionGenerationResult,
} from "./suggestion-generator.ts";

export type OperationContext = Readonly<{
  companyId: CompanyId;
  correlationId: string;
  causationId: string;
}>;

export class RepositoryConflictError extends Error {
  readonly code = "REPOSITORY_CONFLICT";

  constructor() {
    super("REPOSITORY_CONFLICT");
    this.name = "RepositoryConflictError";
  }
}

export type PublishedKnowledgeSearch = Readonly<
  OperationContext & {
    storeId: StoreId;
    conversationId: ConversationId;
    query: string;
    evaluatedAt: IsoTimestamp;
  }
>;

export type SuggestionRecord = Readonly<{
  suggestionId: SuggestionId;
  companyId: CompanyId;
  storeId: StoreId;
  conversationId: ConversationId;
  orderId: OrderId;
  correlationId: string;
  causationId: string;
  provider: SuggestionGenerationResult["provider"];
  disposition: SuggestionDisposition;
  suggestedReply: string;
  citations: readonly KnowledgeCitation[];
  actionDraft?: SuggestionGenerationResult["actionDraft"];
  reason?: string;
  createdAt: IsoTimestamp;
}>;

export type ApprovalDecisionRecord = Readonly<{
  approvalDecisionId: string;
  companyId: CompanyId;
  proposalId: ProposalId;
  proposalVersion: number;
  decision: "approved" | "rejected";
  actor: ApprovalActor;
  comment?: string;
  correlationId: string;
  causationId: string;
  decidedAt: IsoTimestamp;
}>;

export type ExecutionAttemptRecord = Readonly<{
  executionAttemptId: string;
  companyId: CompanyId;
  proposalId: ProposalId;
  idempotencyKey: string;
  status: "started" | "blocked" | "failed" | "succeeded";
  correlationId: string;
  causationId: string;
  attemptedAt: IsoTimestamp;
  reason?: string;
}>;

export type ExecutionResultRecord = Readonly<{
  executionId: string;
  companyId: CompanyId;
  proposalId: ProposalId;
  idempotencyKey: string;
  status: "succeeded";
  externalReference: string;
  startedAt: IsoTimestamp;
  correlationId: string;
  causationId: string;
  completedAt: IsoTimestamp;
}>;

export interface ConversationRepository {
  get(context: OperationContext, conversationId: ConversationId): Promise<Conversation | null>;
}

export interface PublishedKnowledgeRepository {
  search(query: PublishedKnowledgeSearch): Promise<readonly PublishedKnowledgeEvidence[]>;
}

export interface SuggestionRepository {
  save(context: OperationContext, record: SuggestionRecord): Promise<void>;
  get(context: OperationContext, suggestionId: SuggestionId): Promise<SuggestionRecord | null>;
  findByCorrelation(
    context: OperationContext,
    conversationId: ConversationId,
    correlationId: string,
  ): Promise<SuggestionRecord | null>;
  listByConversation(
    context: OperationContext,
    conversationId: ConversationId,
  ): Promise<readonly SuggestionRecord[]>;
}

export interface ProposalRepository {
  save(context: OperationContext, proposal: ActionProposal): Promise<void>;
  replace(context: OperationContext, next: ActionProposal, expectedVersion: number): Promise<void>;
  get(context: OperationContext, proposalId: ProposalId): Promise<ActionProposal | null>;
  listByConversation(
    context: OperationContext,
    conversationId: ConversationId,
  ): Promise<readonly ActionProposal[]>;
}

export interface ApprovalDecisionRepository {
  save(context: OperationContext, decision: ApprovalDecisionRecord): Promise<void>;
  get(
    context: OperationContext,
    approvalDecisionId: string,
  ): Promise<ApprovalDecisionRecord | null>;
  listByProposal(
    context: OperationContext,
    proposalId: ProposalId,
  ): Promise<readonly ApprovalDecisionRecord[]>;
}

export interface ExecutionAttemptRepository {
  save(context: OperationContext, attempt: ExecutionAttemptRecord): Promise<void>;
  get(
    context: OperationContext,
    executionAttemptId: string,
  ): Promise<ExecutionAttemptRecord | null>;
  listByProposal(
    context: OperationContext,
    proposalId: ProposalId,
  ): Promise<readonly ExecutionAttemptRecord[]>;
}

export interface ExecutionResultRepository {
  save(context: OperationContext, result: ExecutionResultRecord): Promise<void>;
  findByIdempotencyKey(
    context: OperationContext,
    idempotencyKey: string,
  ): Promise<ExecutionResultRecord | null>;
  listByProposal(
    context: OperationContext,
    proposalId: ProposalId,
  ): Promise<readonly ExecutionResultRecord[]>;
}

export interface AuditEventRepository {
  append(context: OperationContext, event: AuditEvent): Promise<void>;
  list(context: OperationContext): Promise<readonly AuditEvent[]>;
}

export type ApplicationRepositories = Readonly<{
  conversations: ConversationRepository;
  publishedKnowledge: PublishedKnowledgeRepository;
  suggestions: SuggestionRepository;
  proposals: ProposalRepository;
  approvalDecisions: ApprovalDecisionRepository;
  executionAttempts: ExecutionAttemptRepository;
  executionResults: ExecutionResultRepository;
  auditEvents: AuditEventRepository;
}>;

export interface ApplicationUnitOfWork {
  run<Result>(
    context: OperationContext,
    work: (repositories: ApplicationRepositories) => Promise<Result>,
  ): Promise<Result>;
}
