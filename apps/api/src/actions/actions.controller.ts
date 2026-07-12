import { Bind, Body, Controller, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiCreatedResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import {
  asOpenApiSchema,
  emptyCommandBodySchema,
  executionResponseOpenApiSchema,
  ProposalParamsDto,
} from "../common/workflow-dtos.ts";
import { ZodValidationPipe } from "../common/zod-validation.pipe.ts";
import { DEMO_WORKFLOW, type DemoWorkflow } from "../demo/demo-workflow.service.ts";

@ApiTags("actions")
@Controller("actions")
export class ActionsController {
  @Inject(DEMO_WORKFLOW) private readonly workflow!: DemoWorkflow;

  @Post(":proposalId/execute")
  @Bind(
    Param(new ZodValidationPipe(ProposalParamsDto.schema)),
    Body(new ZodValidationPipe(emptyCommandBodySchema)),
  )
  @HttpCode(201)
  @ApiParam({ name: "proposalId", type: String })
  @ApiCreatedResponse({ schema: asOpenApiSchema(executionResponseOpenApiSchema) })
  execute(params: ProposalParamsDto, _body: undefined | Record<string, never>) {
    return this.workflow.execute(params.proposalId);
  }
}
