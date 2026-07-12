import { errorEnvelopeSchema } from "@commerce-copilot/contracts";
import { applyDecorators } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";
import { errorEnvelopeToOpenApiSchema } from "./zod-openapi.ts";

export function ApiErrorResponses(...statuses: readonly number[]): MethodDecorator {
  const schema = errorEnvelopeToOpenApiSchema(errorEnvelopeSchema);
  return applyDecorators(
    ...statuses.map((status) => ApiResponse({ status, description: description(status), schema })),
  );
}

function description(status: number): string {
  if (status === 404) return "Resource not found";
  if (status === 409) return "Workflow state conflict";
  if (status === 422) return "Request validation failed";
  return "Internal server error";
}
