import { describe, expect, it } from 'vitest';
import { isInSendWindow, lastScheduledSend, SEND_WINDOW_MS } from '../src/modules/digest/digest.schedule.js';

describe('Friday 10:00 Eastern schedule', () => {
  it('is 14:00 UTC in summer and 15:00 UTC in winter', () => {
    expect(lastScheduledSend(new Date('2026-10-30T16:00:00Z'))).toEqual({ at: new Date('2026-10-30T14:00:00Z'), sendDate: '2026-10-30' });
    expect(lastScheduledSend(new Date('2026-11-06T16:00:00Z'))).toEqual({ at: new Date('2026-11-06T15:00:00Z'), sendDate: '2026-11-06' });
    expect(lastScheduledSend(new Date('2027-03-12T16:00:00Z'))).toEqual({ at: new Date('2027-03-12T15:00:00Z'), sendDate: '2027-03-12' });
    expect(lastScheduledSend(new Date('2027-03-19T16:00:00Z'))).toEqual({ at: new Date('2027-03-19T14:00:00Z'), sendDate: '2027-03-19' });
  });

  it('starts exactly at 10:00 and not a minute before', () => {
    expect(lastScheduledSend(new Date('2026-10-30T14:00:00Z')).sendDate).toBe('2026-10-30');
    expect(lastScheduledSend(new Date('2026-10-30T13:59:59Z')).sendDate).toBe('2026-10-23');
    expect(lastScheduledSend(new Date('2026-11-06T14:59:59Z')).sendDate).toBe('2026-10-30');
    expect(lastScheduledSend(new Date('2026-11-06T15:00:00Z')).sendDate).toBe('2026-11-06');
  });

  it('uses the New York calendar date late on a Thursday and early on a Saturday', () => {
    // 01:00 UTC Saturday is still Friday evening in New York.
    expect(lastScheduledSend(new Date('2026-10-31T01:00:00Z')).sendDate).toBe('2026-10-30');
    // 03:00 UTC Friday is Thursday night in New York, so it belongs to the previous Friday.
    expect(lastScheduledSend(new Date('2026-10-30T03:00:00Z')).sendDate).toBe('2026-10-23');
  });

  it('keeps the same send for the rest of the week', () => {
    for (const day of ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-05']) expect(lastScheduledSend(new Date(`${day}T20:00:00Z`)).sendDate).toBe('2026-10-30');
  });

  it('is open for 24 hours after the scheduled time', () => {
    const at = new Date('2026-10-30T14:00:00Z').getTime();
    expect(isInSendWindow(new Date(at))).toBe(true);
    expect(isInSendWindow(new Date(at + SEND_WINDOW_MS - 1))).toBe(true);
    expect(isInSendWindow(new Date(at + SEND_WINDOW_MS))).toBe(false);
    expect(isInSendWindow(new Date('2026-11-03T12:00:00Z'))).toBe(false);
  });
});
