import {
  type ActionPolicyInput,
  type CapabilityState,
  createCompanyId,
  createConversationId,
  createMoney,
  createOrderId,
  createOrderSnapshot,
  createStoreId,
  evaluateActionPolicy,
  FixedClock,
  type OrderSnapshot,
  type PolicyEvaluation,
  toIsoTimestamp,
} from "@commerce-copilot/domain";
import { describe, expect, it } from "vitest";
import type {
  ApplicationRepositories,
  ApplicationUnitOfWork,
  CommerceConnector,
  CreateGenerateSuggestionDependencies,
  ExecuteActionCommand,
  ExecutionResult,
  GenerateSuggestionCommand,
  GetOrderCommand,
  OperationContext,
  PublishedKnowledgeSearch,
  SuggestionGenerationContext,
  SuggestionGenerationResult,
  SuggestionGenerator,
} from "../index.ts";
import { createDemoRuntime } from "../runtime/demo-runtime.ts";
import {
  createGenerateSuggestionUseCase,
  GenerateSuggestionError,
  type GenerateSuggestionErrorCode,
} from "./generate-suggestion.ts";

const companyId = createCompanyId("company-demo");
const storeId = createStoreId("store-douyin-demo");
const conversationId = createConversationId("conversation-damaged-item-1");
const orderId = createOrderId("order-delivered-12800");
const fixedNow = new Date("2026-07-11T02:00:00.000Z");

const command = Object.freeze({
  companyId,
  storeId,
  conversationId,
  orderId,
  correlationId: "correlation-generate-suggestion-1",
  causationId: "message-damaged-item-1",
  actorRole: "supervisor",
}) satisfies GenerateSuggestionCommand;

const enabledRefundRule = Object.freeze({
  kind: "after_sale.refund",
  enabled: true,
});

function liveOrder(): OrderSnapshot {
  return createOrderSnapshot({
    companyId,
    storeId,
    orderId,
    version: 1,
    status: "delivered",
    total: createMoney(12_800, "CNY"),
    refundable: createMoney(12_800, "CNY"),
    updatedAt: toIsoTimestamp("2026-07-11T01:00:00.000Z"),
  });
}

function groundedResult(context: SuggestionGenerationContext): SuggestionGenerationResult {
  const citations = Object.freeze(
    context.publishedKnowledge.flatMap((evidence) => evidence.citations),
  );

  return Object.freeze({
    provider: "deterministic-demo",
    disposition: "propose_action",
    suggestedReply:
      "根据已发布政策《破损商品退款政策》，建议提交退款申请，需审批并由主管确认后执行。",
    citations,
    actionDraft: Object.freeze({
      kind: "after_sale.refund",
      orderId,
      amount: createMoney(12_800, "CNY"),
      reasonCode: "damaged_item",
      observedOrderVersion: "1",
      observedOrderStatus: "delivered",
      observedRefundableAmount: createMoney(12_800, "CNY"),
    }),
    reason: "GROUNDED_DAMAGED_ITEM_REFUND",
  });
}

function needsHumanResult(): SuggestionGenerationResult {
  return Object.freeze({
    provider: "deterministic-demo",
    disposition: "needs_human",
    suggestedReply: "现有依据不足，建议转交人工核实。",
    citations: Object.freeze([]),
    reason: "INSUFFICIENT_GROUNDED_EVIDENCE",
  });
}

type HarnessOptions = Readonly<{
  generatorResult?: "grounded" | "needs_human";
  connectorError?: Error;
  generatorError?: Error;
  policyRules?: readonly (typeof enabledRefundRule)[];
  policyEvaluator?: (input: ActionPolicyInput) => PolicyEvaluation;
  repositories?: ApplicationRepositories;
  unitOfWork?: ApplicationUnitOfWork;
}>;

function createHarness(options: HarnessOptions = {}) {
  const calls: string[] = [];
  const runtime = createDemoRuntime();
  const baseRepositories = options.repositories ?? runtime.repositories;
  const repositories: ApplicationRepositories = Object.freeze({
    ...baseRepositories,
    conversations: Object.freeze({
      async get(context: OperationContext, id: GenerateSuggestionCommand["conversationId"]) {
        calls.push("load conversation");
        return baseRepositories.conversations.get(context, id);
      },
    }),
    publishedKnowledge: Object.freeze({
      async search(query: PublishedKnowledgeSearch) {
        calls.push("search published knowledge");
        return baseRepositories.publishedKnowledge.search(query);
      },
    }),
  });
  const connector: CommerceConnector = Object.freeze({
    async getCapabilities(): Promise<readonly CapabilityState[]> {
      return Object.freeze([]);
    },
    async getOrder(_command: GetOrderCommand): Promise<OrderSnapshot> {
      calls.push("fetch live order");
      if (options.connectorError !== undefined) {
        throw options.connectorError;
      }
      return liveOrder();
    },
    async executeAction(_command: ExecuteActionCommand): Promise<ExecutionResult> {
      throw new Error("executeAction is outside GenerateSuggestion");
    },
    async findActionResult(_idempotencyKey: string): Promise<ExecutionResult | null> {
      return null;
    },
  });
  const generator: SuggestionGenerator = Object.freeze({
    async generate(context: SuggestionGenerationContext): Promise<SuggestionGenerationResult> {
      calls.push("generate suggestion");
      if (options.generatorError !== undefined) {
        throw options.generatorError;
      }
      return options.generatorResult === "needs_human"
        ? needsHumanResult()
        : groundedResult(context);
    },
  });
  const baseUnitOfWork = options.unitOfWork ?? runtime.unitOfWork;
  const unitOfWork: ApplicationUnitOfWork = Object.freeze({
    async run<Result>(
      context: OperationContext,
      work: (repositories: ApplicationRepositories) => Promise<Result>,
    ): Promise<Result> {
      calls.push("persist atomically");
      return baseUnitOfWork.run(context, work);
    },
  });
  const policyEvaluator = (input: ActionPolicyInput): PolicyEvaluation => {
    calls.push("evaluate policy");
    return (options.policyEvaluator ?? evaluateActionPolicy)(input);
  };
  const dependencies: CreateGenerateSuggestionDependencies = Object.freeze({
    repositories,
    unitOfWork,
    commerceConnector: connector,
    suggestionGenerator: generator,
    clock: new FixedClock(fixedNow),
    policyRules: options.policyRules ?? Object.freeze([enabledRefundRule]),
    policyEvaluator,
  });

  return {
    calls,
    dependencies,
    runtime,
    useCase: createGenerateSuggestionUseCase(dependencies),
  };
}

async function expectSuggestionError(
  operation: Promise<object>,
  code: GenerateSuggestionErrorCode,
): Promise<void> {
  await expect(operation).rejects.toBeInstanceOf(GenerateSuggestionError);
  await expect(operation).rejects.toMatchObject({ code, message: code });
}

async function workflowCounts(runtime: ReturnType<typeof createDemoRuntime>) {
  const context = {
    companyId,
    correlationId: command.correlationId,
    causationId: command.causationId,
  } as const;

  return {
    suggestions: (
      await runtime.repositories.suggestions.listByConversation(context, conversationId)
    ).length,
    proposals: (await runtime.repositories.proposals.listByConversation(context, conversationId))
      .length,
    audits: (await runtime.repositories.auditEvents.list(context)).length,
  };
}

describe("GenerateSuggestion", () => {
  it("calls boundaries in the exact grounded sequence and persists one atomic proposal timeline", async () => {
    const harness = createHarness();

    const result = await harness.useCase.execute(command);

    expect(harness.calls).toEqual([
      "load conversation",
      "fetch live order",
      "search published knowledge",
      "generate suggestion",
      "evaluate policy",
      "persist atomically",
    ]);
    expect(result).toMatchObject({
      companyId,
      storeId,
      conversationId,
      orderId,
      correlationId: command.correlationId,
      causationId: command.causationId,
    });
    expect(result.suggestion).toMatchObject({
      suggestionId: "suggestion-correlation-generate-suggestion-1",
      disposition: "propose_action",
      correlationId: command.correlationId,
      causationId: command.causationId,
      createdAt: "2026-07-11T02:00:00.000Z",
    });
    expect(result.proposal).toMatchObject({
      proposalId: "proposal-correlation-generate-suggestion-1",
      status: "pending_approval",
      expiresAt: "2026-07-11T02:30:00.000Z",
    });

    const context = {
      companyId,
      correlationId: command.correlationId,
      causationId: command.causationId,
    } as const;
    const suggestions = await harness.runtime.repositories.suggestions.listByConversation(
      context,
      conversationId,
    );
    const proposals = await harness.runtime.repositories.proposals.listByConversation(
      context,
      conversationId,
    );
    const audits = await harness.runtime.repositories.auditEvents.list(context);

    expect(suggestions).toEqual([result.suggestion]);
    expect(proposals[0]).toBe(result.proposal);
    expect(audits.map((event) => event.eventType)).toEqual([
      "conversation.message_ingested",
      "knowledge.retrieved",
      "agent.suggestion_generated",
      "action.proposed",
    ]);
    expect(audits.slice(1).every((event) => event.companyId === companyId)).toBe(true);
    expect(audits.slice(1).every((event) => event.correlationId === command.correlationId)).toBe(
      true,
    );
    expect(audits.slice(1).every((event) => event.causationId === command.causationId)).toBe(true);
  });

  it("persists a needs-human suggestion and no proposal", async () => {
    const harness = createHarness({ generatorResult: "needs_human" });

    const result = await harness.useCase.execute(command);

    expect(result.suggestion.disposition).toBe("needs_human");
    expect(result.proposal).toBeUndefined();
    expect(await workflowCounts(harness.runtime)).toEqual({
      suggestions: 1,
      proposals: 0,
      audits: 3,
    });
    const context = {
      companyId,
      correlationId: command.correlationId,
      causationId: command.causationId,
    } as const;
    expect(
      (await harness.runtime.repositories.auditEvents.list(context)).map(
        (event) => event.eventType,
      ),
    ).toEqual([
      "conversation.message_ingested",
      "knowledge.retrieved",
      "agent.suggestion_generated",
    ]);
  });

  it("does not invent a knowledge-retrieved audit when search returns no valid evidence", async () => {
    const runtime = createDemoRuntime();
    const noKnowledgeRepositories: ApplicationRepositories = Object.freeze({
      ...runtime.repositories,
      publishedKnowledge: Object.freeze({
        async search() {
          return Object.freeze([]);
        },
      }),
    });
    const harness = createHarness({
      generatorResult: "needs_human",
      repositories: noKnowledgeRepositories,
      unitOfWork: runtime.unitOfWork,
    });

    await harness.useCase.execute(command);

    const context = {
      companyId,
      correlationId: command.correlationId,
      causationId: command.causationId,
    } as const;
    expect(
      (await runtime.repositories.auditEvents.list(context)).map((event) => event.eventType),
    ).toEqual(["conversation.message_ingested", "agent.suggestion_generated"]);
  });

  it("fails closed under the default-deny policy without workflow writes", async () => {
    const harness = createHarness({ policyRules: Object.freeze([]) });

    await expectSuggestionError(
      harness.useCase.execute(command),
      "GENERATE_SUGGESTION_POLICY_DENIED",
    );

    expect(await workflowCounts(harness.runtime)).toEqual({
      suggestions: 0,
      proposals: 0,
      audits: 1,
    });
  });

  it("returns stable errors for a missing conversation and a command scope mismatch", async () => {
    const runtime = createDemoRuntime();
    const missingRepositories: ApplicationRepositories = Object.freeze({
      ...runtime.repositories,
      conversations: Object.freeze({
        async get() {
          return null;
        },
      }),
    });
    const missingHarness = createHarness({
      repositories: missingRepositories,
      unitOfWork: runtime.unitOfWork,
    });
    const mismatchHarness = createHarness();
    const mismatchedCommand = Object.freeze({
      ...command,
      storeId: createStoreId("store-other"),
      correlationId: "correlation-store-mismatch",
    });

    await expectSuggestionError(
      missingHarness.useCase.execute(command),
      "GENERATE_SUGGESTION_CONVERSATION_NOT_FOUND",
    );
    await expectSuggestionError(
      mismatchHarness.useCase.execute(mismatchedCommand),
      "GENERATE_SUGGESTION_SCOPE_MISMATCH",
    );
    expect(await workflowCounts(runtime)).toEqual({ suggestions: 0, proposals: 0, audits: 1 });
  });

  it.each([
    {
      failure: "connector",
      options: { connectorError: new Error("connector unavailable") },
      code: "GENERATE_SUGGESTION_CONNECTOR_FAILED" as const,
    },
    {
      failure: "generator",
      options: { generatorError: new Error("generator unavailable") },
      code: "GENERATE_SUGGESTION_GENERATOR_FAILED" as const,
    },
  ])("leaves no writes when the $failure fails", async ({ options, code }) => {
    const harness = createHarness(options);

    await expectSuggestionError(harness.useCase.execute(command), code);

    expect(await workflowCounts(harness.runtime)).toEqual({
      suggestions: 0,
      proposals: 0,
      audits: 1,
    });
  });

  it("rolls back all staged writes when persistence fails after the callback", async () => {
    const runtime = createDemoRuntime();
    const failingUnitOfWork: ApplicationUnitOfWork = Object.freeze({
      async run<Result>(
        context: OperationContext,
        work: (repositories: ApplicationRepositories) => Promise<Result>,
      ): Promise<Result> {
        return runtime.unitOfWork.run(context, async (repositories) => {
          await work(repositories);
          throw new Error("commit failed");
        });
      },
    });
    const harness = createHarness({
      repositories: runtime.repositories,
      unitOfWork: failingUnitOfWork,
    });

    await expectSuggestionError(
      harness.useCase.execute(command),
      "GENERATE_SUGGESTION_PERSIST_FAILED",
    );

    expect(await workflowCounts(runtime)).toEqual({ suggestions: 0, proposals: 0, audits: 1 });
  });

  it("rejects a duplicate correlation deterministically without duplicate proposal or audit", async () => {
    const harness = createHarness();

    await harness.useCase.execute(command);
    const firstCounts = await workflowCounts(harness.runtime);
    await expectSuggestionError(
      harness.useCase.execute(command),
      "GENERATE_SUGGESTION_DUPLICATE_COMMAND",
    );

    expect(await workflowCounts(harness.runtime)).toEqual(firstCounts);
    expect(firstCounts).toEqual({ suggestions: 1, proposals: 1, audits: 4 });
  });

  it("fails closed when the connector returns an order outside the command scope", async () => {
    const runtime = createDemoRuntime();
    const wrongOrder = createOrderSnapshot({
      ...liveOrder(),
      storeId: createStoreId("store-foreign"),
    });
    const connector: CommerceConnector = Object.freeze({
      async getCapabilities(): Promise<readonly CapabilityState[]> {
        return Object.freeze([]);
      },
      async getOrder(): Promise<OrderSnapshot> {
        return wrongOrder;
      },
      async executeAction(): Promise<ExecutionResult> {
        throw new Error("not used");
      },
      async findActionResult(): Promise<ExecutionResult | null> {
        return null;
      },
    });
    const base = createHarness({
      repositories: runtime.repositories,
      unitOfWork: runtime.unitOfWork,
    });
    const dependencies: CreateGenerateSuggestionDependencies = {
      ...base.dependencies,
      commerceConnector: connector,
    };
    const useCase = createGenerateSuggestionUseCase(dependencies);

    await expectSuggestionError(
      useCase.execute(command),
      "GENERATE_SUGGESTION_ORDER_SCOPE_MISMATCH",
    );
    expect(await workflowCounts(runtime)).toEqual({ suggestions: 0, proposals: 0, audits: 1 });
  });
});
