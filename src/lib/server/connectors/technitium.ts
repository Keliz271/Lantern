import { env } from '$env/dynamic/private';
import { fetchJson } from './http';
import { canFallbackToEnvSecret } from '$serverlib/security';

type TechnitiumResponse = {
  status?: string;
  errorMessage?: string;
  response?: {
    stats?: {
      totalQueries?: number;
      totalBlocked?: number;
      avgResponseTime?: number;
      cachedAvgResponseTime?: number;
      avgQueryTime?: number;
    };
    mainChartData?: {
      labels?: string[];
      datasets?: Array<{ label?: string; data?: number[] }>;
    };
  };
};

export type TechnitiumChart = {
  labels: string[];
  total: number[];
  blocked: number[];
  summary: {
    totalQueries: number;
    blockedPct: number;
    latency: number;
    failures: number;
    cachedAvgLatency: number;
    cached: number;
    recursive: number;
    authoritative: number;
  };
};

const getFirstNumber = (stats: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = Number(stats[key] ?? 0);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
};

const formatHourLabel = (date: Date) => {
  const hours = date.getHours();
  const period = hours >= 12 ? 'pm' : 'am';
  const display = ((hours + 11) % 12) + 1;
  return `${display}${period}`;
};

const formatDayLabel = (date: Date) => {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
};

const compactBuckets = (labels: string[], total: number[], blocked: number[], points: number) => {
  if (total.length === 0) {
    return { labels: [], total: [], blocked: [] };
  }

  const bucketCount = Math.min(points, total.length);
  const bucketSize = Math.ceil(total.length / bucketCount);
  const startIndex = Math.max(0, total.length - bucketCount * bucketSize);

  const bucketLabels: string[] = [];
  const bucketTotals: number[] = [];
  const bucketBlocked: number[] = [];

  for (let i = startIndex; i < total.length; i += bucketSize) {
    const sliceTotal = total.slice(i, i + bucketSize);
    const sliceBlocked = blocked.slice(i, i + bucketSize);
    const sumTotal = sliceTotal.reduce((acc, value) => acc + (value ?? 0), 0);
    const sumBlocked = sliceBlocked.reduce((acc, value) => acc + (value ?? 0), 0);
    const labelIndex = Math.min(i + bucketSize - 1, labels.length - 1);
    const label = labels[labelIndex] ?? '';

    bucketLabels.push(label);
    bucketTotals.push(sumTotal);
    bucketBlocked.push(Math.min(sumBlocked, sumTotal));
  }

  return { labels: bucketLabels, total: bucketTotals, blocked: bucketBlocked };
};

const getDataset = (datasets: Array<{ label?: string; data?: number[] }>, name: string) => {
  const match = datasets.find((ds) => (ds.label ?? '').toLowerCase() === name.toLowerCase());
  return match?.data ?? [];
};

export const fetchTechnitiumStats = async (
  points = 12,
  timeframeOverride?: string,
  tokenOverride?: string,
  baseUrlOverride?: string,
  timeScale?: string
): Promise<TechnitiumChart> => {
  const overrideBaseUrl = typeof baseUrlOverride === 'string' ? baseUrlOverride.trim() : '';
  const envBaseUrl = String(env.TECHNITIUM_URL ?? '').trim();
  const baseUrl = (overrideBaseUrl || envBaseUrl).trim();
  const tokenTrimmed = typeof tokenOverride === 'string' ? tokenOverride.trim() : '';
  const token =
    tokenTrimmed ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? String(env.TECHNITIUM_TOKEN ?? '').trim() : '');
  const timeframe = timeframeOverride ?? env.TECHNITIUM_TIMEFRAME ?? 'LastDay';

  if (!baseUrl || !token) {
    throw new Error('Technitium environment variables are missing');
  }

  const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const url = `${trimmedBase}/api/dashboard/stats/get?token=${encodeURIComponent(token)}&type=${encodeURIComponent(timeframe)}&utc=true`;
  const payload = await fetchJson<TechnitiumResponse>(url);

  if (payload.status && payload.status !== 'ok') {
    throw new Error(payload.errorMessage ?? 'Technitium API error');
  }

  if (!payload.response?.stats) {
    throw new Error('Technitium response missing stats');
  }
  const stats = payload.response?.stats ?? {};
  const chart = payload.response?.mainChartData ?? {};

  const rawLabels = chart.labels ?? [];
  const datasets = chart.datasets ?? [];
  const rawTotal = getDataset(datasets, 'Total');
  const rawBlocked = getDataset(datasets, 'Blocked');

  const { labels, total, blocked } = compactBuckets(rawLabels, rawTotal, rawBlocked, points);
  const formattedLabels = labels.map((label) => {
    const date = new Date(label);
    if (Number.isNaN(date.getTime())) {
      return label;
    }
    const mode = (timeScale ?? 'auto').toLowerCase();
    if (mode === 'hour') return formatHourLabel(date);
    if (mode === 'day') return formatDayLabel(date);
    const prefersHour = /day|hour/i.test(timeframe);
    return prefersHour ? formatHourLabel(date) : formatDayLabel(date);
  });

  let totalQueries = Number(stats.totalQueries ?? 0);
  let blockedQueries = Number(stats.totalBlocked ?? 0);

  if (totalQueries <= 0 && rawTotal.length > 0) {
    totalQueries = rawTotal.reduce((acc, value) => acc + Number(value ?? 0), 0);
  }
  if (blockedQueries <= 0 && rawBlocked.length > 0) {
    blockedQueries = rawBlocked.reduce((acc, value) => acc + Number(value ?? 0), 0);
  }

  const blockedPct = totalQueries > 0 ? Math.round((blockedQueries / totalQueries) * 100) : 0;
  const latency = Number(stats.avgResponseTime ?? stats.cachedAvgResponseTime ?? stats.avgQueryTime ?? 0);
  const cachedAvgLatency = Number(stats.cachedAvgResponseTime ?? stats.avgResponseTime ?? 0);
  const failures = getFirstNumber(stats as Record<string, unknown>, [
    'totalServerFailure',
    'totalServerFailures',
    'serverFailure',
    'serverFailures',
    'totalFailure',
    'totalFailures'
  ]);
  const cached = getFirstNumber(stats as Record<string, unknown>, [
    'totalCached',
    'cachedQueries',
    'cached'
  ]);
  const recursive = getFirstNumber(stats as Record<string, unknown>, [
    'totalRecursive',
    'recursiveQueries',
    'recursive'
  ]);
  const authoritative = getFirstNumber(stats as Record<string, unknown>, [
    'totalAuthoritative',
    'authoritativeQueries',
    'authoritative'
  ]);

  return {
    labels: formattedLabels,
    total,
    blocked,
    summary: {
      totalQueries,
      blockedPct,
      latency,
      failures,
      cachedAvgLatency,
      cached,
      recursive,
      authoritative
    }
  };
};
