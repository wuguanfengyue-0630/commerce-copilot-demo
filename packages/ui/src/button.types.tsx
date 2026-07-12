import { Trash2 } from "lucide-react";
import { Button } from "./button.tsx";

function AmbiguousAction() {
  return <span>模糊操作</span>;
}

void (<Button intent="danger" impactLabel="批准退款 ¥128.00" icon={Trash2} />);

// @ts-expect-error Destructive commands require an explicit impact label.
void (<Button intent="danger">批准退款</Button>);

void (
  (
    // @ts-expect-error Destructive commands do not accept arbitrary element children.
    <Button intent="danger" impactLabel="批准退款 ¥128.00">
      <span>模糊操作</span>
    </Button>
  )
);

void (
  (
    // @ts-expect-error Custom components cannot override a destructive command label.
    <Button intent="danger" impactLabel="批准退款 ¥128.00">
      <AmbiguousAction />
    </Button>
  )
);
