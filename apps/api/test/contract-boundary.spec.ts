import { workspaceResponseSchema } from "@commerce-copilot/contracts";
import { describe, expect, it } from "vitest";
import { parseResponse, ResponseContractError } from "../src/common/contract-boundary.ts";

describe("response contract boundary", () => {
  it("wraps response Zod failures while preserving the cause for logging", () => {
    let captured: unknown;
    try {
      parseResponse(workspaceResponseSchema, { schemaVersion: 1, workspace: {} });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(ResponseContractError);
    expect((captured as ResponseContractError).cause).toBe(
      (captured as ResponseContractError).validationError,
    );
  });
});
