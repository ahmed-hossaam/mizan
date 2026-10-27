export const MAX_MINOR_UNITS = Number.MAX_SAFE_INTEGER;

export function assertSafeAmount(amount: number, label = "Amount"): number {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${label} must be a positive integer in minor units.`);
  }
  if (!Number.isSafeInteger(amount) || amount > MAX_MINOR_UNITS) {
    throw new Error(`${label} is outside the supported range.`);
  }
  return amount;
}

export function toMinorNumber(value: bigint | number | string): number {
  const amount = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isSafeInteger(amount)) {
    throw new Error("The stored amount exceeds the supported safe range.");
  }
  return amount;
}

export function amountAsDecimal(amount: number): string {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const formatted = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${formatted}` : formatted;
}
