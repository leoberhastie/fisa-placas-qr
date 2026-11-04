export function toDateKey(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isWithinDateRange(iso: string, from: string, to: string): boolean {
  const key = toDateKey(iso);
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}
