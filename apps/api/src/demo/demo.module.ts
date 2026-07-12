import { createDemoRuntime, type DemoRuntime } from "@commerce-copilot/application";
import { type DynamicModule, Module } from "@nestjs/common";
import { DEMO_STATE, DemoController } from "./demo.controller.ts";

export class DemoState {
  private acceptedAt: string | null = null;

  constructor(readonly runtime: DemoRuntime) {}

  setup() {
    return this.acceptedAt === null
      ? Object.freeze({ status: "incomplete" as const, acceptedAt: null })
      : Object.freeze({ status: "complete" as const, acceptedAt: this.acceptedAt });
  }

  completeSetup() {
    this.acceptedAt ??= "2026-07-11T01:05:00.000Z";
    return this.setup();
  }

  reset(): void {
    this.runtime.reset();
    this.acceptedAt = null;
  }
}

@Module({})
export class DemoModule {}

export function createDemoModule(runtime: DemoRuntime = createDemoRuntime()): DynamicModule {
  return {
    module: DemoModule,
    controllers: [DemoController],
    providers: [{ provide: DEMO_STATE, useValue: new DemoState(runtime) }],
  };
}
