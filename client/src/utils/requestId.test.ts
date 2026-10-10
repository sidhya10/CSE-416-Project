import { afterEach, expect, it, vi } from 'vitest';
import { createRequestId } from './requestId';
afterEach(() => vi.unstubAllGlobals());
it('generates distinct UUID v4 request keys without randomUUID', () => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  vi.stubGlobal('crypto', { getRandomValues });
  const keys = Array.from({ length: 100 }, createRequestId);
  expect(new Set(keys).size).toBe(100);
  for (const key of keys) expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
