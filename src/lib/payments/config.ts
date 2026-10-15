// Currencies that can be funded through Paystack, with sensible limits and quick amounts.
// Your Paystack account must have each currency enabled. Remove any you do not use.
const FUNDING = {
  NGN: { min: 100, max: 5_000_000, presets: [1000, 5000, 10000] },
} as const;

export type FundingConfig = { min: number; max: number; presets: readonly number[] };

export function fundingConfig(currency: string): FundingConfig | null {
  return (FUNDING as Record<string, FundingConfig>)[currency.trim().toUpperCase()] ?? null;
}

export const CURRENCY_OPTIONS = Object.keys(FUNDING);
