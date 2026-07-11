export const DEMO_RUNTIME_ERROR_CODES = [
  "DEMO_RUNTIME_CONFLICT",
  "DEMO_RUNTIME_INVALID_CONTEXT",
  "DEMO_RUNTIME_INVALID_RECORD",
  "DEMO_RUNTIME_TRANSACTION_ACTIVE",
] as const;

export type DemoRuntimeErrorCode = (typeof DEMO_RUNTIME_ERROR_CODES)[number];

export class DemoRuntimeError extends Error {
  readonly code: DemoRuntimeErrorCode;

  constructor(code: DemoRuntimeErrorCode) {
    super(code);
    this.name = "DemoRuntimeError";
    this.code = code;
  }
}
