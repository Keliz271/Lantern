import { env } from '$env/dynamic/private';
import { fetchJson, FetchError } from './http';
import { canFallbackToEnvSecret } from '$serverlib/security';

export type SpeedtestTrackerMetricType = 'download' | 'upload' | 'ping';

type SpeedtestTrackerMetricResult = {
  value: number | string;
  label: string;
  unit?: string;
};

type SpeedtestTrackerMetricMap = Record<SpeedtestTrackerMetricType, SpeedtestTrackerMetricResult>;

export type SpeedtestTrackerOptions = {
  baseUrl?: string;
  apiKey?: string;
};

export type SpeedtestTrackerHistoryPoint = {
  timestamp: string;
  ts: number;
  download: number;
  upload: number;
  ping: number;
};

export type SpeedtestTrackerHistorySummary = {
  mean: number;
  min: number;
  max: number;
  last: number;
};

export type SpeedtestTrackerHistoryResult = {
  points: SpeedtestTrackerHistoryPoint[];
  summary: {
    download: SpeedtestTrackerHistorySummary;
    upload: SpeedtestTrackerHistorySummary;
  };
};

export type SpeedtestTrackerHistoryOptions = SpeedtestTrackerOptions & {
  timeframe?: string;
  from?: string;
  to?: string;
  limit?: number;
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

const parseMaybeUnitValue = (value: unknown): { value: number; unit?: string } | null => {
  if (typeof value === 'number') {
    return { value };
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*([a-zA-Z\/]+)?$/);
  if (!match) return null;

  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;

  return {
    value: parsed,
    unit: match[2]
  };
};

const normalizeThroughputToMbps = (value: number, unit?: string, hintKey?: string) => {
  const normalizedUnit = (unit ?? '').trim().toLowerCase();
  const compactUnit = normalizedUnit.replace(/\s+/g, '');
  const hint = (hintKey ?? '').toLowerCase();

  // Byte-based units (MB/s, MiB/s, etc.) => convert to megabits per second.
  // Common for some Speedtest Tracker installs / API variants.
  if (
    compactUnit.includes('mib/s') ||
    compactUnit.includes('mibps') ||
    compactUnit.includes('mibyte/s') ||
    compactUnit.includes('mibytes/s')
  ) {
    return value * 8.388608; // MiB/s -> Mbps (8 * 1024^2 / 1e6)
  }
  if (
    compactUnit.includes('mb/s') ||
    compactUnit.includes('mbyte/s') ||
    compactUnit.includes('mbytes/s')
  ) {
    return value * 8; // MB/s -> Mbps
  }
  if (
    compactUnit.includes('kib/s') ||
    compactUnit.includes('kibyte/s') ||
    compactUnit.includes('kibytes/s')
  ) {
    return (value * 8 * 1024) / 1_000_000; // KiB/s -> Mbps
  }
  if (
    compactUnit.includes('kb/s') ||
    compactUnit.includes('kbyte/s') ||
    compactUnit.includes('kbytes/s')
  ) {
    return (value * 8 * 1000) / 1_000_000; // kB/s -> Mbps
  }
  if (
    compactUnit === 'b/s' ||
    compactUnit.endsWith('bytes/s') ||
    compactUnit.includes('byte/s')
  ) {
    return (value * 8) / 1_000_000; // B/s -> Mbps
  }

  // Field-name hints when the API omits units.
  if (!compactUnit) {
    if (hint.includes('bits')) {
      return value / 1_000_000; // bits per second -> Mbps
    }
    if (hint.includes('bandwidth')) {
      return (value * 8) / 1_000_000; // bytes per second -> Mbps
    }
  }

  if (normalizedUnit.includes('gbps') || normalizedUnit.includes('gbit')) {
    return value * 1000;
  }
  if (normalizedUnit.includes('kbps') || normalizedUnit.includes('kbit')) {
    return value / 1000;
  }
  if (normalizedUnit.includes('mbps') || normalizedUnit.includes('mbit')) {
    return value;
  }
  if (normalizedUnit.includes('bps') || normalizedUnit.includes('bit/s')) {
    return value / 1_000_000;
  }

  if (value >= 10_000) {
    // Ambiguous legacy: treat large unlabelled numbers as bits/sec by default.
    // (bandwidth/bytes/sec paths are handled above via hint keys.)
    return value / 1_000_000;
  }

  return value;
};

const readField = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return undefined;
};

const resolveTimeExpression = (value: string, nowMs: number) => {
  const raw = value.trim().toLowerCase();
  if (!raw || raw === 'now') return nowMs;
  const relative = raw.match(/^now-(\d+)([smhdw])$/);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const multiplier =
      unit === 's'
        ? 1000
        : unit === 'm'
          ? 60_000
          : unit === 'h'
            ? 3_600_000
            : unit === 'd'
              ? 86_400_000
              : 604_800_000;
    return nowMs - amount * multiplier;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : nowMs;
};

const toTimestampMs = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? Math.round(value) : Math.round(value * 1000);
  }
  if (typeof value === 'string' && value.trim()) {
    const directNumber = Number(value);
    if (Number.isFinite(directNumber)) {
      return directNumber > 1_000_000_000_000
        ? Math.round(directNumber)
        : Math.round(directNumber * 1000);
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const roundDisplayValue = (value: number) => Number(value.toFixed(2).replace(/\.00$/, ''));

const toMbps = (raw: unknown, unit: string, hintKey: string) => {
  const parsed = parseMaybeUnitValue(raw) ?? { value: toNumber(raw) };
  return normalizeThroughputToMbps(parsed.value, parsed.unit ?? unit, hintKey);
};

const resolveThroughputMbps = (
  record: Record<string, unknown>,
  direction: 'download' | 'upload'
) => {
  const directionUnitRaw = readField(record, [
    `${direction}_unit`,
    `${direction}_units`,
    `${direction}Unit`
  ]);
  const directRaw = readField(record, [direction]);
  const parsedDirect = parseMaybeUnitValue(directRaw) ?? { value: toNumber(directRaw) };
  const directionUnit = parsedDirect.unit ?? String(directionUnitRaw ?? '');
  const candidates = [
    toMbps(readField(record, [`${direction}_bits`]), directionUnit, `${direction}_bits`),
    toMbps(
      readField(record, [`${direction}_bandwidth`]),
      directionUnit,
      `${direction}_bandwidth`
    ),
    toMbps(readField(record, [`${direction}_speed`]), directionUnit, `${direction}_speed`),
    normalizeThroughputToMbps(parsedDirect.value, directionUnit, direction)
  ].filter((value) => Number.isFinite(value) && value > 0);
  return candidates.length > 0 ? Math.max(...candidates) : 0;
};

const resolvePingMs = (record: Record<string, unknown>) => {
  const pingRaw = readField(record, ['ping', 'ping_ms', 'latency']);
  const pingUnitRaw = readField(record, ['ping_unit', 'ping_units', 'pingUnit']);
  const parsedPing = parseMaybeUnitValue(pingRaw) ?? { value: toNumber(pingRaw) };
  const unit = String(parsedPing.unit ?? pingUnitRaw ?? '').toLowerCase();
  if (unit.includes('s') && !unit.includes('ms')) {
    return parsedPing.value * 1000;
  }
  return parsedPing.value;
};

const extractLatestResult = (payload: unknown) => {
  const root = asRecord(payload);
  if (!root) return {} as Record<string, unknown>;

  if (Array.isArray(root.data) && root.data.length > 0) {
    const first = asRecord(root.data[0]);
    if (first) return first;
  }

  if (root.data && typeof root.data === 'object' && !Array.isArray(root.data)) {
    const nested = asRecord(root.data);
    if (nested) {
      if (nested.attributes && typeof nested.attributes === 'object') {
        const attrs = asRecord(nested.attributes);
        if (attrs) return attrs;
      }
      return nested;
    }
  }

  if (root.result && typeof root.result === 'object') {
    const result = asRecord(root.result);
    if (result) return result;
  }

  return root;
};

const buildHeaders = (apiKey: string) => {
  const base = { Accept: 'application/json' };
  if (!apiKey) return [base];

  return [
    { ...base, Authorization: `Bearer ${apiKey}` },
    { ...base, 'X-API-KEY': apiKey },
    { ...base, 'X-Api-Key': apiKey }
  ];
};

const fetchLatestResult = async (
  baseUrl: string,
  headersList: Array<Record<string, string>>
) => {
  const endpoints = [
    '/api/v1/results/latest',
    '/api/latest-result',
    '/api/v1/latest-result',
    '/api/results/latest',
    '/api/speedtest-results/latest'
  ];

  let lastError: unknown;

  for (const headers of headersList) {
    for (const endpoint of endpoints) {
      try {
        const payload = await fetchJson<unknown>(`${baseUrl}${endpoint}`, { headers });
        return extractLatestResult(payload);
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

  return {} as Record<string, unknown>;
};

const extractResultRows = (payload: unknown) => {
  const root = asRecord(payload);
  if (!root) return [] as Record<string, unknown>[];

  const normalizeEntry = (entry: unknown) => {
    const row = asRecord(entry);
    if (!row) return null;
    if (row.attributes && typeof row.attributes === 'object' && !Array.isArray(row.attributes)) {
      const attrs = asRecord(row.attributes);
      if (attrs) return attrs;
    }
    return row;
  };

  if (Array.isArray(root.data)) {
    return root.data
      .map((entry) => normalizeEntry(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  }

  if (Array.isArray(root.results)) {
    return root.results
      .map((entry) => normalizeEntry(entry))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  }

  const single = normalizeEntry(root);
  return single ? [single] : [];
};

const buildHistoryUrl = (
  baseUrl: string,
  endpoint: string,
  fromMs: number,
  toMs: number,
  limit: number
) => {
  const url = new URL(`${baseUrl}${endpoint}`);
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('per_page', String(limit));
  url.searchParams.set('page[size]', String(limit));
  url.searchParams.set('from', String(fromMs));
  url.searchParams.set('to', String(toMs));
  url.searchParams.set('start_date', fromIso);
  url.searchParams.set('end_date', toIso);
  return url.toString();
};

const fetchHistoryRows = async (
  baseUrl: string,
  headersList: Array<Record<string, string>>,
  fromMs: number,
  toMs: number,
  limit: number
) => {
  const endpoints = [
    '/api/v1/results',
    '/api/results',
    '/api/v1/speedtest-results',
    '/api/speedtest-results'
  ];
  let lastError: unknown;

  for (const headers of headersList) {
    for (const endpoint of endpoints) {
      try {
        const payload = await fetchJson<unknown>(buildHistoryUrl(baseUrl, endpoint, fromMs, toMs, limit), {
          headers
        });
        const rows = extractResultRows(payload);
        if (rows.length > 0) return rows;
      } catch (error) {
        lastError = error;
        if (error instanceof FetchError && [401, 403, 404].includes(error.status)) {
          continue;
        }
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  return [] as Record<string, unknown>[];
};

const summarizeSeries = (values: number[]): SpeedtestTrackerHistorySummary => {
  if (values.length === 0) {
    return { mean: 0, min: 0, max: 0, last: 0 };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    mean: roundDisplayValue(total / values.length),
    min: roundDisplayValue(Math.min(...values)),
    max: roundDisplayValue(Math.max(...values)),
    last: roundDisplayValue(values[values.length - 1] ?? 0)
  };
};

const downsamplePoints = (points: SpeedtestTrackerHistoryPoint[], maxPoints: number) => {
  if (points.length <= maxPoints) return points;
  const bucket = points.length / maxPoints;
  const sampled: SpeedtestTrackerHistoryPoint[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    const item = points[Math.min(points.length - 1, Math.floor(index * bucket))];
    if (item) sampled.push(item);
  }
  const last = points[points.length - 1];
  if (last && sampled[sampled.length - 1]?.ts !== last.ts) {
    sampled[sampled.length - 1] = last;
  }
  return sampled;
};

export const fetchSpeedtestTrackerStats = async (
  options: SpeedtestTrackerOptions = {}
): Promise<SpeedtestTrackerMetricMap> => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(env.SPEEDTEST_TRACKER_URL);
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl)
      ? String(env.SPEEDTEST_TRACKER_API_KEY ?? '').trim()
      : '');

  if (!baseUrl) {
    throw new Error('Speedtest Tracker base URL is missing');
  }

  const result = await fetchLatestResult(baseUrl, buildHeaders(apiKey));

  const downloadBitsRaw = readField(result, ['download_bits']);
  const uploadBitsRaw = readField(result, ['upload_bits']);
  const downloadBandwidthRaw = readField(result, ['download_bandwidth']);
  const uploadBandwidthRaw = readField(result, ['upload_bandwidth']);
  const downloadSpeedRaw = readField(result, ['download_speed']);
  const uploadSpeedRaw = readField(result, ['upload_speed']);
  const downloadRaw = readField(result, ['download']);
  const uploadRaw = readField(result, ['upload']);
  const pingRaw = readField(result, ['ping', 'ping_ms', 'latency']);

  const downloadUnitRaw = readField(result, ['download_unit', 'download_units', 'downloadUnit']);
  const uploadUnitRaw = readField(result, ['upload_unit', 'upload_units', 'uploadUnit']);
  const pingUnitRaw = readField(result, ['ping_unit', 'ping_units', 'pingUnit']);

  const parsedDownload = parseMaybeUnitValue(downloadRaw) ?? { value: toNumber(downloadRaw) };
  const parsedUpload = parseMaybeUnitValue(uploadRaw) ?? { value: toNumber(uploadRaw) };
  const parsedPing = parseMaybeUnitValue(pingRaw) ?? { value: toNumber(pingRaw) };

  const downloadUnit = parsedDownload.unit ?? String(downloadUnitRaw ?? '');
  const uploadUnit = parsedUpload.unit ?? String(uploadUnitRaw ?? '');

  const toMbps = (raw: unknown, unit: string, hintKey: string) => {
    const parsed = parseMaybeUnitValue(raw) ?? { value: toNumber(raw) };
    return normalizeThroughputToMbps(parsed.value, parsed.unit ?? unit, hintKey);
  };

  // Prefer the most "obviously raw" fields (bits/bandwidth), but allow fallbacks.
  const downloadCandidates = [
    toMbps(downloadBitsRaw, downloadUnit, 'download_bits'),
    toMbps(downloadBandwidthRaw, downloadUnit, 'download_bandwidth'),
    toMbps(downloadSpeedRaw, downloadUnit, 'download_speed'),
    normalizeThroughputToMbps(parsedDownload.value, downloadUnit, 'download')
  ].filter((value) => Number.isFinite(value) && value > 0);

  const uploadCandidates = [
    toMbps(uploadBitsRaw, uploadUnit, 'upload_bits'),
    toMbps(uploadBandwidthRaw, uploadUnit, 'upload_bandwidth'),
    toMbps(uploadSpeedRaw, uploadUnit, 'upload_speed'),
    normalizeThroughputToMbps(parsedUpload.value, uploadUnit, 'upload')
  ].filter((value) => Number.isFinite(value) && value > 0);

  let downloadMbps = downloadCandidates.length > 0 ? Math.max(...downloadCandidates) : 0;
  let uploadMbps = uploadCandidates.length > 0 ? Math.max(...uploadCandidates) : 0;

  // Last-resort heuristic: some installs return MB/s without a unit. Detect symmetric
  // ~gigabit-class links where both values land around ~80-160.
  if (!String(downloadUnit).trim() && !String(uploadUnit).trim()) {
    const d = parsedDownload.value;
    const u = parsedUpload.value;
    const bothLookLikeMBps =
      d >= 60 &&
      d <= 250 &&
      u >= 60 &&
      u <= 250 &&
      Math.abs(d - u) / Math.max(1, Math.max(d, u)) <= 0.4;
    if (bothLookLikeMBps) {
      downloadMbps = Math.max(downloadMbps, d * 8);
      uploadMbps = Math.max(uploadMbps, u * 8);
    }
  }

  const pingMs =
    String(parsedPing.unit ?? pingUnitRaw ?? '').toLowerCase().includes('s') &&
    !String(parsedPing.unit ?? pingUnitRaw ?? '').toLowerCase().includes('ms')
      ? parsedPing.value * 1000
      : parsedPing.value;

  return {
    download: {
      value: Number(downloadMbps.toFixed(2).replace(/\.00$/, '')),
      label: 'Download',
      unit: 'Mbps'
    },
    upload: {
      value: Number(uploadMbps.toFixed(2).replace(/\.00$/, '')),
      label: 'Upload',
      unit: 'Mbps'
    },
    ping: {
      value: Number(pingMs.toFixed(2).replace(/\.00$/, '')),
      label: 'Ping',
      unit: 'ms'
    }
  };
};

export const fetchSpeedtestTrackerHistory = async (
  options: SpeedtestTrackerHistoryOptions = {}
): Promise<SpeedtestTrackerHistoryResult> => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(env.SPEEDTEST_TRACKER_URL);
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl)
      ? String(env.SPEEDTEST_TRACKER_API_KEY ?? '').trim()
      : '');
  if (!baseUrl) {
    throw new Error('Speedtest Tracker base URL is missing');
  }

  const nowMs = Date.now();
  const timeframe = typeof options.timeframe === 'string' ? options.timeframe : '48h';
  const resolvedFrom =
    timeframe === 'custom'
      ? resolveTimeExpression(String(options.from ?? 'now-48h'), nowMs)
      : resolveTimeExpression(`now-${timeframe}`, nowMs);
  const resolvedTo = resolveTimeExpression(String(options.to ?? 'now'), nowMs);
  const fromMs = Math.min(resolvedFrom, resolvedTo);
  const toMs = Math.max(resolvedFrom, resolvedTo);
  const requestedLimit = Math.min(1200, Math.max(20, Number(options.limit ?? 240)));

  const rows = await fetchHistoryRows(baseUrl, buildHeaders(apiKey), fromMs, toMs, requestedLimit);
  const points = rows
    .map((record) => {
      const ts = toTimestampMs(
        readField(record, [
          'created_at',
          'createdAt',
          'timestamp',
          'tested_at',
          'testedAt',
          'date',
          'time'
        ])
      );
      if (!ts) return null;
      const download = resolveThroughputMbps(record, 'download');
      const upload = resolveThroughputMbps(record, 'upload');
      const ping = resolvePingMs(record);
      return {
        ts,
        timestamp: new Date(ts).toISOString(),
        download: roundDisplayValue(download),
        upload: roundDisplayValue(upload),
        ping: roundDisplayValue(ping)
      } satisfies SpeedtestTrackerHistoryPoint;
    })
    .filter((entry): entry is SpeedtestTrackerHistoryPoint => Boolean(entry))
    .filter((entry) => entry.ts >= fromMs && entry.ts <= toMs)
    .sort((left, right) => left.ts - right.ts);

  const trimmed = downsamplePoints(points, requestedLimit);
  const downloadSeries = trimmed.map((point) => point.download);
  const uploadSeries = trimmed.map((point) => point.upload);

  return {
    points: trimmed,
    summary: {
      download: summarizeSeries(downloadSeries),
      upload: summarizeSeries(uploadSeries)
    }
  };
};

export const fetchSpeedtestTrackerMetric = async (
  metric: SpeedtestTrackerMetricType,
  options: SpeedtestTrackerOptions = {}
): Promise<SpeedtestTrackerMetricResult> => {
  const stats = await fetchSpeedtestTrackerStats(options);
  return stats[metric];
};
