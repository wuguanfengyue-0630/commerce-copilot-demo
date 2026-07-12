import { type WorkspaceResponse, workspaceResponseSchema } from "@commerce-copilot/contracts";
import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { zodToOpenApiSchema } from "../common/zod-openapi.ts";
import { DEMO_STATE, type DemoStatePort } from "../demo/demo.controller.ts";
import { DEMO_WORKFLOW, type DemoWorkflow } from "../demo/demo-workflow.service.ts";

@ApiTags("workspace")
@Controller("workspace")
export class WorkspaceController {
  @Inject(DEMO_WORKFLOW) private readonly workflow!: DemoWorkflow;
  @Inject(DEMO_STATE) private readonly state!: DemoStatePort;

  @Get()
  @ApiOperation({ summary: "Read the demo operations workspace" })
  @ApiOkResponse({ schema: zodToOpenApiSchema(workspaceResponseSchema) })
  @ApiErrorResponses(500)
  get(): Promise<WorkspaceResponse> {
    return this.workflow.workspace(this.state.setup());
  }
}
