/**
 * Client-side mirror of backend farePricingEngine for offline fallback quotes.
 * Server POST /rides/calculate-fare remains the source of truth.
 */

import {
  FarePricingConfig,
  PricingConfigurations,
  VehicleDistanceTiers,
  VehicleServices,
} from '../services/settings.service';

const TIER1_MAX_KM = 5;
const TIER2_MAX_KM = 10;

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
  tiers: VehicleDistanceTiers
): number => {
  const d = Math.max(0, distanceKm);
  if (d === 0) return 0;
  const t1Max = tiers.tier1?.maxKm ?? TIER1_MAX_KM;
  const t2Max = tiers.tier2?.maxKm ?? TIER2_MAX_KM;
  const r1 = tiers.tier1?.ratePerKm ?? 0;
  const r2 = tiers.tier2?.ratePerKm ?? 0;
  const rBeyond = tiers.beyondTier2RatePerKm ?? r2;
  let remaining = d;
  let total = 0;
  const km1 = Math.min(remaining, t1Max);
  total += km1 * r1;
  remaining -= km1;
  const km2 = Math.min(remaining, t2Max - t1Max);
  total += km2 * r2;
  remaining -= km2;
  if (remaining > 0) total += remaining * rBeyond;
  return roundMoney(total);
};

const defaultVehicleDistanceTiers = (
  vehicleServiceKey: 'cercaZip' | 'cercaGlide' | 'cercaTitan',
  perKmRate: number
): VehicleDistanceTiers => {
  const vehicleRate =
    vehicleServiceKey === 'cercaZip' ? 10 : vehicleServiceKey === 'cercaGlide' ? 12 : 16;
  const rate = vehicleRate || perKmRate;
  return {
    tier1: { maxKm: TIER1_MAX_KM, ratePerKm: rate },
    tier2: { maxKm: TIER2_MAX_KM, ratePerKm: rate },
    beyondTier2RatePerKm: rate,
  };
};

export const resolveVehicleDistanceTiers = (
  vehicleServiceKey: 'cercaZip' | 'cercaGlide' | 'cercaTitan',
  vehicleServices: VehicleServices | null | undefined,
  perKmRate: number
): VehicleDistanceTiers => {
  const svc = vehicleServices?.[vehicleServiceKey];
  const raw = svc?.distanceTiers;
  if (raw?.tier1?.ratePerKm != null || raw?.tier2?.ratePerKm != null || raw?.beyondTier2RatePerKm != null) {
    const r1 = raw.tier1?.ratePerKm ?? perKmRate;
    const r2 = raw.tier2?.ratePerKm ?? r1;
    const rBeyond = raw.beyondTier2RatePerKm ?? r2;
    return {
      tier1: { maxKm: TIER1_MAX_KM, ratePerKm: r1 },
      tier2: { maxKm: TIER2_MAX_KM, ratePerKm: r2 },
      beyondTier2RatePerKm: rBeyond,
    };
  }
  return defaultVehicleDistanceTiers(vehicleServiceKey, perKmRate);
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
  vehicleServiceKey?: 'cercaZip' | 'cercaGlide' | 'cercaTitan';
  vehicleServices?: VehicleServices | null;
  at?: Date;
}): FallbackFareResult => {
  const {
    basePrice,
    distanceKm,
    durationMin,
    perMinuteRate,
    pricing,
    vehicleServiceKey = 'cercaZip',
    vehicleServices,
  } = params;
  const at = params.at ?? new Date();
  const minimumFare = pricing.minimumFare ?? 0;
  const fp = pricing.farePricing;
  const enabled = fp?.enabled === true;
  const perKmRate = pricing.perKmRate || 0;

  let distanceFare: number;
  let timeFare = roundMoney(Math.max(0, durationMin) * Math.max(0, perMinuteRate));
  let timeMultiplier = 1;
  let timeBandId = 'flat';

  if (enabled && fp) {
    const tiers = resolveVehicleDistanceTiers(
      vehicleServiceKey,
      vehicleServices,
      perKmRate
    );
    distanceFare = calculateTieredDistanceFare(distanceKm, tiers);
    const band = resolveTimeMultiplier(at, fp.timeBands, fp.timezone || 'Asia/Kolkata');
    timeMultiplier = band.timeMultiplier;
    timeBandId = band.timeBandId;
    distanceFare = roundMoney(distanceFare * timeMultiplier);
    timeFare = roundMoney(timeFare * timeMultiplier);
  } else {
    distanceFare = roundMoney(distanceKm * perKmRate);
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
