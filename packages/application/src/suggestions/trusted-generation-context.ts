import {
  type CompanyId,
  type Conversation,
  createConversation,
  createKnowledgeChunkId,
  createKnowledgeReleaseId,
  createMoney,
  createOrderSnapshot,
  type IsoTimestamp,
  MESSAGE_ORIGINS,
  MESSAGE_ROLES,
  ORDER_STATUSES,
  type OrderSnapshot,
  toIsoTimestamp,
} from "@commerce-copilot/domain";
import type { PublishedKnowledgeEvidence } from "../ports/suggestion-generator.ts";

export function snapshotConversationForGeneration(input: Conversation): Conversation {
  if (
    input === null ||
    input === undefined ||
    !isNonBlank(input.companyId) ||
    !isNonBlank(input.storeId) ||
    !isNonBlank(input.conversationId) ||
    !isNonBlank(input.customerId) ||
    !Array.isArray(input.messages)
  ) {
    throw new Error("Invalid conversation snapshot");
  }

  const createdAt = canonicalTimestamp(input.createdAt);
  const updatedAt = canonicalTimestamp(input.updatedAt);
  if (updatedAt < createdAt) {
    throw new Error("Invalid conversation chronology");
  }

  const messages = input.messages.map((message) => {
    if (
      message === null ||
      message === undefined ||
      !isNonBlank(message.messageId) ||
      message.conversationId !== input.conversationId ||
      !MESSAGE_ROLES.some((role) => role === message.role) ||
      !MESSAGE_ORIGINS.some((origin) => origin === message.origin) ||
      !isNonBlank(message.content)
    ) {
      throw new Error("Invalid conversation message");
    }
    const occurredAt = canonicalTimestamp(message.occurredAt);
    if (occurredAt < createdAt || occurredAt > updatedAt) {
      throw new Error("Invalid message chronology");
    }
    const base = {
      messageId: message.messageId,
      conversationId: message.conversationId,
      role: message.role,
      origin: message.origin,
      content: message.content,
      occurredAt,
    };
    return message.externalMessageId === undefined
      ? base
      : { ...base, externalMessageId: requireNonBlank(message.externalMessageId) };
  });

  return createConversation({
    companyId: input.companyId,
    storeId: input.storeId,
    conversationId: input.conversationId,
    customerId: input.customerId,
    messages,
    createdAt,
    updatedAt,
  });
}

export function snapshotOrderForGeneration(input: OrderSnapshot): OrderSnapshot {
  if (
    input === null ||
    input === undefined ||
    !isNonBlank(input.companyId) ||
    !isNonBlank(input.storeId) ||
    !isNonBlank(input.orderId) ||
    !Number.isSafeInteger(input.version) ||
    input.version < 1 ||
    !ORDER_STATUSES.some((status) => status === input.status)
  ) {
    throw new Error("Invalid order snapshot");
  }

  return createOrderSnapshot({
    companyId: input.companyId,
    storeId: input.storeId,
    orderId: input.orderId,
    version: input.version,
    status: input.status,
    total: createMoney(input.total.amountMinor, input.total.currency),
    refundable: createMoney(input.refundable.amountMinor, input.refundable.currency),
    updatedAt: canonicalTimestamp(input.updatedAt),
  });
}

export function snapshotPublishedKnowledgeForGeneration(
  inputs: readonly PublishedKnowledgeEvidence[],
  companyId: CompanyId,
  evaluatedAt: IsoTimestamp,
): readonly PublishedKnowledgeEvidence[] {
  if (!Array.isArray(inputs)) {
    throw new Error("Invalid knowledge collection");
  }
  const canonicalEvaluatedAt = canonicalTimestamp(evaluatedAt);
  const snapshots = inputs.map((input) => snapshotPublishedKnowledge(input, companyId));
  return Object.freeze(
    snapshots.filter(
      (snapshot) =>
        snapshot.publishedAt <= canonicalEvaluatedAt &&
        (snapshot.expiresAt === undefined || snapshot.expiresAt > canonicalEvaluatedAt),
    ),
  );
}

function snapshotPublishedKnowledge(
  input: PublishedKnowledgeEvidence,
  companyId: CompanyId,
): PublishedKnowledgeEvidence {
  if (
    input === null ||
    input === undefined ||
    input.companyId !== companyId ||
    input.status !== "published" ||
    input.scenario !== "damaged_item" ||
    input.refundRule === null ||
    input.refundRule === undefined ||
    input.refundRule.kind !== "after_sale.refund" ||
    input.refundRule.enabled !== true ||
    !Number.isSafeInteger(input.version) ||
    input.version < 1 ||
    !Array.isArray(input.citations) ||
    input.citations.length === 0
  ) {
    throw new Error("Invalid published knowledge evidence");
  }

  const releaseId = createKnowledgeReleaseId(requireCanonicalId(input.releaseId));
  const publishedAt = canonicalTimestamp(input.publishedAt);
  const expiresAt = input.expiresAt === undefined ? undefined : canonicalTimestamp(input.expiresAt);
  if (expiresAt !== undefined && expiresAt <= publishedAt) {
    throw new Error("Invalid knowledge chronology");
  }
  const citations = Object.freeze(
    input.citations.map((citation) => {
      if (
        citation === null ||
        citation === undefined ||
        citation.releaseId !== input.releaseId ||
        citation.version !== input.version ||
        !Number.isSafeInteger(citation.version) ||
        citation.version < 1
      ) {
        throw new Error("Invalid knowledge citation");
      }
      return Object.freeze({
        releaseId,
        chunkId: createKnowledgeChunkId(requireCanonicalId(citation.chunkId)),
        sourceTitle: requireNonBlank(citation.sourceTitle),
        excerpt: requireNonBlank(citation.excerpt),
        version: citation.version,
      });
    }),
  );
  const base = {
    companyId,
    releaseId,
    title: requireNonBlank(input.title),
    status: "published" as const,
    version: input.version,
    scenario: "damaged_item" as const,
    content: requireNonBlank(input.content),
    refundRule: Object.freeze({ kind: "after_sale.refund" as const, enabled: true }),
    publishedAt,
    citations,
  };
  return expiresAt === undefined ? Object.freeze(base) : Object.freeze({ ...base, expiresAt });
}

function canonicalTimestamp(value: IsoTimestamp): IsoTimestamp {
  const normalized = toIsoTimestamp(value);
  if (normalized !== value) {
    throw new Error("Timestamp must be canonical");
  }
  return normalized;
}

function requireNonBlank(value: string): string {
  if (!isNonBlank(value)) {
    throw new Error("Value must not be blank");
  }
  return value;
}

function requireCanonicalId(value: string): string {
  const nonBlank = requireNonBlank(value);
  if (nonBlank.trim() !== nonBlank) {
    throw new Error("ID must be canonical");
  }
  return nonBlank;
}

function isNonBlank(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
