import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

export const API_MODE = Symbol("API_MODE");

@ApiTags("health")
@Controller("health")
export class HealthController {
  @Inject(API_MODE)
  private readonly mode!: "demo";

  @Get()
  @ApiOperation({ summary: "Read API health" })
  @ApiOkResponse({
    schema: {
      type: "object",
      required: ["schemaVersion", "status", "mode"],
      properties: {
        schemaVersion: { type: "integer", enum: [1] },
        status: { type: "string", enum: ["ok"] },
        mode: { type: "string", enum: ["demo"] },
      },
    },
  })
  readHealth() {
    return Object.freeze({ schemaVersion: 1 as const, status: "ok" as const, mode: this.mode });
  }
}
