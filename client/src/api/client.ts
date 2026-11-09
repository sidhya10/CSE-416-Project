const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const reads = new Map<string, { expires: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
let generation = 0;
export function invalidateApiReads() { generation++; reads.clear(); pending.clear(); }
// Returning to the app must see changes made by other members, even within the TTL.
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (!document.hidden) invalidateApiReads();
});

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const cacheable = method === 'GET' && !path.startsWith('/auth/') && !options.signal;
  if (method !== 'GET') invalidateApiReads();
  const key = `${apiBase}${path}`;
  if (cacheable) {
    const cached = reads.get(key);
    if (cached && cached.expires > Date.now()) return cached.value as T;
    const running = pending.get(key);
    if (running) return running as Promise<T>;
  }
  const started = generation;
  const operation = request<T>(path, options).then(value => {
    if (cacheable && started === generation) {
      if (reads.size >= 100) reads.delete(reads.keys().next().value!);
      reads.set(key, { value, expires: Date.now() + 15_000 });
    }
    return value;
  }).finally(() => {
    if (started === generation) pending.delete(key);
    if (method !== 'GET') invalidateApiReads();
  });
  if (cacheable) pending.set(key, operation);
  return operation;
}

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    credentials: 'include',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(body.error || 'Something went wrong', response.status);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

/** Fetches a file (such as a CSV export) with the session cookie and returns it with the server's suggested filename. */
export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(`${apiBase}${path}`, { credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new ApiError(body.error || 'Something went wrong', response.status);
  }
  const filename = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? 'download.csv';
  return { blob: await response.blob(), filename };
}
