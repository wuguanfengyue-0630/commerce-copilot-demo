import { type output, ZodError, type ZodType } from "zod";

export class RequestValidationError extends Error {
  constructor(readonly validationError: ZodError) {
    super("REQUEST_VALIDATION_ERROR", { cause: validationError });
    this.name = "RequestValidationError";
  }
}

export class ResponseContractError extends Error {
  constructor(readonly validationError: ZodError) {
    super("RESPONSE_CONTRACT_ERROR", { cause: validationError });
    this.name = "ResponseContractError";
  }
}

export function parseResponse<Schema extends ZodType>(
  schema: Schema,
  value: unknown,
): output<Schema> {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) throw new ResponseContractError(error);
    throw error;
  }
}
