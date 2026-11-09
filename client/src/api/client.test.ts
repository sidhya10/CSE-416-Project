import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest, invalidateApiReads } from './client';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); invalidateApiReads(); });
it('deduplicates simultaneous reads, expires cached data, and invalidates after writes', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockImplementation(async () => Response.json({ value: fetcher.mock.calls.length }));
  vi.stubGlobal('fetch', fetcher);
  const [first, same] = await Promise.all([apiRequest('/groups'), apiRequest('/groups')]);
  expect(same).toEqual(first); expect(fetcher).toHaveBeenCalledTimes(1);
  await apiRequest('/groups'); expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(15_001);
  await apiRequest('/groups'); expect(fetcher).toHaveBeenCalledTimes(2);
  await apiRequest('/expenses/e', { method: 'DELETE' });
  await apiRequest('/groups'); expect(fetcher).toHaveBeenCalledTimes(4);
});
it('does not reuse private cached data or in-flight results after logout', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
    .mockImplementation(async () => Response.json({ account: 'new' }));
  vi.stubGlobal('fetch', fetcher);
  const old = apiRequest('/budgets/personal');
  await apiRequest('/auth/logout', { method: 'POST' });
  finish(Response.json({ account: 'old' })); await old;
  expect(await apiRequest('/budgets/personal')).toEqual({ account: 'new' });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('does not cache failed requests', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ error: 'offline' }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  vi.stubGlobal('fetch', fetcher);
  await expect(apiRequest('/groups')).rejects.toThrow('offline');
  expect(await apiRequest('/groups')).toEqual({ ok: true });
});

it('revalidates on visibility changes so other members’ updates are not masked by the TTL', async () => {
  const fetcher = vi.fn().mockImplementation(async () => Response.json({ revision: fetcher.mock.calls.length }));
  vi.stubGlobal('fetch', fetcher);
  await apiRequest('/groups');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(await apiRequest('/groups')).toEqual({ revision: 2 });
});
