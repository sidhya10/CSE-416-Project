// UTC date-only schedules stay anchored to the original date, including month ends.
export function cycleDate(start: Date, every: number, unit: string, index: number) {
  if (unit === 'days' || unit === 'weeks') return new Date(start.getTime() + index * every * (unit === 'weeks' ? 7 : 1) * 86_400_000);
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index * every * (unit === 'years' ? 12 : 1), 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(start.getUTCDate(), last));
  return target;
}
