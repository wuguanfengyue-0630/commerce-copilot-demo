import {
  type AuditEventsResponse,
  type AuditQuery,
  auditEventsResponseSchema,
  auditQuerySchema,
} from "@commerce-copilot/contracts";
import { Bind, Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiOkResponse, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ApiErrorResponses } from "../common/api-error-responses.ts";
import { zodToOpenApiSchema } from "../common/zod-openapi.ts";
import { ZodValidationPipe } from "../common/zod-validation.pipe.ts";
import { DEMO_WORKFLOW, type DemoWorkflow } from "../demo/demo-workflow.service.ts";

@ApiTags("audit")
@Controller("audit-events")
export class AuditController {
  @Inject(DEMO_WORKFLOW) private readonly workflow!: DemoWorkflow;

  @Get()
  @Bind(Query(new ZodValidationPipe(auditQuerySchema)))
  @ApiQuery({ name: "conversationId", required: true, type: String })
  @ApiOkResponse({ schema: zodToOpenApiSchema(auditEventsResponseSchema) })
  @ApiErrorResponses(422, 500)
  list(query: AuditQuery): Promise<AuditEventsResponse> {
    return this.workflow.auditEvents(query.conversationId);
  }
}
