export const toIsoDate = (value: Date) => value.toISOString();

export function relativeTime(fromMs: number, nowMs = Date.now()): string {
  const diffMs = Math.max(0, nowMs - fromMs);
  const minute = 60000, hour = 3600000, day = 86400000;
  if (diffMs < hour) return diffMs < minute ? 'just now' : `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  const days = Math.floor(diffMs / day);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(fromMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
