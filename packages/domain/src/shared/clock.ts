export interface Clock {
  now(): Date;
}

declare const isoTimestampBrand: unique symbol;

export type IsoTimestamp = string & {
  readonly [isoTimestampBrand]: "IsoTimestamp";
};

export function toIsoTimestamp(value: Date | string): IsoTimestamp {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid timestamp");
  }

  return date.toISOString() as IsoTimestamp;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  readonly #fixedTime: Date;

  constructor(fixedTime: Date) {
    this.#fixedTime = new Date(fixedTime.getTime());
  }

  now(): Date {
    return new Date(this.#fixedTime.getTime());
  }
}
