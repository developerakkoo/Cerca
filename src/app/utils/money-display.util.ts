/** Nearest whole rupee for UI display only — do not use for payment API payloads. */
export function roundInrDisplay(amount: number | null | undefined): number {
  return Math.round(Number(amount) || 0);
}

export function formatInrDisplay(amount: number | null | undefined): string {
  return String(roundInrDisplay(amount));
}

export function formatInrWithSymbol(amount: number | null | undefined): string {
  return `₹${formatInrDisplay(amount)}`;
}
