export interface Clock {
  now(): Date;
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
