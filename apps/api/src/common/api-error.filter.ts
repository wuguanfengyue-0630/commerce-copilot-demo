import {
  ApprovalError,
  type ApprovalErrorCode,
  DemoRuntimeError,
  type DemoRuntimeErrorCode,
  ExecuteActionError,
  type ExecuteActionErrorCode,
  GenerateSuggestionError,
  type GenerateSuggestionErrorCode,
  RepositoryConflictError,
} from "@commerce-copilot/application";
import { type ErrorDetails, type ErrorEnvelope, SCHEMA_VERSION } from "@commerce-copilot/contracts";
import { ActionTransitionError, type ActionTransitionErrorCode } from "@commerce-copilot/domain";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { RequestValidationError } from "./contract-boundary.ts";

export type ApiErrorLogger = Readonly<{
  error(message: unknown, ...optionalParams: unknown[]): void;
}>;

type MappedError = Readonly<{ status: number; code: string }>;

const demoRuntimeStatuses = {
  DEMO_RUNTIME_CONFLICT: HttpStatus.CONFLICT,
  DEMO_RUNTIME_INVALID_CONTEXT: HttpStatus.UNPROCESSABLE_ENTITY,
  DEMO_RUNTIME_INVALID_RECORD: HttpStatus.UNPROCESSABLE_ENTITY,
  DEMO_RUNTIME_TRANSACTION_ACTIVE: HttpStatus.CONFLICT,
} satisfies Record<DemoRuntimeErrorCode, number>;

const approvalStatuses = {
  APPROVAL_INVALID_COMMAND: HttpStatus.UNPROCESSABLE_ENTITY,
  APPROVAL_NOT_FOUND: HttpStatus.NOT_FOUND,
  APPROVAL_ROLE_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  APPROVAL_EXPIRED: HttpStatus.CONFLICT,
  APPROVAL_CONFLICT: HttpStatus.CONFLICT,
  APPROVAL_PERSIST_FAILED: HttpStatus.INTERNAL_SERVER_ERROR,
} satisfies Record<ApprovalErrorCode, number>;

const executionStatuses = {
  EXECUTION_INVALID_COMMAND: HttpStatus.UNPROCESSABLE_ENTITY,
  EXECUTION_NOT_FOUND: HttpStatus.NOT_FOUND,
  EXECUTION_ROLE_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  EXECUTION_CONFLICT: HttpStatus.CONFLICT,
  EXECUTION_PERSIST_FAILED: HttpStatus.INTERNAL_SERVER_ERROR,
} satisfies Record<ExecuteActionErrorCode, number>;

const suggestionStatuses = {
  GENERATE_SUGGESTION_CONNECTOR_FAILED: HttpStatus.INTERNAL_SERVER_ERROR,
  GENERATE_SUGGESTION_CONVERSATION_NOT_FOUND: HttpStatus.NOT_FOUND,
  GENERATE_SUGGESTION_DUPLICATE_COMMAND: HttpStatus.CONFLICT,
  GENERATE_SUGGESTION_GENERATOR_FAILED: HttpStatus.INTERNAL_SERVER_ERROR,
  GENERATE_SUGGESTION_INVALID_COMMAND: HttpStatus.UNPROCESSABLE_ENTITY,
  GENERATE_SUGGESTION_KNOWLEDGE_FAILED: HttpStatus.INTERNAL_SERVER_ERROR,
  GENERATE_SUGGESTION_ORDER_SCOPE_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
  GENERATE_SUGGESTION_PERSIST_FAILED: HttpStatus.INTERNAL_SERVER_ERROR,
  GENERATE_SUGGESTION_POLICY_DENIED: HttpStatus.UNPROCESSABLE_ENTITY,
  GENERATE_SUGGESTION_SCOPE_MISMATCH: HttpStatus.UNPROCESSABLE_ENTITY,
} satisfies Record<GenerateSuggestionErrorCode, number>;

const actionTransitionStatuses = {
  ACTION_EXPIRED: HttpStatus.CONFLICT,
  ACTION_INVALID_PROPOSAL: HttpStatus.UNPROCESSABLE_ENTITY,
  ACTION_NOT_APPROVED: HttpStatus.CONFLICT,
  ACTION_NOT_EXECUTING: HttpStatus.CONFLICT,
  ACTION_NOT_PENDING_APPROVAL: HttpStatus.CONFLICT,
} satisfies Record<ActionTransitionErrorCode, number>;

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  constructor(private readonly logger?: ApiErrorLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{ method?: string; url?: string }>();
    const response = http.getResponse<{
      status(code: number): { send(body: ErrorEnvelope): void };
    }>();
    const { status, body } = toApiError(exception);
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger?.error(
        exception,
        {
          method: request.method ?? "UNKNOWN",
          url: request.url ?? "UNKNOWN",
          status,
        },
        ApiErrorFilter.name,
      );
    }
    response.status(status).send(body);
  }
}

function toApiError(exception: unknown): { status: number; body: ErrorEnvelope } {
  if (exception instanceof RequestValidationError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      body: errorEnvelope("VALIDATION_ERROR", "请求数据不符合接口要求。", {
        issues: exception.validationError.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.map(String),
          message: issue.message,
        })),
      }),
    };
  }

  const mapped = mapKnownError(exception);
  if (mapped !== null) {
    return {
      status: mapped.status,
      body: errorEnvelope(mapped.code, messageForStatus(mapped.status)),
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === HttpStatus.NOT_FOUND) {
      return {
        status,
        body: errorEnvelope("NOT_FOUND", "未找到请求的接口。"),
      };
    }
    return {
      status,
      body: errorEnvelope(
        status >= HttpStatus.INTERNAL_SERVER_ERROR ? "INTERNAL_ERROR" : "REQUEST_ERROR",
        status >= HttpStatus.INTERNAL_SERVER_ERROR ? messageForStatus(status) : exception.message,
      ),
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: errorEnvelope("INTERNAL_ERROR", messageForStatus(HttpStatus.INTERNAL_SERVER_ERROR)),
  };
}

function mapKnownError(exception: unknown): MappedError | null {
  if (exception instanceof DemoRuntimeError) {
    return { status: demoRuntimeStatuses[exception.code], code: exception.code };
  }
  if (exception instanceof RepositoryConflictError) {
    return { status: HttpStatus.CONFLICT, code: exception.code };
  }
  if (exception instanceof ApprovalError) {
    return { status: approvalStatuses[exception.code], code: exception.code };
  }
  if (exception instanceof ExecuteActionError) {
    return { status: executionStatuses[exception.code], code: exception.code };
  }
  if (exception instanceof GenerateSuggestionError) {
    return { status: suggestionStatuses[exception.code], code: exception.code };
  }
  if (exception instanceof ActionTransitionError) {
    return { status: actionTransitionStatuses[exception.code], code: exception.code };
  }
  return null;
}

function errorEnvelope(code: string, message: string, details?: ErrorDetails): ErrorEnvelope {
  return details === undefined
    ? { schemaVersion: SCHEMA_VERSION, error: { code, message } }
    : { schemaVersion: SCHEMA_VERSION, error: { code, message, details } };
}

function messageForStatus(status: number): string {
  switch (status) {
    case HttpStatus.NOT_FOUND:
      return "未找到请求的资源。";
    case HttpStatus.CONFLICT:
      return "该操作已被处理，请刷新后查看最新状态。";
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return "请求语义无效，请检查后重试。";
    default:
      return "服务暂时不可用，请稍后重试。";
  }
}
