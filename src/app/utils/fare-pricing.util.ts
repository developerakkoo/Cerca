/**
 * Client-side mirror of backend farePricingEngine for offline fallback quotes.
 * Server POST /rides/calculate-fare remains the source of truth.
 */

import {
  FarePricingConfig,
  PricingConfigurations,
} from '../services/settings.service';

const roundMoney = (n: number) => Math.round(n * 100) / 100;

const parseHm = (hm: string): number | null => {
  const m = hm?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

const minutesInBand = (mod: number, start: number, end: number): boolean => {
  if (start === end) return true;
  if (start < end) return mod >= start && mod < end;
  return mod >= start || mod < end;
};

export const resolveTimeMultiplier = (
  date: Date,
  bands: FarePricingConfig['timeBands'],
  timezone: string
): { timeBandId: string; timeMultiplier: number } => {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone || 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const mod = hour * 60 + minute;
  for (const band of bands || []) {
    const s = parseHm(band.start);
    const e = parseHm(band.end);
    if (s === null || e === null) continue;
    if (minutesInBand(mod, s, e)) {
      return {
        timeBandId: band.id || 'band',
        timeMultiplier: Number(band.multiplier) > 0 ? Number(band.multiplier) : 1,
      };
    }
  }
  return { timeBandId: 'day', timeMultiplier: 1 };
};

export const calculateTieredDistanceFare = (
  distanceKm: number,
  tiers: FarePricingConfig['distanceTiers']
): number => {
  const d = Math.max(0, distanceKm);
  if (d === 0) return 0;
  const t1Max = tiers.tier1?.maxKm ?? 10;
  const t2Max = tiers.tier2?.maxKm ?? 20;
  const t3Max = tiers.tier3?.maxKm ?? 30;
  const r1 = tiers.tier1?.ratePerKm ?? 0;
  const r2 = tiers.tier2?.ratePerKm ?? 0;
  const r3 = tiers.tier3?.ratePerKm ?? 0;
  const rBeyond = tiers.beyondTier3RatePerKm ?? r3;
  let remaining = d;
  let total = 0;
  const km1 = Math.min(remaining, t1Max);
  total += km1 * r1;
  remaining -= km1;
  const km2 = Math.min(remaining, t2Max - t1Max);
  total += km2 * r2;
  remaining -= km2;
  const km3 = Math.min(remaining, t3Max - t2Max);
  total += km3 * r3;
  remaining -= km3;
  if (remaining > 0) total += remaining * rBeyond;
  return roundMoney(total);
};

export interface FallbackFareResult {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  subtotal: number;
  finalFare: number;
  minimumFareApplied: boolean;
  timeBandId?: string;
  timeMultiplier?: number;
}

export const calculateFallbackInstantFare = (params: {
  basePrice: number;
  distanceKm: number;
  durationMin: number;
  perMinuteRate: number;
  pricing: PricingConfigurations;
  at?: Date;
}): FallbackFareResult => {
  const { basePrice, distanceKm, durationMin, perMinuteRate, pricing } = params;
  const at = params.at ?? new Date();
  const minimumFare = pricing.minimumFare ?? 0;
  const fp = pricing.farePricing;
  const enabled = fp?.enabled === true;

  let distanceFare: number;
  let timeFare = roundMoney(Math.max(0, durationMin) * Math.max(0, perMinuteRate));
  let timeMultiplier = 1;
  let timeBandId = 'flat';

  if (enabled && fp) {
    distanceFare = calculateTieredDistanceFare(distanceKm, fp.distanceTiers);
    const band = resolveTimeMultiplier(at, fp.timeBands, fp.timezone || 'Asia/Kolkata');
    timeMultiplier = band.timeMultiplier;
    timeBandId = band.timeBandId;
    distanceFare = roundMoney(distanceFare * timeMultiplier);
    timeFare = roundMoney(timeFare * timeMultiplier);
  } else {
    distanceFare = roundMoney(distanceKm * (pricing.perKmRate || 0));
  }

  const baseFare = roundMoney(basePrice);
  const subtotal = roundMoney(baseFare + distanceFare + timeFare);
  const finalFare = roundMoney(Math.max(subtotal, minimumFare));

  return {
    baseFare,
    distanceFare,
    timeFare,
    subtotal,
    finalFare,
    minimumFareApplied: finalFare > subtotal,
    timeBandId,
    timeMultiplier,
  };
};
