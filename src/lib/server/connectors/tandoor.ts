import { env } from '$env/dynamic/private';
import { fetchJson, FetchError } from './http';
import { canFallbackToEnvSecret } from '$serverlib/security';

export type TandoorMetricType = 'users' | 'recipes' | 'keywords';

type TandoorMetricResult = {
  value: number;
  label: string;
};

type TandoorMetricMap = Record<TandoorMetricType, TandoorMetricResult>;

type TandoorOptions = {
  baseUrl?: string;
  apiKey?: string;
};

const normalizeBase = (value?: string) => {
  if (!value) return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const toNumber = (value: unknown) => {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
};

const readCount = (payload: unknown) => {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== 'object') return 0;

  const record = payload as Record<string, unknown>;
  const count = toNumber(record.count ?? record.total ?? record.total_count);
  if (count > 0) return count;

  if (Array.isArray(record.results)) return record.results.length;
  if (Array.isArray(record.items)) return record.items.length;

  return 0;
};

const endpointWithCountParams = (endpoint: string) => {
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${separator}page=1&page_size=1&limit=1`;
};

const buildAuthHeaders = (apiKey: string) => {
  const base = { Accept: 'application/json' };
  if (!apiKey) return [base];
  return [
    { ...base, Authorization: `Token ${apiKey}` },
    { ...base, Authorization: `Bearer ${apiKey}` },
    { ...base, 'X-API-KEY': apiKey }
  ];
};

const fetchCount = async (
  baseUrl: string,
  endpoint: string,
  headersList: Array<Record<string, string>>
) => {
  const endpointVariants = [
    endpointWithCountParams(endpoint),
    endpoint,
    endpoint.endsWith('/') ? endpoint.slice(0, -1) : `${endpoint}/`
  ];

  let lastError: unknown;

  for (const headers of headersList) {
    for (const variant of endpointVariants) {
      try {
        const payload = await fetchJson<unknown>(`${baseUrl}${variant}`, { headers });
        return readCount(payload);
      } catch (error) {
        lastError = error;
        if (error instanceof FetchError && [401, 403, 404].includes(error.status)) {
          continue;
        }
        throw error;
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  return 0;
};

export const fetchTandoorStats = async (
  options: TandoorOptions = {}
): Promise<TandoorMetricMap> => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(env.TANDOOR_URL);
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? String(env.TANDOOR_API_KEY ?? '').trim() : '');

  if (!baseUrl) {
    throw new Error('Tandoor base URL is missing');
  }

  const headersList = buildAuthHeaders(apiKey);

  const [users, recipes, keywords] = await Promise.all([
    fetchCount(baseUrl, '/api/user/', headersList),
    fetchCount(baseUrl, '/api/recipe/', headersList),
    fetchCount(baseUrl, '/api/keyword/', headersList)
  ]);

  return {
    users: { value: users, label: 'Users' },
    recipes: { value: recipes, label: 'Recipes' },
    keywords: { value: keywords, label: 'Keywords' }
  };
};

export const fetchTandoorMetric = async (
  metric: TandoorMetricType,
  options: TandoorOptions = {}
): Promise<TandoorMetricResult> => {
  const stats = await fetchTandoorStats(options);
  return stats[metric];
};
