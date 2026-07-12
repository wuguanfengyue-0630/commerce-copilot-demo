import { SetupShell } from "../../src/components/setup-shell.tsx";
import { SetupWizard } from "../../src/features/setup/setup-wizard.tsx";

export default function SetupPage() {
  return (
    <SetupShell>
      <SetupWizard />
    </SetupShell>
  );
}
