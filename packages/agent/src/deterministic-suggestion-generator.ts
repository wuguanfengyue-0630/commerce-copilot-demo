import type {
  PublishedKnowledgeEvidence,
  SuggestionGenerationContext,
  SuggestionGenerationResult,
  SuggestionGenerator,
} from "@commerce-copilot/application";
import {
  type AfterSaleRefundPayload,
  createMoney,
  type IsoTimestamp,
  type KnowledgeCitation,
  toIsoTimestamp,
} from "@commerce-copilot/domain";

const DEMO_COMPANY_ID = "company-demo";
const DEMO_STORE_ID = "store-douyin-demo";
const DEMO_CONVERSATION_ID = "conversation-damaged-item-1";
const DEMO_ORDER_ID = "order-delivered-12800";
const DEMO_MESSAGE = "商品破损，申请退款";

export function createDeterministicSuggestionGenerator(): SuggestionGenerator {
  return Object.freeze({
    async generate(context: SuggestionGenerationContext): Promise<SuggestionGenerationResult> {
      try {
        const evaluatedAt = canonicalTimestamp(context.evaluatedAt);
        const evidence = selectPublishedEvidence(
          context.publishedKnowledge,
          context.companyId,
          evaluatedAt,
        );
        const isExactScenario = isExactDemoScenario(context);
        const citations =
          evidence === undefined || !isExactScenario ? frozenCitations([]) : evidence.citations;

        if (!isExactScenario || evidence === undefined || context.order === undefined) {
          return needsHuman(citations);
        }

        const order = context.order;
        if (!isGroundedDeliveredOrder(context, order)) {
          return needsHuman(citations);
        }

        const amount = createMoney(order.refundable.amountMinor, order.refundable.currency);
        const observedRefundableAmount = createMoney(
          order.refundable.amountMinor,
          order.refundable.currency,
        );
        const actionDraft = Object.freeze({
          kind: "after_sale.refund",
          orderId: order.orderId,
          amount,
          reasonCode: "damaged_item",
          observedOrderVersion: String(order.version),
          observedOrderStatus: "delivered",
          observedRefundableAmount,
        }) satisfies Readonly<AfterSaleRefundPayload>;

        return Object.freeze({
          provider: "deterministic-demo",
          disposition: "propose_action",
          suggestedReply: `根据已发布政策《${evidence.title}》（来源：${citations[0]?.sourceTitle}），建议为该破损商品提交退款申请，需审批并由主管确认后执行。`,
          citations,
          actionDraft,
          reason: "GROUNDED_DAMAGED_ITEM_REFUND",
        });
      } catch {
        return needsHuman(frozenCitations([]), "INVALID_RUNTIME_EVIDENCE");
      }
    },
  });
}

function selectPublishedEvidence(
  candidates: readonly PublishedKnowledgeEvidence[],
  companyId: string,
  evaluatedAt: IsoTimestamp,
): Readonly<{ title: string; citations: readonly KnowledgeCitation[] }> | undefined {
  if (!Array.isArray(candidates)) {
    throw new Error("Invalid knowledge evidence");
  }

  const validCandidates: Array<
    Readonly<{ title: string; citations: readonly KnowledgeCitation[] }>
  > = [];

  for (const candidate of candidates) {
    if (!isStructurallyValidEvidence(candidate, companyId)) {
      if (candidate.status === "published") {
        throw new Error("Invalid published knowledge evidence");
      }
      continue;
    }

    const publishedAt = canonicalTimestamp(candidate.publishedAt);
    const expiresAt =
      candidate.expiresAt === undefined ? undefined : canonicalTimestamp(candidate.expiresAt);
    const isLive =
      publishedAt <= evaluatedAt && (expiresAt === undefined || expiresAt > evaluatedAt);
    if (!isLive) {
      continue;
    }

    const citations = snapshotValidCitations(candidate);
    if (citations.length === 0) {
      continue;
    }

    validCandidates.push(
      Object.freeze({
        title: candidate.title,
        citations,
      }),
    );
  }

  return validCandidates.length === 1 ? validCandidates[0] : undefined;
}

function isStructurallyValidEvidence(
  evidence: PublishedKnowledgeEvidence,
  companyId: string,
): boolean {
  return (
    evidence !== null &&
    evidence !== undefined &&
    evidence.companyId === companyId &&
    evidence.status === "published" &&
    evidence.scenario === "damaged_item" &&
    evidence.refundRule?.kind === "after_sale.refund" &&
    evidence.refundRule.enabled === true &&
    Number.isSafeInteger(evidence.version) &&
    evidence.version > 0 &&
    isNonBlank(evidence.releaseId) &&
    isNonBlank(evidence.title) &&
    isNonBlank(evidence.content) &&
    Array.isArray(evidence.citations)
  );
}

function snapshotValidCitations(
  evidence: PublishedKnowledgeEvidence,
): readonly KnowledgeCitation[] {
  const citations = evidence.citations.map((citation) => {
    if (
      citation === null ||
      citation === undefined ||
      citation.releaseId !== evidence.releaseId ||
      citation.version !== evidence.version ||
      !Number.isSafeInteger(citation.version) ||
      citation.version < 1 ||
      !isNonBlank(citation.chunkId) ||
      !isNonBlank(citation.sourceTitle) ||
      !isNonBlank(citation.excerpt)
    ) {
      throw new Error("Invalid knowledge citation");
    }

    return Object.freeze({
      releaseId: citation.releaseId,
      chunkId: citation.chunkId,
      sourceTitle: citation.sourceTitle,
      excerpt: citation.excerpt,
      version: citation.version,
    });
  });

  return frozenCitations(citations);
}

function isExactDemoScenario(context: SuggestionGenerationContext): boolean {
  const conversation = context.conversation;
  if (
    context.companyId !== DEMO_COMPANY_ID ||
    context.storeId !== DEMO_STORE_ID ||
    conversation === null ||
    conversation === undefined ||
    conversation.companyId !== context.companyId ||
    conversation.storeId !== context.storeId ||
    conversation.conversationId !== DEMO_CONVERSATION_ID ||
    !Array.isArray(conversation.messages)
  ) {
    return false;
  }

  return conversation.messages.some(
    (message) =>
      message !== null &&
      message !== undefined &&
      message.conversationId === conversation.conversationId &&
      message.role === "customer" &&
      message.origin === "platform" &&
      message.content === DEMO_MESSAGE,
  );
}

function isGroundedDeliveredOrder(
  context: SuggestionGenerationContext,
  order: NonNullable<SuggestionGenerationContext["order"]>,
): boolean {
  if (
    order.companyId !== context.companyId ||
    order.storeId !== context.storeId ||
    order.orderId !== DEMO_ORDER_ID ||
    order.status !== "delivered" ||
    !Number.isSafeInteger(order.version) ||
    order.version < 1 ||
    canonicalTimestamp(order.updatedAt) !== order.updatedAt
  ) {
    return false;
  }

  createMoney(order.total.amountMinor, order.total.currency);
  createMoney(order.refundable.amountMinor, order.refundable.currency);
  return order.refundable.amountMinor > 0;
}

function canonicalTimestamp(value: IsoTimestamp): IsoTimestamp {
  const normalized = toIsoTimestamp(value);
  if (normalized !== value) {
    throw new Error("Timestamp must be canonical");
  }
  return normalized;
}

function frozenCitations(citations: readonly KnowledgeCitation[]): readonly KnowledgeCitation[] {
  return Object.freeze([...citations]);
}

function needsHuman(
  citations: readonly KnowledgeCitation[],
  reason = "INSUFFICIENT_GROUNDED_EVIDENCE",
): SuggestionGenerationResult {
  return Object.freeze({
    provider: "deterministic-demo",
    disposition: "needs_human",
    suggestedReply: "现有订单或已发布政策依据不足，建议转交人工核实后处理。",
    citations,
    reason,
  });
}

function isNonBlank(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
