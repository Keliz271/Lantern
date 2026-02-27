import { env } from '$env/dynamic/private';
import { fetchJson, FetchError } from './http';
import { canFallbackToEnvSecret } from '$serverlib/security';

export type ScrutinyMetricType = 'passed' | 'failed' | 'unknown';

type ScrutinyMetricResult = {
  value: number;
  label: string;
};

type ScrutinyMetricMap = Record<ScrutinyMetricType, ScrutinyMetricResult>;

type ScrutinyOptions = {
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

const asRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const getNested = (value: unknown, path: string[]) => {
  let current: unknown = value;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
};

const toStatusBucket = (value: unknown): ScrutinyMetricType => {
  if (typeof value === 'boolean') {
    return value ? 'passed' : 'failed';
  }

  if (typeof value === 'number') {
    if (value > 0) return 'passed';
    if (value < 0) return 'failed';
    return 'unknown';
  }

  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return 'unknown';
  if (
    normalized.includes('pass') ||
    normalized === 'ok' ||
    normalized.includes('healthy') ||
    normalized.includes('good')
  ) {
    return 'passed';
  }
  if (
    normalized.includes('fail') ||
    normalized.includes('warn') ||
    normalized.includes('error') ||
    normalized.includes('critical') ||
    normalized.includes('bad') ||
    normalized.includes('down')
  ) {
    return 'failed';
  }
  return 'unknown';
};

const countFromDriveArray = (payload: unknown) => {
  const arrays: unknown[] = [];
  const root = asRecord(payload);
  if (Array.isArray(payload)) arrays.push(payload);
  if (root) {
    arrays.push(root.devices, root.disks, root.items, root.data, getNested(root, ['data', 'devices']));
  }

  const drives = arrays.find((value) => Array.isArray(value));
  if (!Array.isArray(drives)) return null;

  const counts = { passed: 0, failed: 0, unknown: 0 };
  drives.forEach((item) => {
    const record = asRecord(item);
    if (!record) {
      counts.unknown += 1;
      return;
    }

    const candidates = [
      record.status,
      record.smart_status,
      record.smartStatus,
      record.health,
      record.overall_status,
      record.overallStatus,
      getNested(record, ['smart', 'status'])
    ];

    const firstKnown = candidates.find((candidate) => candidate !== undefined);
    const bucket = toStatusBucket(firstKnown);
    counts[bucket] += 1;
  });

  return counts;
};

const countFromSummaryMap = (payload: unknown) => {
  const summary = getNested(payload, ['data', 'summary']);
  const summaryRecord = asRecord(summary);
  if (!summaryRecord) return null;

  const entries = Object.values(summaryRecord).filter((entry) => asRecord(entry));
  if (entries.length === 0) return null;

  const counts = { passed: 0, failed: 0, unknown: 0 };

  entries.forEach((entry) => {
    const record = asRecord(entry);
    if (!record) return;
    const device = asRecord(record.device);
    const smart = asRecord(record.smart);

    const hasForcedFailure = Boolean(device?.has_forced_failure);
    const smartSupport = typeof device?.smart_support === 'boolean' ? device.smart_support : undefined;
    const deviceStatus = Number(device?.device_status);

    const smartCandidates = [
      smart?.status,
      smart?.smart_status,
      smart?.passed,
      getNested(smart, ['overall_health']),
      getNested(smart, ['overall_status'])
    ];
    const smartIndicator = smartCandidates.find((candidate) => candidate !== undefined);

    if (hasForcedFailure) {
      counts.failed += 1;
      return;
    }

    if (smartIndicator !== undefined) {
      counts[toStatusBucket(smartIndicator)] += 1;
      return;
    }

    if (Number.isFinite(deviceStatus)) {
      if (deviceStatus >= 2) {
        counts.failed += 1;
        return;
      }
      counts.passed += 1;
      return;
    }

    if (smartSupport === false) {
      counts.unknown += 1;
      return;
    }

    counts.unknown += 1;
  });

  return counts;
};

const extractCounts = (payload: unknown) => {
  const counts = {
    passed: 0,
    failed: 0,
    unknown: 0
  };

  const candidates = [
    payload,
    getNested(payload, ['summary']),
    getNested(payload, ['health']),
    getNested(payload, ['smart_status']),
    getNested(payload, ['data']),
    getNested(payload, ['data', 'summary']),
    getNested(payload, ['data', 'smart_status'])
  ];

  candidates.forEach((candidate) => {
    const record = asRecord(candidate);
    if (!record) return;
    counts.passed = Math.max(counts.passed, toNumber(record.passed));
    counts.failed = Math.max(counts.failed, toNumber(record.failed));
    counts.unknown = Math.max(counts.unknown, toNumber(record.unknown));
  });

  if (counts.passed + counts.failed + counts.unknown === 0) {
    const fromSummary = countFromSummaryMap(payload);
    if (fromSummary) {
      counts.passed = fromSummary.passed;
      counts.failed = fromSummary.failed;
      counts.unknown = fromSummary.unknown;
      return counts;
    }

    const fromArray = countFromDriveArray(payload);
    if (fromArray) {
      counts.passed = fromArray.passed;
      counts.failed = fromArray.failed;
      counts.unknown = fromArray.unknown;
    }
  }

  return counts;
};

const fetchSummaryPayload = async (baseUrl: string, headers: Record<string, string>) => {
  const endpoints = ['/api/summary', '/api/dashboard', '/api/health'];

  for (const endpoint of endpoints) {
    try {
      return await fetchJson<unknown>(`${baseUrl}${endpoint}`, { headers });
    } catch (error) {
      if (error instanceof FetchError && error.status === 404) {
        continue;
      }
      throw error;
    }
  }

  return {};
};

export const fetchScrutinyStats = async (
  options: ScrutinyOptions = {}
): Promise<ScrutinyMetricMap> => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(env.SCRUTINY_URL);
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? String(env.SCRUTINY_API_KEY ?? '').trim() : '');

  if (!baseUrl) {
    throw new Error('Scrutiny base URL is missing');
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const payload = await fetchSummaryPayload(baseUrl, headers);
  const counts = extractCounts(payload);

  return {
    passed: { value: counts.passed, label: 'Passed' },
    failed: { value: counts.failed, label: 'Failed' },
    unknown: { value: counts.unknown, label: 'Unknown' }
  };
};

export const fetchScrutinyMetric = async (
  metric: ScrutinyMetricType,
  options: ScrutinyOptions = {}
): Promise<ScrutinyMetricResult> => {
  const stats = await fetchScrutinyStats(options);
  return stats[metric];
};
