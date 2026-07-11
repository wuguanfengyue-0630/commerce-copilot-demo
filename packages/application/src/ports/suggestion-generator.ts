import type {
  AfterSaleRefundPayload,
  CompanyId,
  Conversation,
  DemoRefundRule,
  IsoTimestamp,
  KnowledgeCitation,
  KnowledgeReleaseId,
  OrderSnapshot,
  StoreId,
} from "@commerce-copilot/domain";

export type PublishedKnowledgeEvidence = Readonly<{
  companyId: CompanyId;
  releaseId: KnowledgeReleaseId;
  title: string;
  status: "published";
  version: number;
  scenario: "damaged_item";
  content: string;
  refundRule: DemoRefundRule;
  publishedAt: IsoTimestamp;
  expiresAt?: IsoTimestamp;
  citations: readonly KnowledgeCitation[];
}>;

export type SuggestionGenerationContext = Readonly<{
  companyId: CompanyId;
  storeId: StoreId;
  conversation: Conversation;
  order?: OrderSnapshot;
  publishedKnowledge: readonly PublishedKnowledgeEvidence[];
  evaluatedAt: IsoTimestamp;
}>;

export type SuggestionDisposition = "propose_action" | "needs_human";

export type SuggestionGenerationResult = Readonly<{
  provider: "deterministic-demo";
  disposition: SuggestionDisposition;
  suggestedReply: string;
  citations: readonly KnowledgeCitation[];
  actionDraft?: Readonly<AfterSaleRefundPayload>;
  reason?: string;
}>;

export interface SuggestionGenerator {
  generate(context: SuggestionGenerationContext): Promise<SuggestionGenerationResult>;
}
