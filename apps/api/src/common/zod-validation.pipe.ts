import { type ArgumentMetadata, Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

type ZodDto = Readonly<{ schema?: ZodType }>;

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly explicitSchema?: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = this.explicitSchema ?? (metadata.metatype as ZodDto | undefined)?.schema;
    return schema === undefined ? value : schema.parse(value);
  }
}
