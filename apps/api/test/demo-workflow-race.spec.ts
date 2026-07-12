import { createDemoRuntime } from "@commerce-copilot/application";
import { beforeEach, describe, expect, it, vi } from "vitest";

const barrier = vi.hoisted(() => ({
  entered: undefined as (() => void) | undefined,
  wait: Promise.resolve(),
}));

vi.mock("@commerce-copilot/agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@commerce-copilot/agent")>();
  return {
    ...actual,
    createDeterministicSuggestionGenerator() {
      const delegate = actual.createDeterministicSuggestionGenerator();
      return {
        async generate(context: Parameters<typeof delegate.generate>[0]) {
          barrier.entered?.();
          await barrier.wait;
          return delegate.generate(context);
        },
      };
    },
  };
});

import { DemoWorkflow, OperationCoordinator } from "../src/demo/demo-workflow.service.ts";

beforeEach(() => {
  barrier.entered = undefined;
  barrier.wait = Promise.resolve();
});

describe("DemoWorkflow mutation coordination", () => {
  it("waits for a pre-transaction suggestion before reset clears the workflow", async () => {
    let release: () => void = () => undefined;
    barrier.wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      barrier.entered = resolve;
    });
    const workflow = new DemoWorkflow(createDemoRuntime());

    const suggestion = workflow.generateSuggestion("conversation-damaged-item-1");
    await entered;
    let resetCompleted = false;
    const reset = Promise.resolve(workflow.reset()).then(() => {
      resetCompleted = true;
    });
    await Promise.resolve();

    expect(resetCompleted).toBe(false);
    release();
    await suggestion;
    await reset;
    await expect(workflow.approvals()).resolves.toMatchObject({ pending: [], history: [] });

    await workflow.generateSuggestion("conversation-damaged-item-1");
    await expect(workflow.approvals()).resolves.toMatchObject({ pending: [{ version: 1 }] });
  });

  it("serializes approval, execution, and reset operations after a rejected operation", async () => {
    const coordinator = new OperationCoordinator();
    const order: string[] = [];

    await expect(
      coordinator.runMutation(async () => {
        order.push("failed");
        throw new Error("expected failure");
      }),
    ).rejects.toThrow("expected failure");

    const approval = coordinator.runMutation(async () => {
      order.push("approval");
    });
    const execution = coordinator.runMutation(async () => {
      order.push("execution");
    });
    const reset = coordinator.runReset(() => {
      order.push("reset");
    });
    await Promise.all([approval, execution, reset]);

    expect(order).toEqual(["failed", "approval", "execution", "reset"]);
  });
});
