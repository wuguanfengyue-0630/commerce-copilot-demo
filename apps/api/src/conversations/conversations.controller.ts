import { Bind, Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import {
  asOpenApiSchema,
  ConversationParamsDto,
  conversationDetailResponseOpenApiSchema,
  conversationsResponseOpenApiSchema,
  emptyCommandBodySchema,
  suggestionResponseOpenApiSchema,
} from "../common/workflow-dtos.ts";
import { ZodValidationPipe } from "../common/zod-validation.pipe.ts";
import { DEMO_WORKFLOW, type DemoWorkflow } from "../demo/demo-workflow.service.ts";

@ApiTags("conversations")
@Controller("conversations")
export class ConversationsController {
  @Inject(DEMO_WORKFLOW) private readonly workflow!: DemoWorkflow;

  @Get()
  @ApiOkResponse({ schema: asOpenApiSchema(conversationsResponseOpenApiSchema) })
  list() {
    return this.workflow.conversations();
  }

  @Get(":conversationId")
  @Bind(Param(new ZodValidationPipe(ConversationParamsDto.schema)))
  @ApiParam({ name: "conversationId", type: String })
  @ApiOkResponse({ schema: asOpenApiSchema(conversationDetailResponseOpenApiSchema) })
  detail(params: ConversationParamsDto) {
    return this.workflow.conversation(params.conversationId);
  }

  @Post(":conversationId/suggestions")
  @Bind(
    Param(new ZodValidationPipe(ConversationParamsDto.schema)),
    Body(new ZodValidationPipe(emptyCommandBodySchema)),
  )
  @HttpCode(201)
  @ApiOperation({ summary: "Generate one grounded demo suggestion" })
  @ApiParam({ name: "conversationId", type: String })
  @ApiCreatedResponse({ schema: asOpenApiSchema(suggestionResponseOpenApiSchema) })
  generate(params: ConversationParamsDto, _body: undefined | Record<string, never>) {
    return this.workflow.generateSuggestion(params.conversationId);
  }
}
