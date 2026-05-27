/** Format for UI display only — do not use for payment API payloads. */
export function formatInrDisplay(amount: number | null | undefined): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

export function formatInrWithSymbol(amount: number | null | undefined): string {
  return `₹${formatInrDisplay(amount)}`;
}

/** Numeric value at 2dp (for bindings needing a number, not a string). */
export function roundInrToPaise(amount: number | null | undefined): number {
  return Math.round((Number(amount) || 0) * 100) / 100;
}
