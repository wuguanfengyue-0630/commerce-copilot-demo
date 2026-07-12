import {
  type ConversationDetailResponse,
  type ConversationListResponse,
  type ConversationParams,
  conversationDetailResponseSchema,
  conversationListResponseSchema,
  conversationParamsSchema,
  emptyCommandBodySchema,
  type SuggestionResponse,
  suggestionResponseSchema,
} from "@commerce-copilot/contracts";
import { Bind, Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { zodToOpenApiSchema } from "../common/zod-openapi.ts";
import { ZodValidationPipe } from "../common/zod-validation.pipe.ts";
import { DEMO_WORKFLOW, type DemoWorkflow } from "../demo/demo-workflow.service.ts";

@ApiTags("conversations")
@Controller("conversations")
export class ConversationsController {
  @Inject(DEMO_WORKFLOW) private readonly workflow!: DemoWorkflow;

  @Get()
  @ApiOkResponse({ schema: zodToOpenApiSchema(conversationListResponseSchema) })
  @ApiErrorResponses(500)
  list(): Promise<ConversationListResponse> {
    return this.workflow.conversations();
  }

  @Get(":conversationId")
  @Bind(Param(new ZodValidationPipe(conversationParamsSchema)))
  @ApiParam({ name: "conversationId", type: String })
  @ApiOkResponse({ schema: zodToOpenApiSchema(conversationDetailResponseSchema) })
  @ApiErrorResponses(404, 422, 500)
  detail(params: ConversationParams): Promise<ConversationDetailResponse> {
    return this.workflow.conversation(params.conversationId);
  }

  @Post(":conversationId/suggestions")
  @Bind(
    Param(new ZodValidationPipe(conversationParamsSchema)),
    Body(new ZodValidationPipe(emptyCommandBodySchema)),
  )
  @HttpCode(201)
  @ApiOperation({ summary: "Generate one grounded demo suggestion" })
  @ApiParam({ name: "conversationId", type: String })
  @ApiCreatedResponse({ schema: zodToOpenApiSchema(suggestionResponseSchema) })
  @ApiErrorResponses(404, 409, 422, 500)
  generate(
    params: ConversationParams,
    _body: undefined | Record<string, never>,
  ): Promise<SuggestionResponse> {
    return this.workflow.generateSuggestion(params.conversationId);
  }
}
