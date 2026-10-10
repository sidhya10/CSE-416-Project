import { setTimeout as delay } from 'node:timers/promises';
import { env } from '../../config/env.js';
import { normalizeReceipt, type AzureResult } from './receipt.normalize.js';

export async function analyzeReceipt(base64Source: string) {
  const endpoint = new URL(env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT!);
  const headers = { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': env.AZURE_DOCUMENT_INTELLIGENCE_KEY! };
  const signal = AbortSignal.timeout(90_000);
  const url = new URL('/documentintelligence/documentModels/prebuilt-receipt:analyze?api-version=2024-11-30&pages=1', endpoint);
  // Never retry a POST: a lost response may already have consumed a page.
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ base64Source }), signal, redirect: 'error' });
  if (response.status !== 202) throw new Error(response.status === 429 || response.status === 403 ? 'Azure quota or access limit reached. Check your F0 resource in Azure Portal.' : 'Azure could not accept the receipt. Check the file and server Azure configuration.');
  const location = response.headers.get('operation-location');
  if (!location) throw new Error('Azure did not return a scan operation.');
  const operation = new URL(location);
  if (operation.origin !== endpoint.origin) throw new Error('Azure returned an unexpected operation address.');
  let wait = Math.max(1500, Number(response.headers.get('retry-after') || 0) * 1000);
  while (!signal.aborted) {
    await delay(Math.min(wait, 10_000), undefined, { signal });
    const polled = await fetch(operation, { headers, signal, redirect: 'error' });
    wait = Math.max(1500, Number(polled.headers.get('retry-after') || 0) * 1000);
    if (polled.status === 429) continue;
    if (!polled.ok) throw new Error('Azure could not retrieve the receipt scan.');
    const body = await polled.json() as { status?: string; analyzeResult?: AzureResult };
    if (body.status === 'succeeded') return normalizeReceipt(body.analyzeResult ?? {});
    if (body.status === 'failed' || body.status === 'canceled') throw new Error('Azure could not read this receipt. Enter items manually or use a clearer photo.');
  }
  throw new Error('Receipt scan timed out.');
}
