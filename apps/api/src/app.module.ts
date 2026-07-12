import type { DemoRuntime } from "@commerce-copilot/application";
import { type DynamicModule, Module } from "@nestjs/common";
import { ActionsController } from "./actions/actions.controller.ts";
import { ApprovalsController } from "./approvals/approvals.controller.ts";
import { AuditController } from "./audit/audit.controller.ts";
import { ConversationsController } from "./conversations/conversations.controller.ts";
import { createDemoModule } from "./demo/demo.module.ts";
import { API_MODE, HealthController } from "./health/health.controller.ts";
import { KnowledgeController } from "./knowledge/knowledge.controller.ts";
import { WorkspaceController } from "./workspace/workspace.controller.ts";

export type AppModuleOptions = Readonly<{ mode: "demo"; runtime?: DemoRuntime }>;

@Module({})
export class AppModule {}

export function createAppModule(options: AppModuleOptions): DynamicModule {
  return {
    module: AppModule,
    imports: [createDemoModule(options.runtime)],
    controllers: [
      HealthController,
      WorkspaceController,
      ConversationsController,
      ApprovalsController,
      ActionsController,
      KnowledgeController,
      AuditController,
    ],
    providers: [{ provide: API_MODE, useValue: options.mode }],
  };
}
