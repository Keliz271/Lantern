import { env } from '$env/dynamic/private';
import { fetchJson } from './http';
import { canFallbackToEnvSecret } from '$serverlib/security';

type ProwlarrIndexer = {
  id?: number;
  name?: string;
  enable?: boolean;
  privacy?: string;
};

type ProwlarrIndexerStatus = {
  indexerId?: number;
  level?: string;
  status?: string;
  healthy?: boolean;
  disabledTill?: string;
  disabledTillUtc?: string;
  lastError?: string;
};

type ProwlarrIndexerStats = {
  numberOfGrabs?: number;
  numberOfQueries?: number;
  numberOfFailGrabs?: number;
  numberOfFailQueries?: number;
};

export type ProwlarrItem = {
  id: number;
  name: string;
  enabled: boolean;
  privacy: string;
  health: 'healthy' | 'unhealthy' | 'warning' | 'disabled';
  href?: string;
};

export type ProwlarrPayload = {
  summary: {
    total: number;
    enabled: number;
    disabled: number;
    numberOfGrabs: number;
    numberOfQueries: number;
    numberOfFailGrabs: number;
    numberOfFailQueries: number;
  };
  items: ProwlarrItem[];
};

type ProwlarrOptions = {
  baseUrl?: string;
  apiKey?: string;
};

const normalizeBase = (value?: string) => {
  if (!value) return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const parseDate = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const resolveHealth = (
  status: ProwlarrIndexerStatus | undefined,
  enabled: boolean
): 'healthy' | 'unhealthy' | 'warning' | 'disabled' => {
  // Disabled override has highest priority.
  if (!enabled) return 'disabled';
  // Implicit healthy: status rows only exist for problematic indexers.
  if (!status) return 'healthy';

  const level = String(status.level ?? '').trim().toLowerCase();
  if (level === 'error') return 'unhealthy';
  if (level === 'warning') return 'warning';

  // Compatibility fallback if level is absent.
  if (typeof status.healthy === 'boolean') {
    return status.healthy ? 'healthy' : 'unhealthy';
  }
  const statusText = String(status.status ?? '').trim().toLowerCase();
  if (statusText.includes('error') || statusText.includes('fail')) return 'unhealthy';
  if (statusText.includes('warn')) return 'warning';

  const disabledTill = parseDate(status.disabledTillUtc ?? status.disabledTill);
  if (disabledTill && disabledTill > Date.now()) return 'unhealthy';
  if (String(status.lastError ?? '').trim()) return 'unhealthy';

  return 'healthy';
};

export const fetchProwlarrIndexers = async (
  options: ProwlarrOptions = {}
): Promise<ProwlarrPayload> => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(env.PROWLARR_URL);
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? String(env.PROWLARR_API_KEY ?? '').trim() : '');

  if (!baseUrl || !apiKey) {
    throw new Error('Prowlarr environment variables are missing');
  }

  const data = await fetchJson<ProwlarrIndexer[]>(`${baseUrl}/api/v1/indexer`, {
    headers: {
      Accept: 'application/json',
      'X-Api-Key': apiKey
    }
  });

  let statusById = new Map<number, ProwlarrIndexerStatus>();
  try {
    const statusRows = await fetchJson<ProwlarrIndexerStatus[]>(
      `${baseUrl}/api/v1/indexerstatus`,
      {
        headers: {
          Accept: 'application/json',
          'X-Api-Key': apiKey
        }
      }
    );
    statusById = new Map(
      (Array.isArray(statusRows) ? statusRows : [])
        .map((row) => [Number(row.indexerId ?? 0), row] as const)
        .filter(([id]) => Number.isFinite(id) && id > 0)
    );
  } catch {
    statusById = new Map();
  }

  let statsTotals = {
    numberOfGrabs: 0,
    numberOfQueries: 0,
    numberOfFailGrabs: 0,
    numberOfFailQueries: 0
  };
  try {
    const statsRows = await fetchJson<ProwlarrIndexerStats[]>(
      `${baseUrl}/api/v1/indexerstats`,
      {
        headers: {
          Accept: 'application/json',
          'X-Api-Key': apiKey
        }
      }
    );
    (Array.isArray(statsRows) ? statsRows : []).forEach((row) => {
      statsTotals.numberOfGrabs += Number(row.numberOfGrabs ?? 0);
      statsTotals.numberOfQueries += Number(row.numberOfQueries ?? 0);
      statsTotals.numberOfFailGrabs += Number(row.numberOfFailGrabs ?? 0);
      statsTotals.numberOfFailQueries += Number(row.numberOfFailQueries ?? 0);
    });
  } catch {
    statsTotals = {
      numberOfGrabs: 0,
      numberOfQueries: 0,
      numberOfFailGrabs: 0,
      numberOfFailQueries: 0
    };
  }

  const items = (Array.isArray(data) ? data : []).map((indexer) => {
    const id = Number(indexer.id ?? 0);
    const enabled = Boolean(indexer.enable);
    const name = (indexer.name ?? '').trim() || `Indexer ${id || '?'}`;
    const privacy = (indexer.privacy ?? '').trim() || 'Unknown';
    return {
      id,
      name,
      enabled,
      privacy,
      health: resolveHealth(statusById.get(id), enabled),
      href: `${baseUrl}/settings/indexers`
    } satisfies ProwlarrItem;
  });

  const enabledCount = items.filter((item) => item.enabled).length;
  return {
    summary: {
      total: items.length,
      enabled: enabledCount,
      disabled: Math.max(0, items.length - enabledCount),
      numberOfGrabs: Math.max(0, Number(statsTotals.numberOfGrabs || 0)),
      numberOfQueries: Math.max(0, Number(statsTotals.numberOfQueries || 0)),
      numberOfFailGrabs: Math.max(0, Number(statsTotals.numberOfFailGrabs || 0)),
      numberOfFailQueries: Math.max(0, Number(statsTotals.numberOfFailQueries || 0))
    },
    items
  };
};
