import { Bind, Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiOkResponse, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  AuditQueryDto,
  asOpenApiSchema,
  auditResponseOpenApiSchema,
} from "../common/workflow-dtos.ts";
import { ZodValidationPipe } from "../common/zod-validation.pipe.ts";
import { DEMO_WORKFLOW, type DemoWorkflow } from "../demo/demo-workflow.service.ts";

@ApiTags("audit")
@Controller("audit-events")
export class AuditController {
  @Inject(DEMO_WORKFLOW) private readonly workflow!: DemoWorkflow;

  @Get()
  @Bind(Query(new ZodValidationPipe(AuditQueryDto.schema)))
  @ApiQuery({ name: "conversationId", required: true, type: String })
  @ApiOkResponse({ schema: asOpenApiSchema(auditResponseOpenApiSchema) })
  list(query: AuditQueryDto) {
    return this.workflow.auditEvents(query.conversationId);
  }
}
