import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { knowledgeResponseOpenApiSchema } from "../common/workflow-dtos.ts";
import { DEMO_WORKFLOW, type DemoWorkflow } from "../demo/demo-workflow.service.ts";

@ApiTags("knowledge")
@Controller("knowledge")
export class KnowledgeController {
  @Inject(DEMO_WORKFLOW) private readonly workflow!: DemoWorkflow;

  @Get()
  @ApiOkResponse({ schema: knowledgeResponseOpenApiSchema })
  list() {
    return this.workflow.knowledge();
  }
}
