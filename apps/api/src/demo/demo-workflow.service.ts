import { createDeterministicSuggestionGenerator } from "@commerce-copilot/agent";
import {
  type ApprovalDecisionRecord,
  createDecideApprovalUseCase,
  createExecuteActionUseCase,
  createGenerateSuggestionUseCase,
  type DemoRuntime,
  type OperationContext,
} from "@commerce-copilot/application";
import {
  createMockCommerceConnector,
  type MockCommerceConnector,
} from "@commerce-copilot/connectors";
import { SCHEMA_VERSION } from "@commerce-copilot/contracts";
import {
  type ActionProposal,
  createCompanyId,
  createConversationId,
  createOrderId,
  createProposalId,
  createStoreId,
  evaluateActionPolicy,
  FixedClock,
  resolveMessageSendMode,
  toIsoTimestamp,
} from "@commerce-copilot/domain";
import { NotFoundException } from "@nestjs/common";

export const DEMO_WORKFLOW = Symbol("DEMO_WORKFLOW");

const companyId = createCompanyId("company-demo");
const storeId = createStoreId("store-douyin-demo");
const seededConversationId = createConversationId("conversation-damaged-item-1");
const orderId = createOrderId("order-delivered-12800");
const generatedAt = toIsoTimestamp("2026-07-11T01:20:00.000Z");
const refundRules = Object.freeze([{ kind: "after_sale.refund" as const, enabled: true }]);
const supervisor = Object.freeze({ id: "user-demo-supervisor", role: "supervisor" as const });

export type ApprovalDecisionInput = Readonly<{
  outcome: "approved" | "rejected";
  proposalVersion: number;
  comment?: string;
}>;

export type DemoSetupState =
  | Readonly<{ status: "incomplete"; acceptedAt: null }>
  | Readonly<{ status: "complete"; acceptedAt: string }>;

export class DemoWorkflow {
  private connector: MockCommerceConnector;

  constructor(private readonly runtime: DemoRuntime) {
    this.connector = this.createConnector();
  }

  reset(): void {
    this.runtime.reset();
    this.connector = this.createConnector();
  }

  async workspace(setup: DemoSetupState) {
    const capabilities = await this.connector.getCapabilities(storeId);
    const proposals = await this.runtime.repositories.proposals.listByConversation(
      context("workspace", "workspace"),
      seededConversationId,
    );
    return {
      schemaVersion: SCHEMA_VERSION,
      workspace: {
        companyId,
        storeId,
        metrics: {
          openConversations: 1,
          waitingForAgent: 1,
          assistantSuggestions: proposals.length === 0 ? 0 : 1,
          proposalsAwaitingApproval: proposals.filter(
            (proposal) => proposal.status === "pending_approval",
          ).length,
          refundedAmount: {
            amountMinor: proposals.some((proposal) => proposal.status === "executed") ? 12_800 : 0,
            currency: "CNY",
          },
          measuredAt: generatedAt,
        },
        integrations: [
          {
            storeId,
            platform: "douyin",
            displayName: "抖音电商演示店",
            status: "connected",
            capabilities,
          },
        ],
        activeRules: [
          {
            kind: "after_sale.refund",
            enabled: true,
            requiresApproval: true,
            requiredRole: "supervisor",
          },
        ],
        messageSendMode: resolveMessageSendMode(capabilities),
        demoModel: { provider: "deterministic-demo", deterministic: true },
        evaluationSummary: { scenario: "damaged_item", status: "ready", score: 1 },
        setup,
      },
    };
  }

  async conversations() {
    const conversation = await this.loadConversation(seededConversationId);
    const latest = conversation.messages.at(-1);
    return {
      schemaVersion: SCHEMA_VERSION,
      conversations: [
        {
          companyId: conversation.companyId,
          storeId: conversation.storeId,
          conversationId: conversation.conversationId,
          customer: { customerId: conversation.customerId, displayName: "演示顾客" },
          status: "waiting_for_agent",
          lastMessagePreview: latest?.content ?? "",
          unreadCount: 1,
          updatedAt: conversation.updatedAt,
        },
      ],
      generatedAt,
    };
  }

  async conversation(rawConversationId: string) {
    const conversationId = createConversationId(rawConversationId);
    const conversation = await this.loadConversation(conversationId);
    const order = await this.connector.getOrder({ storeId, orderId });
    const suggestions = await this.runtime.repositories.suggestions.listByConversation(
      context(
        workflowCorrelation(conversationId),
        conversation.messages[0]?.messageId ?? conversationId,
      ),
      conversationId,
    );
    const proposals = await this.runtime.repositories.proposals.listByConversation(
      context(workflowCorrelation(conversationId), conversationId),
      conversationId,
    );
    const latestSuggestion = suggestions.at(-1) ?? null;
    const proposal = proposals.at(-1);
    return {
      schemaVersion: SCHEMA_VERSION,
      conversation: {
        companyId: conversation.companyId,
        storeId: conversation.storeId,
        conversationId: conversation.conversationId,
        customer: { customerId: conversation.customerId, displayName: "演示顾客" },
        status: "waiting_for_agent",
        lastMessagePreview: conversation.messages.at(-1)?.content ?? "",
        unreadCount: 1,
        updatedAt: conversation.updatedAt,
        messages: conversation.messages.map(
          ({ conversationId: _conversationId, ...message }) => message,
        ),
        order,
        latestSuggestion,
        citations: latestSuggestion?.citations ?? [],
        proposal: proposal === undefined ? null : presentProposal(proposal),
      },
    };
  }

  async generateSuggestion(rawConversationId: string) {
    const conversationId = createConversationId(rawConversationId);
    const conversation = await this.loadConversation(conversationId);
    const useCase = createGenerateSuggestionUseCase({
      repositories: this.runtime.repositories,
      unitOfWork: this.runtime.unitOfWork,
      commerceConnector: this.connector,
      suggestionGenerator: createDeterministicSuggestionGenerator(),
      clock: new FixedClock(new Date("2026-07-11T01:10:00.000Z")),
      policyRules: refundRules,
      policyEvaluator: evaluateActionPolicy,
    });
    const result = await useCase.execute({
      companyId,
      storeId,
      conversationId,
      orderId,
      correlationId: workflowCorrelation(conversationId),
      causationId: conversation.messages[0]?.messageId ?? conversationId,
      actorRole: "supervisor",
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      suggestion: result.suggestion,
      proposal: result.proposal === undefined ? null : presentProposal(result.proposal),
    };
  }

  async approvals() {
    const proposals = await this.runtime.repositories.proposals.listByConversation(
      context(workflowCorrelation(seededConversationId), seededConversationId),
      seededConversationId,
    );
    const pending = proposals
      .filter((proposal) => proposal.status === "pending_approval")
      .map(presentProposal);
    const history: ReturnType<typeof presentDecision>[] = [];
    for (const proposal of proposals.filter(
      (candidate) => candidate.status !== "pending_approval",
    )) {
      const decisions = await this.runtime.repositories.approvalDecisions.listByProposal(
        context(workflowCorrelation(proposal.conversationId), proposal.proposalId),
        proposal.proposalId,
      );
      history.push(...decisions.map(presentDecision));
    }
    return { schemaVersion: SCHEMA_VERSION, pending, history };
  }

  async decide(rawProposalId: string, input: ApprovalDecisionInput) {
    const proposalId = createProposalId(rawProposalId);
    const result = await createDecideApprovalUseCase({
      repositories: this.runtime.repositories,
      unitOfWork: this.runtime.unitOfWork,
      clock: new FixedClock(new Date("2026-07-11T01:15:00.000Z")),
    }).execute({
      companyId,
      proposalId,
      proposalVersion: input.proposalVersion,
      outcome: input.outcome,
      ...(input.comment === undefined ? {} : { comment: input.comment }),
      actor: supervisor,
      correlationId: workflowCorrelation(seededConversationId),
      causationId: proposalId,
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      decision: presentDecision(result.decision),
      proposal: presentProposal(result.proposal),
    };
  }

  async execute(rawProposalId: string) {
    const proposalId = createProposalId(rawProposalId);
    const result = await createExecuteActionUseCase({
      repositories: this.runtime.repositories,
      unitOfWork: this.runtime.unitOfWork,
      commerceConnector: this.connector,
      clock: new FixedClock(new Date("2026-07-11T01:20:00.000Z")),
    }).execute({
      companyId,
      proposalId,
      actor: supervisor,
      correlationId: workflowCorrelation(seededConversationId),
      causationId: proposalId,
    });
    if (result.status === "needs_human") {
      return {
        schemaVersion: SCHEMA_VERSION,
        result: { status: result.status, proposalId, reason: result.reason },
      };
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      result: {
        status: "succeeded",
        proposalId,
        executionId: result.executionResult.executionId,
        externalReference: result.executionResult.externalReference,
        completedAt: result.executionResult.completedAt,
      },
    };
  }

  async knowledge() {
    const policies = await this.runtime.repositories.publishedKnowledge.search({
      ...context("knowledge-read", "knowledge-read"),
      storeId,
      conversationId: seededConversationId,
      query: "damaged_item",
      evaluatedAt: generatedAt,
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      policies: policies.map((policy) => ({
        policyId: "policy-damaged-item-refund-v1",
        title: policy.title,
        status: policy.status,
        scenario: policy.scenario,
        content: policy.content,
        refundRule: policy.refundRule,
        citations: policy.citations,
        release: {
          releaseId: policy.releaseId,
          version: policy.version,
          publishedAt: policy.publishedAt,
          expiresAt: policy.expiresAt,
          immutable: true,
        },
      })),
    };
  }

  async auditEvents(rawConversationId: string) {
    const conversationId = createConversationId(rawConversationId);
    const conversation = await this.runtime.repositories.conversations.get(
      context("audit-read", "audit-read"),
      conversationId,
    );
    if (conversation === null) return { schemaVersion: SCHEMA_VERSION, events: [] };
    const acceptedCorrelations = new Set([workflowCorrelation(conversationId)]);
    const acceptedCausations = new Set(
      conversation.messages.map((message) => String(message.messageId)),
    );
    const proposals = await this.runtime.repositories.proposals.listByConversation(
      context("audit-read", "audit-read"),
      conversationId,
    );
    for (const proposal of proposals) acceptedCausations.add(proposal.proposalId);
    const events = await this.runtime.repositories.auditEvents.list(
      context("audit-read", "audit-read"),
    );
    return {
      schemaVersion: SCHEMA_VERSION,
      events: events.filter(
        (event) =>
          acceptedCorrelations.has(event.correlationId) ||
          acceptedCausations.has(event.causationId),
      ),
    };
  }

  private async loadConversation(conversationId: ReturnType<typeof createConversationId>) {
    const conversation = await this.runtime.repositories.conversations.get(
      context(workflowCorrelation(conversationId), conversationId),
      conversationId,
    );
    if (conversation === null) throw new NotFoundException("Conversation not found");
    return conversation;
  }

  private createConnector(): MockCommerceConnector {
    return createMockCommerceConnector(new FixedClock(new Date("2026-07-11T01:20:00.000Z")));
  }
}

function context(correlationId: string, causationId: string): OperationContext {
  return { companyId, correlationId, causationId };
}

function workflowCorrelation(conversationId: string): string {
  return `demo-workflow:${conversationId}`;
}

function presentDecision(decision: ApprovalDecisionRecord) {
  return {
    proposalId: decision.proposalId,
    proposalVersion: decision.proposalVersion,
    outcome: decision.decision,
    actor: { userId: decision.actor.userId, role: decision.actor.role },
    ...(decision.comment === undefined ? {} : { comment: decision.comment }),
    decidedAt: decision.decidedAt,
  };
}

function presentProposal(proposal: ActionProposal) {
  return {
    proposalId: proposal.proposalId,
    version: proposal.version,
    companyId: proposal.companyId,
    storeId: proposal.storeId,
    conversationId: proposal.conversationId,
    action: {
      kind: proposal.payload.kind,
      orderId: proposal.payload.orderId,
      amount: proposal.payload.amount,
      reasonCode: proposal.payload.reasonCode,
      observedOrder: {
        version: proposal.payload.observedOrderVersion,
        status: proposal.payload.observedOrderStatus,
        refundable: proposal.payload.observedRefundableAmount,
      },
    },
    status: proposal.status,
    createdAt: proposal.createdAt,
    expiresAt: proposal.expiresAt,
  };
}
