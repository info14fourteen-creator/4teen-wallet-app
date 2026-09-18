export class ReadResponseError extends Error {
  status: number;
  responseError: string;
  constructor(status: number, responseError: string) {
    super(`HTTP ${status}`);
    this.status = status;
    this.responseError = responseError;
  }
}

export async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new ReadResponseError(response.status, typeof payload?.error === 'string' ? payload.error : '');
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
