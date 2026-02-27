import { env } from '$env/dynamic/private';
import { fetchJson } from './http';
import { canFallbackToEnvSecret } from '$serverlib/security';

type SeerrRequestResponse = {
  results?: SeerrRequestItemRaw[] | number;
  pageInfo?: {
    totalResults?: number;
    results?: number;
  };
  totalResults?: number;
};

type SeerrRequestItemRaw = {
  id?: number;
  type?: 'movie' | 'tv';
  requestedBy?: {
    displayName?: string;
    username?: string;
  };
  media?: {
    status?: number;
    tmdbId?: number;
    mediaType?: 'movie' | 'tv';
  };
};

type SeerrMediaDetails = {
  title?: string;
  name?: string;
  posterPath?: string;
  backdropPath?: string;
};

export type SeerrMetricType = 'requests' | 'pending';
const metricLabelMap: Record<
  SeerrMetricType | 'approved' | 'available' | 'processing' | 'unavailable',
  string
> = {
  requests: 'Requests',
  pending: 'Pending',
  approved: 'Approved',
  available: 'Available',
  processing: 'Processing',
  unavailable: 'Unavailable'
};

export type SeerrMetricTypeExtended =
  | SeerrMetricType
  | 'approved'
  | 'available'
  | 'processing'
  | 'unavailable';

export type SeerrRequestItem = {
  id: string;
  title: string;
  mediaType: 'movie' | 'tv';
  mediaLabel: 'Movie' | 'TV';
  status: 'pending' | 'processing' | 'partial' | 'available' | 'declined' | 'deleted' | 'unknown';
  statusText: string;
  requestedBy: string;
  posterUrl?: string;
  backdropUrl?: string;
  href?: string;
};

const normalizeBase = (value?: string) => {
  if (!value) return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const getBaseUrl = (override?: string) => override ?? env.SEERR_URL;
const getApiKey = (override?: string) => override ?? env.SEERR_API_KEY;
const mediaCache = new Map<string, { expiresAt: number; value: SeerrMediaDetails }>();
const mediaCacheTtlMs = 10 * 60 * 1000;

const getCount = (payload: SeerrRequestResponse) =>
  Number(
    payload.pageInfo?.totalResults ??
      payload.totalResults ??
      payload.pageInfo?.results ??
      (typeof payload.results === 'number' ? payload.results : 0)
  );

export const fetchSeerrMetric = async (
  metric: SeerrMetricTypeExtended,
  options: { baseUrl?: string; apiKey?: string } = {}
) => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(getBaseUrl());
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? String(getApiKey() ?? '').trim() : '');

  if (!baseUrl || !apiKey) {
    throw new Error('Seerr base URL or API key is missing');
  }

  const filterMetric = metric === 'unavailable' ? 'declined' : metric;
  const filter = filterMetric === 'requests' ? '' : `&filter=${encodeURIComponent(filterMetric)}`;
  const url = `${baseUrl}/api/v1/request?take=1&skip=0${filter}`;
  const payload = await fetchJson<SeerrRequestResponse>(url, {
    headers: { 'X-Api-Key': apiKey }
  });

  return {
    value: getCount(payload),
    label: metricLabelMap[metric] ?? 'Requests'
  };
};

const normalizeMediaType = (value?: string): 'movie' | 'tv' => (value === 'tv' ? 'tv' : 'movie');

const mapStatus = (status?: number) => {
  switch (status) {
    case 2:
      return { status: 'pending', text: 'Pending' } as const;
    case 3:
      return { status: 'processing', text: 'Processing' } as const;
    case 4:
      return { status: 'partial', text: 'Partial' } as const;
    case 5:
      return { status: 'available', text: 'Available' } as const;
    case 6:
      return { status: 'declined', text: 'Declined' } as const;
    case 7:
      return { status: 'deleted', text: 'Deleted' } as const;
    default:
      return { status: 'unknown', text: 'Unknown' } as const;
  }
};

const getMediaDetails = async (
  baseUrl: string,
  apiKey: string,
  mediaType: 'movie' | 'tv',
  tmdbId: number
) => {
  const key = `${mediaType}:${tmdbId}`;
  const cached = mediaCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const payload = await fetchJson<SeerrMediaDetails>(`${baseUrl}/api/v1/${mediaType}/${tmdbId}`, {
    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' }
  });
  mediaCache.set(key, { expiresAt: now + mediaCacheTtlMs, value: payload });
  return payload;
};

export const fetchSeerrRequests = async (
  options: { baseUrl?: string; apiKey?: string; limit?: number } = {}
) => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(getBaseUrl());
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? String(getApiKey() ?? '').trim() : '');
  const limit = Math.min(30, Math.max(1, Number(options.limit ?? 10)));

  if (!baseUrl || !apiKey) {
    throw new Error('Seerr base URL or API key is missing');
  }

  const payload = await fetchJson<SeerrRequestResponse>(
    `${baseUrl}/api/v1/request?take=${limit}&skip=0`,
    { headers: { 'X-Api-Key': apiKey, Accept: 'application/json' } }
  );
  const rawItems = Array.isArray(payload.results) ? payload.results.slice(0, limit) : [];

  const items = await Promise.all(
    rawItems.map(async (item, index): Promise<SeerrRequestItem> => {
      const rawMediaType = item.media?.mediaType ?? item.type;
      const mediaType = normalizeMediaType(rawMediaType);
      const tmdbId = Number(item.media?.tmdbId ?? 0);
      const status = mapStatus(item.media?.status);
      const requestedBy = item.requestedBy?.displayName || item.requestedBy?.username || 'Unknown user';
      let details: SeerrMediaDetails | null = null;

      if (tmdbId > 0) {
        try {
          details = await getMediaDetails(baseUrl, apiKey, mediaType, tmdbId);
        } catch {
          details = null;
        }
      }

      const title =
        details?.title ||
        details?.name ||
        (mediaType === 'tv' ? `TV Request #${item.id ?? index + 1}` : `Movie Request #${item.id ?? index + 1}`);
      const posterUrl = details?.posterPath ? `https://image.tmdb.org/t/p/w342${details.posterPath}` : undefined;
      const backdropUrl = details?.backdropPath
        ? `https://image.tmdb.org/t/p/w780${details.backdropPath}`
        : undefined;
      const href = tmdbId > 0 ? `${baseUrl}/${mediaType}/${tmdbId}` : undefined;

      return {
        id: String(item.id ?? `${mediaType}-${tmdbId}-${index}`),
        title,
        mediaType,
        mediaLabel: mediaType === 'tv' ? 'TV' : 'Movie',
        status: status.status,
        statusText: status.text,
        requestedBy,
        posterUrl,
        backdropUrl,
        href
      };
    })
  );

  return { items };
};
