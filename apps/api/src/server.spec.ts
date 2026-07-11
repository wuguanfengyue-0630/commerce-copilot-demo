import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createDemoServer, type DemoStateView } from "./server.ts";

const openServers: ReturnType<typeof createDemoServer>[] = [];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
    ),
  );
});

describe("demo workflow HTTP server", () => {
  it("runs the seeded workflow and keeps execution idempotent", async () => {
    const server = createDemoServer();
    openServers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${baseUrl}/health`);
    expect(await health.json()).toEqual({ status: "ok", mode: "demo" });

    const initial = await getState(baseUrl);
    expect(initial).toMatchObject({
      mode: "demo",
      suggestion: null,
      proposal: null,
      approvals: [],
      executionResult: null,
    });

    const suggestedResponse = await fetch(`${baseUrl}/api/v1/demo/suggestions`, {
      method: "POST",
    });
    const suggested = (await suggestedResponse.json()) as DemoStateView;
    expect(suggestedResponse.status).toBe(201);
    expect(suggested.suggestion?.disposition).toBe("propose_action");
    expect(suggested.proposal?.status).toBe("pending_approval");
    if (suggested.proposal === null) {
      throw new Error("Expected a proposal after suggestion generation");
    }

    const proposalPath = encodeURIComponent(suggested.proposal.proposalId);
    const approvedResponse = await fetch(
      `${baseUrl}/api/v1/demo/proposals/${proposalPath}/approve`,
      { method: "POST" },
    );
    const approved = (await approvedResponse.json()) as DemoStateView;
    expect(approvedResponse.status).toBe(200);
    expect(approved.proposal?.status).toBe("approved");
    expect(approved.approvals).toHaveLength(1);

    const executeUrl = `${baseUrl}/api/v1/demo/proposals/${proposalPath}/execute`;
    const firstExecution = await fetch(executeUrl, { method: "POST" });
    const firstExecutedState = (await firstExecution.json()) as DemoStateView;
    const auditCountAfterFirstExecution = firstExecutedState.auditEvents.length;
    const secondExecution = await fetch(executeUrl, { method: "POST" });
    const secondExecutedState = (await secondExecution.json()) as DemoStateView;

    expect(firstExecution.status).toBe(200);
    expect(secondExecution.status).toBe(200);
    expect(firstExecutedState.proposal?.status).toBe("executed");
    expect(firstExecutedState.executionResult).toEqual(secondExecutedState.executionResult);
    expect(secondExecutedState.auditEvents).toHaveLength(auditCountAfterFirstExecution);
    expect(secondExecutedState.auditEvents.map((event) => event.eventType).slice(-3)).toEqual([
      "approval.approved",
      "action.execution_started",
      "action.execution_succeeded",
    ]);

    const resetResponse = await fetch(`${baseUrl}/api/v1/demo/reset`, { method: "POST" });
    const reset = (await resetResponse.json()) as DemoStateView;
    expect(reset).toMatchObject({ suggestion: null, proposal: null, executionResult: null });
    expect(reset.auditEvents.map((event) => event.eventType)).toEqual([
      "conversation.message_ingested",
    ]);
  });
});

async function getState(baseUrl: string): Promise<DemoStateView> {
  const response = await fetch(`${baseUrl}/api/v1/demo/state`);
  expect(response.status).toBe(200);
  return (await response.json()) as DemoStateView;
}
