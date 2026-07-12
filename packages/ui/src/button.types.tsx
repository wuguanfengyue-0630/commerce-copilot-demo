import { Trash2 } from "lucide-react";
import { Button } from "./button.tsx";

void (
  <Button intent="danger" impactLabel="批准退款 ¥128.00">
    <Trash2 aria-hidden="true" />
  </Button>
);

// @ts-expect-error Destructive commands require an explicit impact label.
void (<Button intent="danger">批准退款</Button>);

void (
  (
    // @ts-expect-error Destructive children may only be an icon; the impact label is the command.
    <Button intent="danger" impactLabel="批准退款 ¥128.00">
      模糊操作
    </Button>
  )
);
