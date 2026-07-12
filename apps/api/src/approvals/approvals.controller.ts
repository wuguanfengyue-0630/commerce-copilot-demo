import {
  type ApprovalDecisionRequest,
  type ApprovalDecisionResponse,
  type ApprovalsResponse,
  approvalDecisionRequestSchema,
  approvalDecisionResponseSchema,
  approvalsResponseSchema,
  type ProposalParams,
  proposalParamsSchema,
} from "@commerce-copilot/contracts";
import { Bind, Body, Controller, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { zodToOpenApiSchema } from "../common/zod-openapi.ts";
import { ZodValidationPipe } from "../common/zod-validation.pipe.ts";
import { DEMO_WORKFLOW, type DemoWorkflow } from "../demo/demo-workflow.service.ts";

@ApiTags("approvals")
@Controller("approvals")
export class ApprovalsController {
  @Inject(DEMO_WORKFLOW) private readonly workflow!: DemoWorkflow;

  @Get()
  @ApiOkResponse({ schema: zodToOpenApiSchema(approvalsResponseSchema) })
  @ApiErrorResponses(500)
  list(): Promise<ApprovalsResponse> {
    return this.workflow.approvals();
  }

  @Post(":proposalId/decisions")
  @Bind(
    Param(new ZodValidationPipe(proposalParamsSchema)),
    Body(new ZodValidationPipe(approvalDecisionRequestSchema)),
  )
  @HttpCode(201)
  @ApiParam({ name: "proposalId", type: String })
  @ApiBody({ schema: zodToOpenApiSchema(approvalDecisionRequestSchema) })
  @ApiCreatedResponse({ schema: zodToOpenApiSchema(approvalDecisionResponseSchema) })
  @ApiErrorResponses(404, 409, 422, 500)
  decide(params: ProposalParams, body: ApprovalDecisionRequest): Promise<ApprovalDecisionResponse> {
    return this.workflow.decide(params.proposalId, body);
  }
}
