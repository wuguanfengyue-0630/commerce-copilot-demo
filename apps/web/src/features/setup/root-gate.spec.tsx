import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../../api/client.ts";
import { RootGate, setupDestination } from "./root-gate.tsx";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("../../api/client.ts", () => ({ apiRequest: vi.fn() }));

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<RootGate />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

const bootstrap = {
  schemaVersion: 1,
  actor: { userId: "user-demo-owner", displayName: "演示店主", role: "owner" },
  setup: { status: "incomplete", acceptedAt: null },
  store: {
    companyId: "company-demo",
    storeId: "store-douyin-demo",
    displayName: "抖音电商演示店",
    platform: "douyin",
  },
} as const;

describe("root setup decision", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    vi.mocked(apiRequest).mockReset();
  });

  it("chooses setup only when acceptedAt is absent", () => {
    expect(setupDestination(null)).toBe("/setup");
    expect(setupDestination("2026-07-11T01:05:00.000Z")).toBe("/overview");
  });

  it("keeps a stable loading gate before redirecting incomplete setup", async () => {
    vi.mocked(apiRequest).mockResolvedValue(bootstrap);
    renderGate();

    expect(screen.getByRole("status")).toHaveTextContent("正在检查演示环境");
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/setup"));
  });

  it("redirects completed setup to overview after a reload", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ...bootstrap,
      setup: { status: "complete", acceptedAt: "2026-07-11T01:05:00.000Z" },
    });
    renderGate();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/overview"));
  });

  it("offers a retry action when bootstrap cannot load", async () => {
    vi.mocked(apiRequest)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(bootstrap);
    renderGate();

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "重新加载" }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/setup"));
  });
});
