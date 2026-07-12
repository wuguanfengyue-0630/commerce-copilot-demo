import type { ApiResponseOptions } from "@nestjs/swagger";
import { type ZodType, z } from "zod";

type SwaggerSchema = Extract<ApiResponseOptions, { schema: unknown }>["schema"];
type JsonSchema = Record<string, unknown>;

export function zodToOpenApiSchema(schema: ZodType): SwaggerSchema {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" });
  return normalizeSchema(jsonSchema) as SwaggerSchema;
}

function normalizeSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeSchema);
  if (value === null || typeof value !== "object") return value;
  const source = value as JsonSchema;
  const normalized: JsonSchema = {};
  for (const [key, nested] of Object.entries(source)) {
    if (key === "$schema" || key === "anyOf" || key === "const") continue;
    normalized[key] = normalizeSchema(nested);
  }
  if ("const" in source) normalized.enum = [source.const];
  const anyOf = Array.isArray(source.anyOf)
    ? source.anyOf.map(normalizeSchema).filter(isJsonSchema)
    : undefined;
  if (anyOf !== undefined) {
    const nonNull = anyOf.filter((candidate) => candidate.type !== "null");
    const nullable = nonNull.length !== anyOf.length;
    if (nonNull.length === 1) Object.assign(normalized, nonNull[0]);
    else {
      normalized.oneOf = nonNull;
      if (nonNull.every((candidate) => candidate.type === "object")) normalized.type = "object";
    }
    if (nullable) normalized.nullable = true;
  }
  if (Array.isArray(normalized.type) && normalized.type.includes("null")) {
    const nonNullTypes = normalized.type.filter((type) => type !== "null");
    normalized.type = nonNullTypes.length === 1 ? nonNullTypes[0] : nonNullTypes;
    normalized.nullable = true;
  }
  if (
    Array.isArray(normalized.oneOf) &&
    normalized.oneOf.filter(isJsonSchema).every((candidate) => candidate.type === "object")
  ) {
    normalized.type = "object";
  }
  return normalized;
}

function isJsonSchema(value: unknown): value is JsonSchema {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
