export const CURRENCIES = ["CNY"] as const;

export type Currency = (typeof CURRENCIES)[number];

declare const moneyBrand: unique symbol;

export type Money = Readonly<{
  amountMinor: number;
  currency: Currency;
  [moneyBrand]: true;
}>;

export function createMoney(amountMinor: number, currency: Currency): Money {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError("Money amountMinor must be a non-negative safe integer");
  }

  if (currency !== "CNY") {
    throw new RangeError("Money currency must be CNY");
  }

  return Object.freeze({ amountMinor, currency }) as Money;
}
