// src/services/mining.utils.ts
export const BASE_RATE_PER_HOUR = 0.05; // VAD per hour baseline
export const BOOST_DURATION_MINUTES = 10; // boost lasts 10 minutes
export const BOOST_MULTIPLIER = 2; // 2x multiplier
export const MAX_BOOSTS_PER_24H = 3;
export const MAX_DAILY_REWARDS_PER_24H = 3;
export const DAILY_REWARD_AMOUNT = 0.1; // VAD
export const SESSION_DURATION_HOURS = 24; // session max duration

// userCountFactor: maps active user count -> multiplier (<=1). 
// Example: more users -> lower factor. Keep it smooth and >0.
export function userCountFactor(activeUsers: number): number {
  if (!activeUsers || activeUsers <= 1) return 1;
  // scale down with sqrt to avoid too-fast drop
  const factor = 1 / Math.sqrt(activeUsers);
  return Math.max(0.2, Number(factor.toFixed(3))); // clamp to 0.2 min
}

/**
 * earnedForMinutes:
 * compute earned VAD for given minutes using hourly base rate and multiplier.
 * - minutes: number of minutes
 * - baseHourRate: VAD per hour baseline
 * - multiplier: boost multiplier (1 or BOOST_MULTIPLIER)
 * - uFactor: additional user factor if needed (not used if baseHourRate already contains factor)
 */
export function earnedForMinutes(
  minutes: number,
  baseHourRate: number,
  multiplier = 1,
  uFactor = 1
): number {
  if (minutes <= 0) return 0;
  const hours = minutes / 60;
  const earned = hours * baseHourRate * multiplier * uFactor;
  return earned;
}

export function roundVAD(value: number) {
  return Math.round(Number(value) * 10000) / 10000; // 4 decimal places
}

/** Helper to compute boost expiry timestamp */
export function boostExpiryFrom(startIso: string) {
  const start = new Date(startIso);
  return new Date(start.getTime() + BOOST_DURATION_MINUTES * 60 * 1000).toISOString();
}
