import {
  type AfterSaleRefundPayload,
  createMoney,
  type KnowledgeCitation,
  type OrderSnapshot,
} from "@commerce-copilot/domain";
import type {
  PublishedKnowledgeEvidence,
  SuggestionGenerationResult,
} from "../ports/suggestion-generator.ts";

export function snapshotGroundedGenerationResult(
  result: SuggestionGenerationResult,
  order: OrderSnapshot,
  evidence: readonly PublishedKnowledgeEvidence[],
): SuggestionGenerationResult {
  if (
    result === null ||
    result === undefined ||
    result.provider !== "deterministic-demo" ||
    (result.disposition !== "propose_action" && result.disposition !== "needs_human") ||
    !isNonBlank(result.suggestedReply) ||
    !Array.isArray(result.citations)
  ) {
    throw new Error("invalid result");
  }

  const citations = snapshotGroundedCitations(result.citations, evidence);
  const reason = result.reason === undefined ? undefined : requireNonBlank(result.reason);
  if (result.disposition === "needs_human") {
    if (result.actionDraft !== undefined) {
      throw new Error("needs-human result included an action");
    }
    const base = {
      provider: "deterministic-demo" as const,
      disposition: "needs_human" as const,
      suggestedReply: result.suggestedReply,
      citations,
    };
    return reason === undefined ? Object.freeze(base) : Object.freeze({ ...base, reason });
  }

  if (result.actionDraft === undefined) {
    throw new Error("propose-action result omitted its action");
  }
  if (citations.length === 0) {
    throw new Error("propose-action result omitted its published citation");
  }
  const actionDraft = snapshotGroundedAction(result.actionDraft, order);
  const base = {
    provider: "deterministic-demo" as const,
    disposition: "propose_action" as const,
    suggestedReply: result.suggestedReply,
    citations,
    actionDraft,
  };
  return reason === undefined ? Object.freeze(base) : Object.freeze({ ...base, reason });
}

function snapshotGroundedCitations(
  citations: readonly KnowledgeCitation[],
  evidence: readonly PublishedKnowledgeEvidence[],
): readonly KnowledgeCitation[] {
  const available = evidence.flatMap((item) => item.citations);
  return Object.freeze(
    citations.map((citation) => {
      const grounded = available.some(
        (candidate) =>
          candidate.releaseId === citation.releaseId &&
          candidate.chunkId === citation.chunkId &&
          candidate.version === citation.version &&
          candidate.sourceTitle === citation.sourceTitle &&
          candidate.excerpt === citation.excerpt,
      );
      if (
        !grounded ||
        !isNonBlank(citation.sourceTitle) ||
        !isNonBlank(citation.excerpt) ||
        !Number.isSafeInteger(citation.version) ||
        citation.version < 1
      ) {
        throw new Error("ungrounded citation");
      }
      return Object.freeze({
        releaseId: citation.releaseId,
        chunkId: citation.chunkId,
        sourceTitle: citation.sourceTitle,
        excerpt: citation.excerpt,
        version: citation.version,
      });
    }),
  );
}

function snapshotGroundedAction(
  draft: Readonly<AfterSaleRefundPayload>,
  order: OrderSnapshot,
): Readonly<AfterSaleRefundPayload> {
  if (
    draft.kind !== "after_sale.refund" ||
    draft.orderId !== order.orderId ||
    draft.reasonCode !== "damaged_item" ||
    draft.observedOrderVersion !== order.version ||
    draft.observedOrderStatus !== order.status ||
    (order.status !== "paid" && order.status !== "shipped" && order.status !== "delivered") ||
    draft.amount.amountMinor !== order.refundable.amountMinor ||
    draft.amount.currency !== order.refundable.currency ||
    draft.observedRefundableAmount.amountMinor !== order.refundable.amountMinor ||
    draft.observedRefundableAmount.currency !== order.refundable.currency
  ) {
    throw new Error("action is not grounded in the live order");
  }

  return Object.freeze({
    kind: "after_sale.refund",
    orderId: order.orderId,
    amount: createMoney(order.refundable.amountMinor, order.refundable.currency),
    reasonCode: "damaged_item",
    observedOrderVersion: order.version,
    observedOrderStatus: order.status,
    observedRefundableAmount: createMoney(order.refundable.amountMinor, order.refundable.currency),
  });
}

function requireNonBlank(value: string): string {
  if (!isNonBlank(value)) {
    throw new Error("blank value");
  }
  return value;
}

function isNonBlank(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
