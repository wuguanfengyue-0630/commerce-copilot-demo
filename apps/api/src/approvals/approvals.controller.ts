import { Bind, Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import {
  ApprovalDecisionDto,
  approvalDecisionOpenApiSchema,
  approvalsResponseOpenApiSchema,
  asOpenApiSchema,
  decisionResponseOpenApiSchema,
  ProposalParamsDto,
} from "../common/workflow-dtos.ts";
import { ZodValidationPipe } from "../common/zod-validation.pipe.ts";
import { DEMO_WORKFLOW, type DemoWorkflow } from "../demo/demo-workflow.service.ts";

@ApiTags("approvals")
@Controller("approvals")
export class ApprovalsController {
  @Inject(DEMO_WORKFLOW) private readonly workflow!: DemoWorkflow;

  @Get()
  @ApiOkResponse({ schema: asOpenApiSchema(approvalsResponseOpenApiSchema) })
  list() {
    return this.workflow.approvals();
  }

  @Post(":proposalId/decisions")
  @Bind(
    Param(new ZodValidationPipe(ProposalParamsDto.schema)),
    Body(new ZodValidationPipe(ApprovalDecisionDto.schema)),
  )
  @HttpCode(201)
  @ApiParam({ name: "proposalId", type: String })
  @ApiBody({ schema: asOpenApiSchema(approvalDecisionOpenApiSchema) })
  @ApiCreatedResponse({ schema: asOpenApiSchema(decisionResponseOpenApiSchema) })
  decide(params: ProposalParamsDto, body: ApprovalDecisionDto) {
    return this.workflow.decide(params.proposalId, body);
  }
}
