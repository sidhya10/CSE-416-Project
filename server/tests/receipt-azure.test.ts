import { afterEach, it, expect, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { analyzeReceipt } from '../src/modules/receipts/receipt.azure.js';
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn().mockResolvedValue(undefined) }));
const original = { ...env };
afterEach(() => { vi.unstubAllGlobals(); Object.assign(env, original); });
it('submits only page 1, polls the operation and never resubmits when polling is throttled', async () => {
  env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = 'https://test.cognitiveservices.azure.com';
  env.AZURE_DOCUMENT_INTELLIGENCE_KEY = 'test-key';
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 202, headers: { 'operation-location': 'https://test.cognitiveservices.azure.com/result' } }))
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(Response.json({ status: 'succeeded', analyzeResult: { documents: [] } }));
  vi.stubGlobal('fetch', fetcher);
  await analyzeReceipt('dGVzdA==');
  expect(String(fetcher.mock.calls[0]?.[0])).toContain('pages=1');
  expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1);
});
it('does not send the key to a foreign operation URL', async () => {
  env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = 'https://test.cognitiveservices.azure.com';
  const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202, headers: { 'operation-location': 'https://other.example/result' } }));
  vi.stubGlobal('fetch', fetcher);
  await expect(analyzeReceipt('dGVzdA==')).rejects.toThrow('unexpected');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
