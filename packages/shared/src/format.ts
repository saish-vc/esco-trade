/**
 * Format a UNIX timestamp (seconds) as ISO date-time string.
 */
export function formatIsoFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

/**
 * Format a price to the given precision.
 */
export function formatPrice(value: number, precision: number): string {
  return value.toFixed(precision);
}

/**
 * Format a percentage change with sign.
 */
export function formatPctChange(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "" : "";
  return `${sign}${value.toFixed(2)}%`;
}
