// The weekly email goes out Fridays at 10:00 in New York, so the clock time holds through daylight saving changes.
const TIME_ZONE = 'America/New_York';
export const SEND_HOUR = 10;
/** A send missed by more than this (server down all day) is skipped rather than sent late. */
export const SEND_WINDOW_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const localParts = (date: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
}).formatToParts(date).map(part => [part.type, part.value])) as Record<string, string>;

/** The most recent Friday 10:00 Eastern at or before `now`: its instant, and its New York calendar date. */
export function lastScheduledSend(now: Date): { at: Date; sendDate: string } {
  const local = localParts(now);
  let daysBack = (WEEKDAYS.indexOf(local.weekday ?? '') - 5 + 7) % 7;
  if (daysBack === 0 && Number(local.hour) < SEND_HOUR) daysBack = 7;
  const friday = new Date(Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day) - daysBack));
  // 10:00 Eastern is 14:00 UTC in summer and 15:00 UTC in winter; take whichever reads 10 in New York.
  const at = [14, 15].map(hour => new Date(Date.UTC(friday.getUTCFullYear(), friday.getUTCMonth(), friday.getUTCDate(), hour)))
    .find(candidate => Number(localParts(candidate).hour) === SEND_HOUR) ?? friday;
  return { at, sendDate: friday.toISOString().slice(0, 10) };
}

/** True from the scheduled Friday time until the send window closes. */
export const isInSendWindow = (now: Date) => now.getTime() - lastScheduledSend(now).at.getTime() < SEND_WINDOW_MS;
