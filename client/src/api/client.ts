const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
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
