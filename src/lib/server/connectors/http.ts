export type FetchJsonOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

type FetchWithTimeoutOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
};

export class FetchError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const isRedirectStatus = (status: number) =>
  status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

const isHttpMethodWithBody = (method: string) => {
  const normalized = method.toUpperCase();
  return normalized !== 'GET' && normalized !== 'HEAD';
};

const resolveRedirectUrl = (from: URL, location: string) => {
  try {
    return new URL(location, from);
  } catch {
    return null;
  }
};

export const fetchWithTimeout = async (
  url: string,
  init: RequestInit = {},
  options: FetchWithTimeoutOptions = {}
) => {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxRedirects = Math.min(8, Math.max(0, Number(options.maxRedirects ?? 3)));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const externalSignal = init.signal;
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let currentUrl: URL;
  try {
    currentUrl = new URL(url);
  } catch {
    clearTimeout(timeout);
    throw new Error('Invalid URL');
  }

  let currentInit: RequestInit = {
    ...init,
    redirect: 'manual',
    cache: init.cache ?? 'no-store',
    signal: controller.signal
  };

  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const res = await fetch(currentUrl.toString(), currentInit);
      if (!isRedirectStatus(res.status)) return res;

      const location = res.headers.get('location');
      if (!location) return res;

      const nextUrl = resolveRedirectUrl(currentUrl, location);
      if (!nextUrl) {
        throw new Error('Redirect response contained an invalid Location header');
      }

      if (nextUrl.origin !== currentUrl.origin) {
        throw new Error('Cross-origin redirects are not allowed');
      }

      const method = String(currentInit.method ?? 'GET').toUpperCase();
      const shouldSwitchToGet =
        res.status === 303 || ((res.status === 301 || res.status === 302) && isHttpMethodWithBody(method));

      currentUrl = nextUrl;
      currentInit = {
        ...currentInit,
        method: shouldSwitchToGet ? 'GET' : method,
        body: shouldSwitchToGet ? undefined : currentInit.body
      };
    }

    throw new Error('Too many redirects');
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchJson = async <T>(url: string, options: FetchJsonOptions = {}): Promise<T> => {
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.body
      },
      { timeoutMs: options.timeoutMs ?? 8000 }
    );

    if (!res.ok) {
      throw new FetchError(`Request failed with status ${res.status}`, res.status);
    }

    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof FetchError) throw error;

    const message = error instanceof Error ? error.message : 'Request failed';
    throw new FetchError(message, 0);
  }
};

export const fetchText = async (url: string, init: RequestInit = {}, options: FetchWithTimeoutOptions = {}) => {
  const res = await fetchWithTimeout(url, init, options);
  if (!res.ok) {
    throw new FetchError(`Request failed with status ${res.status}`, res.status);
  }
  return await res.text();
};
