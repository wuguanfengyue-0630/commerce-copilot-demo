import "reflect-metadata";

import type { DemoRuntime } from "@commerce-copilot/application";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { createAppModule } from "./app.module.ts";
import { ApiErrorFilter } from "./common/api-error.filter.ts";
import { ZodValidationPipe } from "./common/zod-validation.pipe.ts";

export type CreateAppOptions = Readonly<{ mode: "demo"; runtime?: DemoRuntime }>;

const developmentOrigins = new Set(["http://127.0.0.1:5173", "http://localhost:5173"]);

export async function createApp(options: CreateAppOptions): Promise<NestFastifyApplication> {
  if (options.mode !== "demo") {
    throw new Error(`Unsupported runtime mode: ${String(options.mode)}`);
  }

  const adapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(createAppModule(options), adapter, {
    abortOnError: false,
    logger: false,
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new ApiErrorFilter());
  await app.register(helmet);

  if (process.env.NODE_ENV === "development") {
    await app.register(cors, {
      credentials: true,
      origin(origin, callback) {
        callback(null, origin !== undefined && developmentOrigins.has(origin));
      },
    });
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Commerce Copilot API")
    .setVersion("1")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document, { ui: false });
  adapter.getInstance().get("/api/docs", (_request, reply) => reply.redirect("/api/docs-json"));
  await app.init();
  return app;
}
