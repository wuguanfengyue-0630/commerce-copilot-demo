import type { ReactNode } from "react";

import { AppShell } from "../../src/components/app-shell.tsx";

export default function ConsoleLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
