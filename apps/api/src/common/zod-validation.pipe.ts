import { type ArgumentMetadata, Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodType } from "zod";

type ZodDto = Readonly<{ schema?: ZodType }>;

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = (metadata.metatype as ZodDto | undefined)?.schema;
    return schema === undefined ? value : schema.parse(value);
  }
}
