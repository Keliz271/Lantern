import { env } from '$env/dynamic/private';
import { canFallbackToEnvSecret } from '$serverlib/security';
import { fetchWithTimeout } from './http';

type PlexDirectory = {
  key?: string | number;
  type?: string;
};

type PlexMediaContainer = {
  size?: number | string;
  totalSize?: number | string;
  Directory?: PlexDirectory | PlexDirectory[];
};

type PlexPayload = {
  MediaContainer?: PlexMediaContainer;
};

type PlexMetricResult = {
  value: number | string;
  label: string;
};
type PlexMetricMap = Record<PlexMetricType, PlexMetricResult>;

type PlexOptions = {
  baseUrl?: string;
  apiKey?: string;
};

export type PlexMetricType = 'streams' | 'albums' | 'movies' | 'tv';

const normalizeBase = (value?: string) => {
  if (!value) return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parsePlexJson = async (response: Response) => {
  const text = await response.text();
  try {
    return JSON.parse(text) as PlexPayload;
  } catch {
    throw new Error('Plex did not return JSON. Verify token and server URL.');
  }
};

const fetchPlexPayload = async (baseUrl: string, token: string, endpoint: string) => {
  const url = `${baseUrl}${endpoint}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'application/json',
      'X-Plex-Container-Start': '0',
      'X-Plex-Container-Size': '500',
      'X-Plex-Token': token
    },
    cache: 'no-store'
  }, { timeoutMs: 8000, maxRedirects: 3 });

  if (!response.ok) {
    throw new Error(`Plex request failed (${response.status})`);
  }

  return parsePlexJson(response);
};

export const fetchPlexStats = async (
  options: PlexOptions = {}
): Promise<PlexMetricMap> => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(env.PLEX_URL);
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const tokenOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const token =
    tokenOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? env.PLEX_TOKEN : '');

  if (!baseUrl || !token) {
    throw new Error('Plex base URL or token is missing');
  }

  const sessionsPayload = await fetchPlexPayload(baseUrl, token, '/status/sessions');
  const streams = toNumber(sessionsPayload.MediaContainer?.size);

  const sectionsPayload = await fetchPlexPayload(baseUrl, token, '/library/sections');
  const directoriesRaw = sectionsPayload.MediaContainer?.Directory;
  const directories = Array.isArray(directoriesRaw)
    ? directoriesRaw
    : directoriesRaw
      ? [directoriesRaw]
      : [];

  let movies = 0;
  let tv = 0;
  let albums = 0;

  await Promise.all(
    directories
      .filter((directory) => ['movie', 'show', 'artist'].includes((directory.type ?? '').toLowerCase()))
      .map(async (directory) => {
        const key = String(directory.key ?? '').trim();
        const type = (directory.type ?? '').toLowerCase();
        if (!key || !type) return;

        const endpoint =
          type === 'artist'
            ? `/library/sections/${encodeURIComponent(key)}/albums`
            : `/library/sections/${encodeURIComponent(key)}/all`;
        const payload = await fetchPlexPayload(baseUrl, token, endpoint);
        const size = toNumber(payload.MediaContainer?.totalSize ?? payload.MediaContainer?.size);

        if (type === 'movie') movies += size;
        if (type === 'show') tv += size;
        if (type === 'artist') albums += size;
      })
  );

  return {
    streams: { value: streams, label: 'Streams' },
    albums: { value: albums, label: 'Albums' },
    movies: { value: movies, label: 'Movies' },
    tv: { value: tv, label: 'TV' }
  };
};

export const fetchPlexMetric = async (
  metric: PlexMetricType,
  options: PlexOptions = {}
): Promise<PlexMetricResult> => {
  const stats = await fetchPlexStats(options);
  return stats[metric];
};
