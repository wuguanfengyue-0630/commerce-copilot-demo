declare const idBrand: unique symbol;

type BrandedId<Name extends string> = string & {
  readonly [idBrand]: Name;
};

export type CompanyId = BrandedId<"CompanyId">;
export type StoreId = BrandedId<"StoreId">;
export type UserId = BrandedId<"UserId">;
export type CustomerId = BrandedId<"CustomerId">;
export type ConversationId = BrandedId<"ConversationId">;
export type MessageId = BrandedId<"MessageId">;
export type OrderId = BrandedId<"OrderId">;
export type ProposalId = BrandedId<"ProposalId">;
export type SuggestionId = BrandedId<"SuggestionId">;
export type KnowledgeReleaseId = BrandedId<"KnowledgeReleaseId">;
export type KnowledgeChunkId = BrandedId<"KnowledgeChunkId">;
export type AuditEventId = BrandedId<"AuditEventId">;

function createId<Name extends string>(value: string): BrandedId<Name> {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("ID must not be blank");
  }

  return value as BrandedId<Name>;
}

export function createCompanyId(value: string): CompanyId {
  return createId<"CompanyId">(value);
}

export function createStoreId(value: string): StoreId {
  return createId<"StoreId">(value);
}

export function createUserId(value: string): UserId {
  return createId<"UserId">(value);
}

export function createCustomerId(value: string): CustomerId {
  return createId<"CustomerId">(value);
}

export function createConversationId(value: string): ConversationId {
  return createId<"ConversationId">(value);
}

export function createMessageId(value: string): MessageId {
  return createId<"MessageId">(value);
}

export function createOrderId(value: string): OrderId {
  return createId<"OrderId">(value);
}

export function createProposalId(value: string): ProposalId {
  return createId<"ProposalId">(value);
}

export function createSuggestionId(value: string): SuggestionId {
  return createId<"SuggestionId">(value);
}

export function createKnowledgeReleaseId(value: string): KnowledgeReleaseId {
  return createId<"KnowledgeReleaseId">(value);
}

export function createKnowledgeChunkId(value: string): KnowledgeChunkId {
  return createId<"KnowledgeChunkId">(value);
}

export function createAuditEventId(value: string): AuditEventId {
  return createId<"AuditEventId">(value);
}
