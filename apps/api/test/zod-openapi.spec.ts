import {
  approvalDecisionRequestSchema,
  executionResponseSchema,
} from "@commerce-copilot/contracts";
import { describe, expect, it } from "vitest";
import { zodToOpenApiSchema } from "../src/common/zod-openapi.ts";

describe("Zod OpenAPI adapter", () => {
  it("converts strict requests and literals without duplicating the contract", () => {
    const schema = zodToOpenApiSchema(approvalDecisionRequestSchema) as {
      additionalProperties: boolean;
      required: string[];
      properties: Record<string, { enum?: string[] }>;
    };

    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["outcome", "proposalVersion"]);
    expect(schema.properties.outcome?.enum).toEqual(["approved", "rejected"]);
    expect(schema.properties).not.toHaveProperty("actor");
  });

  it("converts discriminated unions to typed oneOf branches", () => {
    const schema = zodToOpenApiSchema(executionResponseSchema) as {
      properties: { result: { type: string; oneOf: unknown[] } };
    };

    expect(schema.properties.result.type).toBe("object");
    expect(schema.properties.result.oneOf).toHaveLength(2);
  });
});
