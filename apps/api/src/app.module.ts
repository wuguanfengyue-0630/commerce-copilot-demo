import type { DemoRuntime } from "@commerce-copilot/application";
import { type DynamicModule, Module } from "@nestjs/common";
import { createDemoModule } from "./demo/demo.module.ts";
import { API_MODE, HealthController } from "./health/health.controller.ts";

export type AppModuleOptions = Readonly<{ mode: "demo"; runtime?: DemoRuntime }>;

@Module({})
export class AppModule {}

export function createAppModule(options: AppModuleOptions): DynamicModule {
  return {
    module: AppModule,
    imports: [createDemoModule(options.runtime)],
    controllers: [HealthController],
    providers: [{ provide: API_MODE, useValue: options.mode }],
  };
}
