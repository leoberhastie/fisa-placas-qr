const MIN_DECIMALS = 2;
const MAX_DECIMALS = 5;

export function formatPercent(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude === 0 || magnitude >= 1) {
    return `${value.toFixed(MIN_DECIMALS)}%`;
  }
  const exponent = Number(magnitude.toExponential().split('e')[1]);
  const decimals = Math.min(MAX_DECIMALS, Math.max(MIN_DECIMALS, -exponent));
  return `${value.toFixed(decimals)}%`;
}
