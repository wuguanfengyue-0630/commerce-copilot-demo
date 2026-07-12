import { createDemoRuntime } from "@commerce-copilot/application";
import { beforeEach, describe, expect, it, vi } from "vitest";

const factories = vi.hoisted(() => ({
  approval: vi.fn(),
  execution: vi.fn(),
  suggestion: vi.fn(),
}));

vi.mock("@commerce-copilot/application", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@commerce-copilot/application")>();
  factories.approval.mockImplementation(actual.createDecideApprovalUseCase);
  factories.execution.mockImplementation(actual.createExecuteActionUseCase);
  factories.suggestion.mockImplementation(actual.createGenerateSuggestionUseCase);
  return {
    ...actual,
    createDecideApprovalUseCase: factories.approval,
    createExecuteActionUseCase: factories.execution,
    createGenerateSuggestionUseCase: factories.suggestion,
  };
});

import { DemoWorkflow } from "../src/demo/demo-workflow.service.ts";

beforeEach(() => {
  factories.approval.mockClear();
  factories.execution.mockClear();
  factories.suggestion.mockClear();
});

describe("DemoWorkflow composition", () => {
  it("constructs each use case once per app and retains it across reset", async () => {
    const workflow = new DemoWorkflow(createDemoRuntime());

    expect(factories.suggestion).toHaveBeenCalledTimes(1);
    expect(factories.approval).toHaveBeenCalledTimes(1);
    expect(factories.execution).toHaveBeenCalledTimes(1);

    await workflow.reset();
    expect(factories.suggestion).toHaveBeenCalledTimes(1);
    expect(factories.approval).toHaveBeenCalledTimes(1);
    expect(factories.execution).toHaveBeenCalledTimes(1);
  });
});
