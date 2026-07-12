import {
  ApprovalError,
  DemoRuntimeError,
  ExecuteActionError,
  GenerateSuggestionError,
  RepositoryConflictError,
} from "@commerce-copilot/application";
import {
  type ErrorEnvelope,
  errorEnvelopeSchema,
  SCHEMA_VERSION,
} from "@commerce-copilot/contracts";
import { ActionTransitionError } from "@commerce-copilot/domain";
import {
  type ArgumentsHost,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiErrorFilter } from "../src/common/api-error.filter.ts";
import { RequestValidationError, ResponseContractError } from "../src/common/contract-boundary.ts";

describe("ApiErrorFilter", () => {
  it.each([
    [new NotFoundException(), 404, "NOT_FOUND"],
    [new BadRequestException("bad request"), 400, "REQUEST_ERROR"],
    [
      new DemoRuntimeError("DEMO_RUNTIME_TRANSACTION_ACTIVE"),
      409,
      "DEMO_RUNTIME_TRANSACTION_ACTIVE",
    ],
    [new DemoRuntimeError("DEMO_RUNTIME_INVALID_CONTEXT"), 422, "DEMO_RUNTIME_INVALID_CONTEXT"],
    [new RepositoryConflictError(), 409, "REPOSITORY_CONFLICT"],
    [new ApprovalError("APPROVAL_NOT_FOUND"), 404, "APPROVAL_NOT_FOUND"],
    [new ApprovalError("APPROVAL_CONFLICT"), 409, "APPROVAL_CONFLICT"],
    [new ApprovalError("APPROVAL_INVALID_COMMAND"), 422, "APPROVAL_INVALID_COMMAND"],
    [new ExecuteActionError("EXECUTION_ROLE_REQUIRED"), 422, "EXECUTION_ROLE_REQUIRED"],
    [
      new GenerateSuggestionError("GENERATE_SUGGESTION_DUPLICATE_COMMAND"),
      409,
      "GENERATE_SUGGESTION_DUPLICATE_COMMAND",
    ],
    [new ActionTransitionError("ACTION_INVALID_PROPOSAL"), 422, "ACTION_INVALID_PROPOSAL"],
  ])("maps %s to a contract-compatible %i response", (error, expectedStatus, expectedCode) => {
    const result = invokeFilter(new ApiErrorFilter(), error);

    expect(result.status).toBe(expectedStatus);
    expect(errorEnvelopeSchema.parse(result.body)).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      error: { code: expectedCode },
    });
  });

  it("returns contract-compatible Zod validation details", () => {
    const schema = z.strictObject({ name: z.string().min(1) });
    const validationError = captureError(() => schema.parse({ name: "", extra: true }));
    const result = invokeFilter(
      new ApiErrorFilter(),
      new RequestValidationError(validationError as import("zod").ZodError),
    );

    expect(result.status).toBe(422);
    expect(errorEnvelopeSchema.parse(result.body)).toMatchObject({
      schemaVersion: SCHEMA_VERSION,
      error: { code: "VALIDATION_ERROR", details: { issues: expect.any(Array) } },
    });
  });

  it.each(["raw", "response"])("treats %s Zod failures as server errors", (kind) => {
    const validationError = captureError(() => z.string().parse(1)) as import("zod").ZodError;
    const error =
      kind === "response" ? new ResponseContractError(validationError) : validationError;
    const logger = { error: vi.fn() };
    const result = invokeFilter(new ApiErrorFilter(logger), error);

    expect(result.status).toBe(500);
    expect(result.body).toEqual({
      schemaVersion: SCHEMA_VERSION,
      error: { code: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试。" },
    });
    expect(JSON.stringify(result.body)).not.toContain("issues");
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it.each([
    [new ServiceUnavailableException("upstream details"), 503, "INTERNAL_ERROR"],
    [new ApprovalError("APPROVAL_PERSIST_FAILED"), 500, "APPROVAL_PERSIST_FAILED"],
    [new Error("database password leaked in stack"), 500, "INTERNAL_ERROR"],
  ])("hides 5xx details and logs the original error", (error, expectedStatus, expectedCode) => {
    const logger = { error: vi.fn() };
    const result = invokeFilter(new ApiErrorFilter(logger), error);

    expect(result.status).toBe(expectedStatus);
    expect(errorEnvelopeSchema.parse(result.body)).toEqual({
      schemaVersion: SCHEMA_VERSION,
      error: { code: expectedCode, message: "服务暂时不可用，请稍后重试。" },
    });
    expect(JSON.stringify(result.body)).not.toContain("password");
    expect(logger.error).toHaveBeenCalledWith(
      error,
      { method: "POST", url: "/api/v1/test", status: expectedStatus },
      "ApiErrorFilter",
    );
  });

  it("does not log a 4xx response as a server failure", () => {
    const logger = { error: vi.fn() };
    const result = invokeFilter(new ApiErrorFilter(logger), new BadRequestException());

    expect(result.status).toBe(400);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

function invokeFilter(filter: ApiErrorFilter, exception: unknown) {
  const captured: { status?: number; body?: ErrorEnvelope } = {};
  const response = {
    status(status: number) {
      captured.status = status;
      return {
        send(body: ErrorEnvelope) {
          captured.body = body;
        },
      };
    },
  };
  const host = {
    switchToHttp() {
      return {
        getRequest: () => ({ method: "POST", url: "/api/v1/test" }),
        getResponse: () => response,
      };
    },
  } as ArgumentsHost;

  filter.catch(exception, host);
  return captured;
}

function captureError(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to fail");
}
