import { env } from '$env/dynamic/private';
import { fetchJson } from './http';
import { canFallbackToEnvSecret } from '$serverlib/security';

type AudiobookshelfLibrary = {
  id?: string;
  mediaType?: string;
};

type AudiobookshelfLibrariesResponse = {
  libraries?: AudiobookshelfLibrary[];
};

type AudiobookshelfStats = {
  totalItems?: number | string;
  totalDuration?: number | string;
};

type AudiobookshelfMetricResult = {
  value: number | string;
  label: string;
};
type AudiobookshelfMetricMap = Record<AudiobookshelfMetricType, AudiobookshelfMetricResult>;

type AudiobookshelfOptions = {
  baseUrl?: string;
  apiKey?: string;
};

export type AudiobookshelfMetricType =
  | 'podcasts'
  | 'podcastsDuration'
  | 'books'
  | 'booksDuration';

const normalizeBase = (value?: string) => {
  if (!value) return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const toNumber = (value: unknown) => {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
};

const toDurationLabel = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const fetchLibraryStats = async (
  baseUrl: string,
  apiKey: string,
  libraryId: string
) => {
  return fetchJson<AudiobookshelfStats>(`${baseUrl}/api/libraries/${libraryId}/stats`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json'
    }
  });
};

export const fetchAudiobookshelfStats = async (
  options: AudiobookshelfOptions = {}
): Promise<AudiobookshelfMetricMap> => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(env.AUDIOBOOKSHELF_URL);
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl)
      ? String(env.AUDIOBOOKSHELF_API_KEY ?? '').trim()
      : '');

  if (!baseUrl || !apiKey) {
    throw new Error('Audiobookshelf base URL or API key is missing');
  }

  const librariesPayload = await fetchJson<AudiobookshelfLibrariesResponse | AudiobookshelfLibrary[]>(
    `${baseUrl}/api/libraries`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      }
    }
  );
  const libraries = Array.isArray(librariesPayload)
    ? librariesPayload
    : Array.isArray(librariesPayload.libraries)
      ? librariesPayload.libraries
      : [];

  const withStats = await Promise.all(
    libraries
      .filter((library): library is AudiobookshelfLibrary & { id: string } =>
        typeof library.id === 'string' && library.id.length > 0
      )
      .map(async (library) => ({
        ...library,
        stats: await fetchLibraryStats(baseUrl, apiKey, library.id)
      }))
  );

  const podcastLibraries = withStats.filter(
    (library) => (library.mediaType ?? '').toLowerCase() === 'podcast'
  );
  const bookLibraries = withStats.filter(
    (library) => (library.mediaType ?? '').toLowerCase() === 'book'
  );

  const totalPodcasts = podcastLibraries.reduce(
    (sum, library) => sum + toNumber(library.stats?.totalItems),
    0
  );
  const totalBooks = bookLibraries.reduce(
    (sum, library) => sum + toNumber(library.stats?.totalItems),
    0
  );
  const totalPodcastDurationSeconds = podcastLibraries.reduce(
    (sum, library) => sum + toNumber(library.stats?.totalDuration),
    0
  );
  const totalBookDurationSeconds = bookLibraries.reduce(
    (sum, library) => sum + toNumber(library.stats?.totalDuration),
    0
  );

  return {
    podcasts: { value: totalPodcasts, label: 'Podcasts' },
    podcastsDuration: { value: toDurationLabel(totalPodcastDurationSeconds), label: 'Podcast Time' },
    books: { value: totalBooks, label: 'Books' },
    booksDuration: { value: toDurationLabel(totalBookDurationSeconds), label: 'Book Time' }
  };
};

export const fetchAudiobookshelfMetric = async (
  metric: AudiobookshelfMetricType,
  options: AudiobookshelfOptions = {}
): Promise<AudiobookshelfMetricResult> => {
  const stats = await fetchAudiobookshelfStats(options);
  return stats[metric];
};
