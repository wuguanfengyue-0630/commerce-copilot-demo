import { type ArgumentMetadata, Injectable, type PipeTransform } from "@nestjs/common";
import { ZodError, type ZodType } from "zod";
import { RequestValidationError } from "./contract-boundary.ts";

type ZodDto = Readonly<{ schema?: ZodType }>;

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly explicitSchema?: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = this.explicitSchema ?? (metadata.metatype as ZodDto | undefined)?.schema;
    if (schema === undefined) return value;
    try {
      return schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) throw new RequestValidationError(error);
      throw error;
    }
  }
}
