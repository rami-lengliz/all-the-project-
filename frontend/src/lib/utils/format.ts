export function formatTnd(amount: number) {
  // Keep it simple/deterministic: "123.45 TND"
  const value = Number.isFinite(amount) ? amount : 0;
  return `${value.toFixed(2)} TND`;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

