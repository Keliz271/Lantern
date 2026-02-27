import { env } from '$env/dynamic/private';
import { fetchJson, FetchError } from './http';
import { canFallbackToEnvSecret } from '$serverlib/security';

type ArrQueueStatus = {
  totalCount?: number;
  totalRecords?: number;
  total?: number;
  count?: number;
  records?: unknown[];
};

type ArrPage<T> = {
  totalRecords?: number;
  totalCount?: number;
  records?: T[];
  total?: number;
  count?: number;
};

export type ArrMetricType =
  | 'wanted'
  | 'missing'
  | 'queued'
  | 'movies'
  | 'books'
  | 'series'
  | 'issues';

export type ArrMetricResult = {
  value: number;
  label: string;
};

type ArrOptions = {
  baseUrl?: string;
  apiKey?: string;
};

const getBaseUrl = (source: 'radarr' | 'readarr' | 'sonarr', override?: string) => {
  if (override) return override;
  if (source === 'radarr') return env.RADARR_URL;
  if (source === 'sonarr') return env.SONARR_URL;
  return env.READARR_URL;
};

const getApiKey = (source: 'radarr' | 'readarr' | 'sonarr', override?: string) => {
  if (override) return override;
  if (source === 'radarr') return env.RADARR_API_KEY;
  if (source === 'sonarr') return env.SONARR_API_KEY;
  return env.READARR_API_KEY;
};

const normalizeBase = (value?: string) => {
  if (!value) return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

type ArrCountPayload = ArrQueueStatus | ArrPage<unknown>;

const getCount = (payload: ArrCountPayload) => {
  return (
    Number(payload.totalCount ?? 0) ||
    Number(payload.totalRecords ?? 0) ||
    Number(payload.total ?? 0) ||
    Number(payload.count ?? 0)
  );
};

const extractCount = (payload: unknown) => {
  if (Array.isArray(payload)) {
    return payload.length;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const typed = payload as ArrCountPayload;
  const pageInfo = (typed as { pageInfo?: { totalRecords?: number; totalCount?: number; records?: number } }).pageInfo;
  if (pageInfo) {
    const infoCount = Number(pageInfo.totalCount ?? pageInfo.totalRecords ?? pageInfo.records ?? 0);
    if (infoCount > 0) {
      return infoCount;
    }
  }

  const count = getCount(typed);
  if (count > 0) {
    return count;
  }

  if (Array.isArray(typed.records)) {
    return Number(typed.totalRecords ?? typed.records.length ?? 0);
  }

  const hasCountKeys =
    Object.prototype.hasOwnProperty.call(typed, 'totalCount') ||
    Object.prototype.hasOwnProperty.call(typed, 'totalRecords') ||
    Object.prototype.hasOwnProperty.call(typed, 'total') ||
    Object.prototype.hasOwnProperty.call(typed, 'count');

  return hasCountKeys ? count : null;
};

const fetchCountFromEndpoints = async (
  baseUrl: string,
  apiKey: string,
  endpoints: string[]
) => {
  for (const endpoint of endpoints) {
    try {
      const payload = await fetchJson<unknown>(`${baseUrl}${endpoint}`, {
        headers: { 'X-Api-Key': apiKey }
      });
      const count = extractCount(payload);
      if (count !== null) {
        return count;
      }
    } catch (error) {
      if (error instanceof FetchError && error.status === 404) {
        continue;
      }
      throw error;
    }
  }

  return 0;
};

const fetchQueueCount = async (baseUrl: string, apiKey: string) => {
  return fetchCountFromEndpoints(baseUrl, apiKey, [
    '/api/v3/queue/status',
    '/api/v1/queue/status',
    '/api/v3/queue?page=1&pageSize=1',
    '/api/v1/queue?page=1&pageSize=1'
  ]);
};

const fetchMissingCount = async (baseUrl: string, apiKey: string) => {
  return fetchCountFromEndpoints(baseUrl, apiKey, [
    '/api/v3/wanted/missing?page=1&pageSize=1',
    '/api/v1/wanted/missing?page=1&pageSize=1'
  ]);
};

const fetchIssuesCount = async (baseUrl: string, apiKey: string) => {
  return fetchCountFromEndpoints(baseUrl, apiKey, ['/api/v3/health', '/api/v1/health']);
};

const fetchLibraryCount = async (
  source: 'radarr' | 'readarr' | 'sonarr',
  baseUrl: string,
  apiKey: string
) => {
  if (source === 'radarr') {
    return fetchCountFromEndpoints(baseUrl, apiKey, [
      '/api/v3/movie?page=1&pageSize=1',
      '/api/v1/movie?page=1&pageSize=1'
    ]);
  }

  if (source === 'sonarr') {
    return fetchCountFromEndpoints(baseUrl, apiKey, [
      '/api/v3/series?page=1&pageSize=1',
      '/api/v1/series?page=1&pageSize=1'
    ]);
  }

  return fetchCountFromEndpoints(baseUrl, apiKey, [
    '/api/v1/book?page=1&pageSize=1',
    '/api/v3/book?page=1&pageSize=1'
  ]);
};

export const fetchArrMetric = async (
  source: 'radarr' | 'readarr' | 'sonarr',
  metric: ArrMetricType,
  options: ArrOptions = {}
): Promise<ArrMetricResult> => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(getBaseUrl(source));
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? String(getApiKey(source) ?? '').trim() : '');

  if (!baseUrl || !apiKey) {
    throw new Error(`${source} base URL or API key is missing`);
  }

  if (metric === 'queued') {
    return { value: await fetchQueueCount(baseUrl, apiKey), label: 'Queued' };
  }

  if (metric === 'wanted') {
    return { value: await fetchMissingCount(baseUrl, apiKey), label: 'Wanted' };
  }

  if (metric === 'missing') {
    return { value: await fetchMissingCount(baseUrl, apiKey), label: 'Missing' };
  }

  if (metric === 'movies') {
    if (source !== 'radarr') {
      throw new Error('Movies metric is only available for Radarr');
    }
    return { value: await fetchLibraryCount(source, baseUrl, apiKey), label: 'Movies' };
  }

  if (metric === 'books') {
    if (source !== 'readarr') {
      throw new Error('Books metric is only available for Readarr');
    }
    return { value: await fetchLibraryCount(source, baseUrl, apiKey), label: 'Books' };
  }

  if (metric === 'series') {
    if (source !== 'sonarr') {
      throw new Error('Series metric is only available for Sonarr');
    }
    return { value: await fetchLibraryCount(source, baseUrl, apiKey), label: 'Series' };
  }

  return { value: await fetchIssuesCount(baseUrl, apiKey), label: 'Issues' };
};
