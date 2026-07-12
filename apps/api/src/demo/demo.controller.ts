import { Controller, Get, HttpCode, Inject, Post } from "@nestjs/common";
import { ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

export const DEMO_STATE = Symbol("DEMO_STATE");

export type DemoStatePort = Readonly<{
  setup():
    | Readonly<{ status: "incomplete"; acceptedAt: null }>
    | Readonly<{ status: "complete"; acceptedAt: string }>;
  completeSetup(): Readonly<{ status: "complete"; acceptedAt: string }>;
  reset(): void;
}>;

const actor = Object.freeze({
  userId: "user-demo-owner",
  displayName: "演示店主",
  role: "owner" as const,
});
const store = Object.freeze({
  companyId: "company-demo",
  storeId: "store-douyin-demo",
  displayName: "抖音电商演示店",
  platform: "douyin" as const,
});

@ApiTags("demo")
@Controller("demo")
export class DemoController {
  @Inject(DEMO_STATE)
  private readonly state!: DemoStatePort;

  @Post("reset")
  @HttpCode(204)
  @ApiOperation({ summary: "Reset the deterministic demo" })
  @ApiNoContentResponse()
  reset(): void {
    this.state.reset();
  }

  @Get("bootstrap")
  @ApiOperation({ summary: "Read deterministic demo bootstrap state" })
  @ApiOkResponse({ description: "Seeded actor, setup, and store state" })
  bootstrap() {
    return Object.freeze({
      schemaVersion: 1 as const,
      actor,
      setup: this.state.setup(),
      store,
    });
  }

  @Post("setup/complete")
  @HttpCode(200)
  @ApiOperation({ summary: "Complete deterministic demo setup" })
  @ApiOkResponse({ description: "Idempotent setup state" })
  completeSetup() {
    return Object.freeze({ schemaVersion: 1 as const, setup: this.state.completeSetup() });
  }
}
