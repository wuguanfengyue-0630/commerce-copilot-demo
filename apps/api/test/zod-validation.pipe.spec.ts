import { describe, expect, it } from "vitest";
import { z } from "zod";
import { RequestValidationError } from "../src/common/contract-boundary.ts";
import { ZodValidationPipe } from "../src/common/zod-validation.pipe.ts";

class SyntheticDto {
  static readonly schema = z.strictObject({ count: z.coerce.number().int().positive() });
  readonly count!: number;
}

describe("ZodValidationPipe", () => {
  it("executes the static schema convention and returns parsed data", () => {
    const pipe = new ZodValidationPipe();

    expect(
      pipe.transform({ count: "2" }, { type: "body", metatype: SyntheticDto, data: undefined }),
    ).toEqual({ count: 2 });
  });

  it("throws a RequestValidationError for invalid static-schema input", () => {
    const pipe = new ZodValidationPipe();

    expect(() =>
      pipe.transform({ count: 0 }, { type: "body", metatype: SyntheticDto, data: undefined }),
    ).toThrow(RequestValidationError);
  });

  it("passes values through when a metatype has no static schema", () => {
    const pipe = new ZodValidationPipe();
    const value = { untouched: true };

    expect(pipe.transform(value, { type: "body", metatype: Object, data: undefined })).toBe(value);
  });
});
