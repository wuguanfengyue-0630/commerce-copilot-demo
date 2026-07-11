import {
  type ActionProposal,
  type AuditEvent,
  type Conversation,
  createAuditEvent,
  createAuditEventId,
  createCompanyId,
  createConversation,
  createConversationId,
  createCustomerId,
  createKnowledgeChunkId,
  createKnowledgeReleaseId,
  createMessageId,
  createStoreId,
  toIsoTimestamp,
} from "@commerce-copilot/domain";
import type {
  ApprovalDecisionRecord,
  ExecutionAttemptRecord,
  ExecutionResultRecord,
  SuggestionRecord,
} from "../ports/repositories.ts";
import type { PublishedKnowledgeEvidence } from "../ports/suggestion-generator.ts";
import { snapshotKnowledgeEvidence } from "./demo-runtime-snapshots.ts";

export type DemoState = {
  conversations: Map<string, Conversation>;
  publishedKnowledge: Map<string, PublishedKnowledgeEvidence>;
  suggestions: Map<string, SuggestionRecord>;
  proposals: Map<string, ActionProposal>;
  approvalDecisions: Map<string, ApprovalDecisionRecord>;
  executionAttempts: Map<string, ExecutionAttemptRecord>;
  executionResults: Map<string, ExecutionResultRecord>;
  auditEvents: Map<string, AuditEvent>;
};

const demoCompanyId = createCompanyId("company-demo");
const demoStoreId = createStoreId("store-douyin-demo");
const demoConversationId = createConversationId("conversation-damaged-item-1");
const seedTimestamp = toIsoTimestamp("2026-07-11T01:00:00.000Z");

export function createSeedState(): DemoState {
  const conversation = createConversation({
    companyId: demoCompanyId,
    storeId: demoStoreId,
    conversationId: demoConversationId,
    customerId: createCustomerId("customer-demo-1"),
    messages: [
      {
        messageId: createMessageId("message-damaged-item-1"),
        conversationId: demoConversationId,
        role: "customer",
        origin: "platform",
        content: "商品破损，申请退款",
        occurredAt: seedTimestamp,
      },
    ],
    createdAt: seedTimestamp,
    updatedAt: seedTimestamp,
  });
  const releaseId = createKnowledgeReleaseId("knowledge-release-damaged-item-v1");
  const evidence = snapshotKnowledgeEvidence(
    Object.freeze({
      companyId: demoCompanyId,
      releaseId,
      title: "破损商品退款政策",
      status: "published",
      version: 1,
      scenario: "damaged_item",
      content: "订单已送达且商品破损时，可建议提交不超过可退金额的退款申请，须经主管审批。",
      refundRule: Object.freeze({ kind: "after_sale.refund", enabled: true }),
      publishedAt: seedTimestamp,
      expiresAt: toIsoTimestamp("2026-08-11T00:00:00.000Z"),
      citations: Object.freeze([
        Object.freeze({
          releaseId,
          chunkId: createKnowledgeChunkId("knowledge-chunk-damaged-item-v1-1"),
          sourceTitle: "破损商品退款政策",
          excerpt: "商品破损可提交退款申请，须经主管审批。",
          version: 1,
        }),
      ]),
    }),
  );
  const initialAudit = createAuditEvent({
    auditEventId: createAuditEventId("audit-conversation-message-ingested-1"),
    companyId: demoCompanyId,
    correlationId: "correlation-message-ingested-1",
    causationId: "message-damaged-item-1",
    eventType: "conversation.message_ingested",
    occurredAt: seedTimestamp,
  });

  return {
    conversations: new Map([[conversation.conversationId, conversation]]),
    publishedKnowledge: new Map([[evidence.releaseId, evidence]]),
    suggestions: new Map(),
    proposals: new Map(),
    approvalDecisions: new Map(),
    executionAttempts: new Map(),
    executionResults: new Map(),
    auditEvents: new Map([[initialAudit.auditEventId, initialAudit]]),
  };
}

export function cloneState(state: DemoState): DemoState {
  return {
    conversations: new Map(state.conversations),
    publishedKnowledge: new Map(state.publishedKnowledge),
    suggestions: new Map(state.suggestions),
    proposals: new Map(state.proposals),
    approvalDecisions: new Map(state.approvalDecisions),
    executionAttempts: new Map(state.executionAttempts),
    executionResults: new Map(state.executionResults),
    auditEvents: new Map(state.auditEvents),
  };
}
