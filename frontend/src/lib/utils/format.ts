export function formatTnd(amount: number) {
  // Keep it simple/deterministic: "123.45 TND"
  const value = Number.isFinite(amount) ? amount : 0;
  return `${value.toFixed(2)} TND`;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('fr-TN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date | null | undefined) {
  if (!date) return '-';
  return new Intl.DateTimeFormat('fr-TN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(date));
}
