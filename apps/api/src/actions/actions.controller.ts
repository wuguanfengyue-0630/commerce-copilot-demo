import {
  type ExecutionResponse,
  emptyCommandBodySchema,
  executionResponseSchema,
  type ProposalParams,
  proposalParamsSchema,
} from "@commerce-copilot/contracts";
import { Bind, Body, Controller, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiCreatedResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { zodToOpenApiSchema } from "../common/zod-openapi.ts";
import { ZodValidationPipe } from "../common/zod-validation.pipe.ts";
import { DEMO_WORKFLOW, type DemoWorkflow } from "../demo/demo-workflow.service.ts";

@ApiTags("actions")
@Controller("actions")
export class ActionsController {
  @Inject(DEMO_WORKFLOW) private readonly workflow!: DemoWorkflow;

  @Post(":proposalId/execute")
  @Bind(
    Param(new ZodValidationPipe(proposalParamsSchema)),
    Body(new ZodValidationPipe(emptyCommandBodySchema)),
  )
  @HttpCode(201)
  @ApiParam({ name: "proposalId", type: String })
  @ApiCreatedResponse({ schema: zodToOpenApiSchema(executionResponseSchema) })
  @ApiErrorResponses(404, 409, 422, 500)
  execute(
    params: ProposalParams,
    _body: undefined | Record<string, never>,
  ): Promise<ExecutionResponse> {
    return this.workflow.execute(params.proposalId);
  }
}
