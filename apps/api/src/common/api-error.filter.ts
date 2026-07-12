import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { ZodError } from "zod";

type ErrorEnvelope = Readonly<{
  error: Readonly<{ code: string; message: string; details?: unknown }>;
}>;

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status(code: number): { send(body: ErrorEnvelope): void };
    }>();
    const { status, body } = toApiError(exception);
    response.status(status).send(body);
  }
}

function toApiError(exception: unknown): { status: number; body: ErrorEnvelope } {
  if (exception instanceof ZodError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "请求数据不符合接口要求。",
          details: { issues: exception.issues },
        },
      },
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    if (status === HttpStatus.NOT_FOUND) {
      return {
        status,
        body: { error: { code: "NOT_FOUND", message: "未找到请求的接口。" } },
      };
    }
    return {
      status,
      body: {
        error: {
          code: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
          message: status >= 500 ? "服务暂时不可用，请稍后重试。" : exception.message,
        },
      },
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: {
      error: { code: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试。" },
    },
  };
}
