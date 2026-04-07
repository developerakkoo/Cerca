/** Mirrors server `pickupWaitPricing.js` for rider-facing estimates only. */

export interface PickupWaitPolicyPreview {
  pickupWaitFreeMinutes: number;
  pickupWaitTier1EndMinute: number;
  pickupWaitTier1RatePerMin: number;
  pickupWaitTier2RatePerMin: number;
}

export const DEFAULT_PICKUP_WAIT_POLICY_PREVIEW: PickupWaitPolicyPreview = {
  pickupWaitFreeMinutes: 5,
  pickupWaitTier1EndMinute: 8,
  pickupWaitTier1RatePerMin: 4,
  pickupWaitTier2RatePerMin: 2,
};

export function roundMoney(n: number): number {
  return Math.round(Number(n || 0) * 100) / 100;
}

export function computePickupWaitPreview(
  waitSeconds: number,
  policy: PickupWaitPolicyPreview = DEFAULT_PICKUP_WAIT_POLICY_PREVIEW
): {
  waitSeconds: number;
  waitMinutesCeil: number;
  tier1BillableMinutes: number;
  tier2BillableMinutes: number;
  totalPickupWaitCharge: number;
} {
  const free = policy.pickupWaitFreeMinutes;
  const t1End = policy.pickupWaitTier1EndMinute;
  const r1 = policy.pickupWaitTier1RatePerMin;
  const r2 = policy.pickupWaitTier2RatePerMin;

  const sec = Math.max(0, Math.floor(Number(waitSeconds) || 0));
  const waitMinutesCeil = sec === 0 ? 0 : Math.ceil(sec / 60);

  let tier1BillableMinutes = 0;
  let tier2BillableMinutes = 0;

  if (waitMinutesCeil <= free) {
    tier1BillableMinutes = 0;
    tier2BillableMinutes = 0;
  } else {
    const cappedForTier1 = Math.min(waitMinutesCeil, t1End);
    tier1BillableMinutes = Math.max(0, cappedForTier1 - free);
    if (waitMinutesCeil > t1End) {
      tier2BillableMinutes = waitMinutesCeil - t1End;
    }
  }

  const amountTier1 = roundMoney(tier1BillableMinutes * r1);
  const amountTier2 = roundMoney(tier2BillableMinutes * r2);
  const totalPickupWaitCharge = roundMoney(amountTier1 + amountTier2);

  return {
    waitSeconds: sec,
    waitMinutesCeil,
    tier1BillableMinutes,
    tier2BillableMinutes,
    totalPickupWaitCharge,
  };
}
