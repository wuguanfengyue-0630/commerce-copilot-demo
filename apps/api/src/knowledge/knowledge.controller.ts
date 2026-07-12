import { type KnowledgeResponse, knowledgeResponseSchema } from "@commerce-copilot/contracts";
import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { zodToOpenApiSchema } from "../common/zod-openapi.ts";
import { DEMO_WORKFLOW, type DemoWorkflow } from "../demo/demo-workflow.service.ts";

@ApiTags("knowledge")
@Controller("knowledge")
export class KnowledgeController {
  @Inject(DEMO_WORKFLOW) private readonly workflow!: DemoWorkflow;

  @Get()
  @ApiOkResponse({ schema: zodToOpenApiSchema(knowledgeResponseSchema) })
  @ApiErrorResponses(500)
  list(): Promise<KnowledgeResponse> {
    return this.workflow.knowledge();
  }
}
