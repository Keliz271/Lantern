import { getDashboardIconUrlBySlug } from '$lib/shared/dashboardIcons';
import type { DockerContainer, DockerServers } from './docker';
import {
  fetchDockerContainers,
  getDockerServers,
  resolveContainerHealth
} from './docker';
import { validateProbeUrl } from '$serverlib/security';

export type MonitorTarget = {
  name: string;
  url: string;
  icon?: string;
  method: 'GET' | 'POST';
  dockerServer?: string;
  dockerContainer?: string;
};

export type MonitorItem = {
  name: string;
  url?: string;
  icon?: string;
  status: 'ok' | 'warn' | 'down' | 'unknown';
  statusText: string;
  latencyMs?: number;
  containerHealth?: 'healthy' | 'unhealthy' | 'unknown';
};

export type MonitorPayload = {
  items: MonitorItem[];
  checkedAt: string;
  mode?: 'targets' | 'system';
  systemHosts?: SystemMonitorHost[];
  error?: string;
};

export type SystemMonitorNode = {
  value: string;
  label: string;
  host: string;
  port: number;
  baseUrl?: string;
};

export const SYSTEM_MONITOR_METRIC_KEYS = [
  'cpu',
  'memory',
  'activeMemory',
  'disk',
  'temperature',
  'network',
  'diskio',
  'load1',
  'load5',
  'load15'
] as const;

export type SystemMonitorMetricKey = (typeof SYSTEM_MONITOR_METRIC_KEYS)[number];

export type SystemMonitorVital = {
  key: SystemMonitorMetricKey;
  label: string;
  value: number;
  actual: number;
  percent: number;
  unit: string;
  max: number;
};

export type SystemMonitorHost = {
  id: string;
  label: string;
  host: string;
  platform?: string;
  uptimeText: string;
  uptimeSec?: number;
  status: 'ok' | 'warn' | 'down' | 'unknown';
  metrics: SystemMonitorVital[];
};

type FetchMonitorStatusOptions = {
  targets?: unknown;
  targetsText?: string;
  fallbackTargets?: MonitorTarget[];
  timeoutMs?: number;
  dockerServers?: DockerServers;
  defaultDockerServer?: string;
  containersByServer?: Record<string, DockerContainer[]>;
};

type FetchSystemMonitorStatusOptions = {
  nodes?: unknown;
  timeoutMs?: number;
  metricKeys?: unknown;
  metricsByNode?: unknown;
};

const MAX_TARGETS = 24;
const MAX_SYSTEM_NODES = 8;
const DEFAULT_SYSTEM_PORT = 61208;
const GLANCES_VERSION_CACHE_TTL_MS = 10 * 60 * 1000;
const GLANCES_NODE_CONCURRENCY = 3;

type GlancesApiVersion = 3 | 4;
type GlancesEndpoint =
  | 'quicklook'
  | 'mem'
  | 'fs'
  | 'sensors'
  | 'cpu'
  | 'network'
  | 'diskio'
  | 'load'
  | 'os'
  | 'uptime';

type GlancesVersionCacheEntry = {
  version: GlancesApiVersion;
  checkedAt: number;
};

const SYSTEM_MONITOR_METRIC_KEY_SET = new Set<SystemMonitorMetricKey>(SYSTEM_MONITOR_METRIC_KEYS);
const glancesVersionCache = new Map<string, GlancesVersionCacheEntry>();

const normalizeNodeBaseUrl = (raw: unknown) => {
  const input = String(raw ?? '').trim();
  if (!input) return '';
  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(input) ? input : `http://${input}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.origin;
  } catch {
    return '';
  }
};

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const sanitizeTarget = (target: Partial<MonitorTarget>) => {
  const name = String(target.name ?? '').trim();
  const rawUrl = String(target.url ?? '').trim();
  if (!name || !rawUrl) return undefined;
  const validatedUrl = validateProbeUrl(rawUrl);
  if (!validatedUrl.ok) return undefined;

  const method = target.method === 'POST' ? 'POST' : 'GET';
  const icon = typeof target.icon === 'string' ? target.icon.trim() : '';
  const dockerServer =
    typeof target.dockerServer === 'string' ? target.dockerServer.trim() : '';
  const dockerContainer =
    typeof target.dockerContainer === 'string' ? target.dockerContainer.trim() : '';
  return {
    name,
    url: validatedUrl.url,
    method,
    ...(icon ? { icon } : {}),
    ...(dockerServer ? { dockerServer } : {}),
    ...(dockerContainer ? { dockerContainer } : {})
  } satisfies MonitorTarget;
};

const parseTargetsText = (targetsText?: string) => {
  if (!targetsText?.trim()) return [] as MonitorTarget[];
  const lines = targetsText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const parsed = lines
    .map((line) => {
      const [name = '', url = '', icon = '', method = '', dockerServer = '', dockerContainer = ''] = line
        .split('|')
        .map((part) => part.trim());
      return sanitizeTarget({
        name,
        url,
        icon,
        method: method.toUpperCase() === 'POST' ? 'POST' : 'GET',
        dockerServer,
        dockerContainer
      });
    })
    .filter((target): target is MonitorTarget => Boolean(target));

  return parsed.slice(0, MAX_TARGETS);
};

export const normalizeMonitorTargets = (rawTargets: unknown, targetsText?: string) => {
  const parsedFromArray = Array.isArray(rawTargets)
    ? rawTargets
        .map((target) =>
          typeof target === 'object' && target !== null
            ? sanitizeTarget(target as Partial<MonitorTarget>)
            : undefined
        )
        .filter((target): target is MonitorTarget => Boolean(target))
        .slice(0, MAX_TARGETS)
    : [];

  if (parsedFromArray.length > 0) return parsedFromArray;
  return parseTargetsText(targetsText);
};

const resolveMonitorIcon = (icon: string | undefined, name: string) => {
  const trimmed = typeof icon === 'string' ? icon.trim() : '';
  if (trimmed) {
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    const iconSlug = toSlug(trimmed);
    return iconSlug ? getDashboardIconUrlBySlug(iconSlug) : undefined;
  }

  const nameSlug = toSlug(name);
  return nameSlug ? getDashboardIconUrlBySlug(nameSlug) : undefined;
};

const statusFromContainerHealth = (health: 'healthy' | 'unhealthy' | 'unknown'): MonitorItem['status'] => {
  if (health === 'healthy') return 'ok';
  if (health === 'unhealthy') return 'down';
  return 'unknown';
};

const statusTextFromContainerHealth = (health: 'healthy' | 'unhealthy' | 'unknown') => {
  if (health === 'healthy') return 'OK';
  if (health === 'unhealthy') return 'DOWN';
  return 'UNKNOWN';
};

const probeTarget = async (target: MonitorTarget, timeoutMs: number): Promise<MonitorItem> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(target.url, {
      method: target.method,
      signal: controller.signal,
      redirect: 'manual',
      cache: 'no-store'
    });
    const latencyMs = Math.max(1, Date.now() - startedAt);
    const successful = response.status >= 200 && response.status < 400;
    const status: MonitorItem['status'] = successful
      ? latencyMs >= 1000
        ? 'warn'
        : 'ok'
      : 'down';
    const statusText = successful ? (status === 'warn' ? 'SLOW' : 'OK') : 'DOWN';

    return {
      name: target.name,
      url: target.url,
      icon: resolveMonitorIcon(target.icon, target.name),
      status,
      statusText,
      latencyMs
    };
  } catch {
    return {
      name: target.name,
      url: target.url,
      icon: resolveMonitorIcon(target.icon, target.name),
      status: 'down',
      statusText: 'DOWN'
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const fetchMonitorStatus = async (
  options: FetchMonitorStatusOptions = {}
): Promise<MonitorPayload> => {
  const timeoutMs = Math.min(15000, Math.max(500, Number(options.timeoutMs ?? 6000)));
  const dockerServers = options.dockerServers ?? getDockerServers();
  const configured = normalizeMonitorTargets(options.targets, options.targetsText);
  const fallback = (options.fallbackTargets ?? [])
    .map((target) => sanitizeTarget(target))
    .filter((target): target is MonitorTarget => Boolean(target))
    .slice(0, MAX_TARGETS);
  const targets = configured.length > 0 ? configured : fallback;

  if (targets.length === 0) {
    return {
      items: [],
      checkedAt: new Date().toISOString(),
      error: 'No monitor targets configured'
    };
  }

  const containersByServer: Record<string, DockerContainer[]> = {
    ...(options.containersByServer ?? {})
  };
  const containerFetches = new Map<string, Promise<DockerContainer[]>>();

  const getContainersForServer = async (server: string) => {
    if (!server || !dockerServers[server]) return [] as DockerContainer[];
    if (Array.isArray(containersByServer[server])) {
      return containersByServer[server]!;
    }
    const pending = containerFetches.get(server);
    if (pending) return pending;

    const fetchPromise = (async () => {
      try {
        const containers = await fetchDockerContainers(dockerServers[server]!);
        containersByServer[server] = containers;
        return containers;
      } catch {
        containersByServer[server] = [];
        return [] as DockerContainer[];
      } finally {
        containerFetches.delete(server);
      }
    })();
    containerFetches.set(server, fetchPromise);
    return fetchPromise;
  };

  const items = await Promise.all(
    targets.map(async (target) => {
      const base = await probeTarget(target, timeoutMs);
      const container = target.dockerContainer?.trim();
      const server = target.dockerServer?.trim();
      if (!container && !server) {
        return base;
      }
      if (!container || !server) {
        const unknownContainerItem: MonitorItem = {
          ...base,
          status: 'unknown',
          statusText: 'UNKNOWN',
          containerHealth: 'unknown'
        };
        return unknownContainerItem;
      }

      const containers = await getContainersForServer(server);
      const containerHealth = resolveContainerHealth(containers, container);

      const itemWithContainer: MonitorItem = {
        ...base,
        status: statusFromContainerHealth(containerHealth),
        statusText: statusTextFromContainerHealth(containerHealth),
        containerHealth
      };
      return itemWithContainer;
    })
  );

  return {
    items,
    checkedAt: new Date().toISOString(),
    mode: 'targets'
  };
};

const normalizeSystemNodes = (rawNodes: unknown) => {
  if (!Array.isArray(rawNodes)) return [] as SystemMonitorNode[];
  return rawNodes
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const value = String((entry as Record<string, unknown>).value ?? '').trim();
      const host = String((entry as Record<string, unknown>).host ?? '').trim();
      if (!value || !host) return null;
      const label = String((entry as Record<string, unknown>).label ?? value).trim() || value;
      const portRaw = Number((entry as Record<string, unknown>).port ?? DEFAULT_SYSTEM_PORT);
      const port = Number.isFinite(portRaw) ? Math.min(65535, Math.max(1, Math.round(portRaw))) : DEFAULT_SYSTEM_PORT;
      const baseUrl = normalizeNodeBaseUrl((entry as Record<string, unknown>).baseUrl);
      return {
        value,
        host,
        label,
        port,
        ...(baseUrl ? { baseUrl } : {})
      } satisfies SystemMonitorNode;
    })
    .filter((entry): entry is SystemMonitorNode => Boolean(entry))
    .slice(0, MAX_SYSTEM_NODES);
};

const formatUptime = (totalSeconds: number) => {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const isVersionMissStatus = (status: number | null) =>
  status === 404 || status === 405 || status === 501;

const isGlancesVersionValid = (entry: GlancesVersionCacheEntry | undefined, now: number) =>
  Boolean(entry && now - entry.checkedAt <= GLANCES_VERSION_CACHE_TTL_MS);

const getCachedGlancesVersion = (baseUrl: string) => {
  const now = Date.now();
  const cached = glancesVersionCache.get(baseUrl);
  if (isGlancesVersionValid(cached, now)) return cached!.version;
  if (cached) glancesVersionCache.delete(baseUrl);
  return null;
};

const setCachedGlancesVersion = (baseUrl: string, version: GlancesApiVersion) => {
  glancesVersionCache.set(baseUrl, { version, checkedAt: Date.now() });
};

const normalizeSystemMetricKeys = (raw: unknown) => {
  const selected = Array.isArray(raw)
    ? raw
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value): value is SystemMonitorMetricKey => SYSTEM_MONITOR_METRIC_KEY_SET.has(value as SystemMonitorMetricKey))
    : [];
  if (selected.length > 0) return Array.from(new Set(selected));
  return [...SYSTEM_MONITOR_METRIC_KEYS];
};

const resolveSystemNodeMetrics = (
  node: SystemMonitorNode,
  options: Pick<FetchSystemMonitorStatusOptions, 'metricKeys' | 'metricsByNode'>
) => {
  const globalMetrics = normalizeSystemMetricKeys(options.metricKeys);
  if (!options.metricsByNode || typeof options.metricsByNode !== 'object' || Array.isArray(options.metricsByNode)) {
    return globalMetrics;
  }
  const rawByNode = options.metricsByNode as Record<string, unknown>;
  const nodeMetrics = normalizeSystemMetricKeys(rawByNode[node.value]);
  return nodeMetrics.length > 0 ? nodeMetrics : globalMetrics;
};

const resolveRequiredGlancesEndpoints = (metrics: SystemMonitorMetricKey[]) => {
  const required = new Set<GlancesEndpoint>(['quicklook', 'os', 'uptime']);
  const metricSet = new Set(metrics);
  if (metricSet.has('activeMemory')) required.add('mem');
  if (metricSet.has('disk')) required.add('fs');
  if (metricSet.has('temperature')) required.add('sensors');
  if (metricSet.has('network')) required.add('network');
  if (metricSet.has('diskio')) required.add('diskio');
  if (metricSet.has('load1') || metricSet.has('load5') || metricSet.has('load15')) {
    required.add('load');
    required.add('cpu');
  }
  return required;
};

const runWithConcurrencyLimit = async <T>(
  taskFactories: Array<() => Promise<T>>,
  concurrency: number
) => {
  const maxConcurrency = Math.max(1, Math.floor(concurrency));
  const results = new Array<T>(taskFactories.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < taskFactories.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await taskFactories[index]!();
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(maxConcurrency, taskFactories.length) }, () => worker())
  );
  return results;
};

const fetchJsonWithStatus = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'manual',
      cache: 'no-store'
    });
    if (!response.ok) {
      return { ok: false as const, status: response.status, data: undefined as unknown };
    }
    return { ok: true as const, status: response.status, data: (await response.json()) as unknown };
  } catch {
    return { ok: false as const, status: null as number | null, data: undefined as unknown };
  } finally {
    clearTimeout(timeout);
  }
};

const fetchGlancesEndpoint = async (
  baseUrl: string,
  nodeKey: string,
  endpoint: GlancesEndpoint,
  timeoutMs: number,
  inFlightByNodeEndpoint: Map<string, Promise<unknown>>
) => {
  const requestKey = `${nodeKey}:${endpoint}`;
  const inFlight = inFlightByNodeEndpoint.get(requestKey);
  if (inFlight) return inFlight;

  const requestPromise = (async () => {
    const cachedVersion = getCachedGlancesVersion(baseUrl);
    const primaryVersion: GlancesApiVersion = cachedVersion ?? 4;
    const fallbackVersion: GlancesApiVersion = primaryVersion === 4 ? 3 : 4;

    const primary = await fetchJsonWithStatus(
      `${baseUrl}/api/${primaryVersion}/${endpoint}`,
      timeoutMs
    );
    if (primary.ok) {
      setCachedGlancesVersion(baseUrl, primaryVersion);
      return primary.data;
    }

    if (!isVersionMissStatus(primary.status)) {
      return undefined;
    }

    const fallback = await fetchJsonWithStatus(
      `${baseUrl}/api/${fallbackVersion}/${endpoint}`,
      timeoutMs
    );
    if (fallback.ok) {
      setCachedGlancesVersion(baseUrl, fallbackVersion);
      return fallback.data;
    }

    return undefined;
  })();

  inFlightByNodeEndpoint.set(requestKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlightByNodeEndpoint.delete(requestKey);
  }
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseUptimeSeconds = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === 'string') {
    const input = value.trim();
    if (!input) return 0;
    if (/^\d+(?:\.\d+)?$/.test(input)) return Math.max(0, Math.floor(Number(input)));

    let seconds = 0;
    let matched = false;

    const dayMatch = input.match(/(\d+(?:\.\d+)?)\s*d(?:ays?)?\b/i);
    if (dayMatch) {
      seconds += Math.floor(Number(dayMatch[1]) * 86400);
      matched = true;
    }
    const hourMatch = input.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?\b/i);
    if (hourMatch) {
      seconds += Math.floor(Number(hourMatch[1]) * 3600);
      matched = true;
    }
    const minuteMatch = input.match(/(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?\b/i);
    if (minuteMatch) {
      seconds += Math.floor(Number(minuteMatch[1]) * 60);
      matched = true;
    }
    const secondMatch = input.match(/(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?\b/i);
    if (secondMatch) {
      seconds += Math.floor(Number(secondMatch[1]));
      matched = true;
    }

    const hmsMatch = input.match(/(\d+):(\d{1,2})(?::(\d{1,2}))?/);
    if (hmsMatch) {
      const a = Number(hmsMatch[1] ?? 0);
      const b = Number(hmsMatch[2] ?? 0);
      const c = Number(hmsMatch[3] ?? 0);
      if (hmsMatch[3] != null) {
        seconds += a * 3600 + b * 60 + c;
      } else {
        seconds += a * 3600 + b * 60;
      }
      matched = true;
    }

    if (matched) return Math.max(0, seconds);
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const candidates = [
      record.seconds,
      record.uptime_seconds,
      record.uptime,
      record.total_seconds,
      record.value
    ];
    for (const candidate of candidates) {
      const parsed = parseUptimeSeconds(candidate);
      if (parsed > 0) return parsed;
    }
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = parseUptimeSeconds(entry);
      if (parsed > 0) return parsed;
    }
  }

  return 0;
};

const extractDiskUsedPercent = (fsPayload: unknown) => {
  if (!Array.isArray(fsPayload)) return 0;
  const rows = fsPayload.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  if (rows.length === 0) return 0;
  const best = rows.reduce((current, row) => {
    const rowValue = row as Record<string, unknown>;
    const usedRaw = toNumber(rowValue.percent, -1);
    if (usedRaw < 0) return current;
    if (!current) return usedRaw;
    return Math.max(current, usedRaw);
  }, 0);
  return best;
};

const extractPlatform = (
  osPayload: unknown,
  quicklookPayload: unknown,
  node?: Pick<SystemMonitorNode, 'value' | 'label' | 'host'>
) => {
  const collectCandidates = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [] as string[];
    const record = value as Record<string, unknown>;
    return [
      record.platform,
      record.os_name,
      record.osname,
      record.name,
      record.system,
      record.kernel_name,
      record.distro
    ]
      .map((entry) => String(entry ?? '').trim().toLowerCase())
      .filter((entry) => entry.length > 0);
  };

  const nodeCandidates = node
    ? [node.value, node.label, node.host]
        .map((entry) => String(entry ?? '').trim().toLowerCase())
        .filter((entry) => entry.length > 0)
    : [];
  const candidates = [
    ...collectCandidates(osPayload),
    ...collectCandidates(quicklookPayload),
    ...nodeCandidates
  ];
  if (candidates.some((entry) => entry.includes('darwin') || entry.includes('mac os') || entry.includes('macos'))) {
    return 'darwin';
  }
  if (candidates.some((entry) => entry.includes('linux'))) {
    return 'linux';
  }
  if (candidates.some((entry) => entry.includes('windows'))) {
    return 'windows';
  }
  return '';
};

const extractActiveMemoryPercent = (memPayload: unknown) => {
  const pickRecord = (value: unknown): Record<string, unknown> | null => {
    if (!value) return null;
    if (Array.isArray(value)) {
      const first = value.find(
        (entry) => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry))
      );
      return first ? (first as Record<string, unknown>) : null;
    }
    if (typeof value === 'object') return value as Record<string, unknown>;
    return null;
  };
  const record = pickRecord(memPayload);
  if (!record) {
    return { percent: NaN, hasActiveSample: false };
  }
  const total = toNumber(
    record.total ?? record.total_memory ?? record.mem_total ?? record.memory_total,
    NaN
  );
  const activeRaw = toNumber(
    record.active ?? record.active_memory ?? record.mem_active ?? record.memory_active,
    NaN
  );
  const wiredRaw = toNumber(
    record.wired ?? record.wired_memory ?? record.mem_wired ?? record.memory_wired,
    NaN
  );
  const hasActiveSample = Number.isFinite(activeRaw);
  if (!Number.isFinite(total) || total <= 0) {
    return { percent: NaN, hasActiveSample };
  }
  const active = Number.isFinite(activeRaw) ? activeRaw : 0;
  const wired = Number.isFinite(wiredRaw) ? wiredRaw : 0;
  if (!Number.isFinite(activeRaw) && !Number.isFinite(wiredRaw)) {
    return { percent: NaN, hasActiveSample };
  }
  const percent = Math.min(100, Math.max(0, ((active + wired) / total) * 100));
  return { percent, hasActiveSample };
};

const extractTemperature = (sensorPayload: unknown, quicklookPayload: unknown) => {
  if (Array.isArray(sensorPayload)) {
    const numeric = sensorPayload
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return NaN;
        const value = entry as Record<string, unknown>;
        return toNumber(
          value.value ??
            value.temperature ??
            value.temp ??
            value.current ??
            value.avg,
          NaN
        );
      })
      .filter((value) => Number.isFinite(value));
    if (numeric.length > 0) {
      return Math.max(...numeric);
    }
  }

  if (quicklookPayload && typeof quicklookPayload === 'object' && !Array.isArray(quicklookPayload)) {
    const quicklook = quicklookPayload as Record<string, unknown>;
    const fallback = toNumber(
      quicklook.temperature ?? quicklook.temp ?? quicklook.cpu_temp ?? quicklook.thermal,
      NaN
    );
    if (Number.isFinite(fallback)) return fallback;
  }

  return NaN;
};

const clampPercent = (value: number, max: number) =>
  Math.min(100, Math.max(0, (Math.max(0, value) / Math.max(1, max)) * 100));

const asBytesPerSecond = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return NaN;
  return parsed;
};

const bytesToMegabytes = (value: number) => value / 1024 / 1024;

const diskIoCounterState = new Map<string, { at: number; read: number; write: number }>();

const extractNetworkRateMB = (networkPayload: unknown) => {
  if (!Array.isArray(networkPayload)) return 0;
  const rows = networkPayload.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  let totalBytesPerSec = 0;
  for (const row of rows) {
    const value = row as Record<string, unknown>;
    const rxCandidates = [
      asBytesPerSecond(value.rx),
      asBytesPerSecond(value.rx_sec),
      asBytesPerSecond(value.bytes_recv_rate),
      asBytesPerSecond(value.bytes_recv),
      asBytesPerSecond(value.bytein)
    ];
    const txCandidates = [
      asBytesPerSecond(value.tx),
      asBytesPerSecond(value.tx_sec),
      asBytesPerSecond(value.bytes_sent_rate),
      asBytesPerSecond(value.bytes_sent),
      asBytesPerSecond(value.byteout)
    ];
    const rx = rxCandidates.find((entry) => Number.isFinite(entry));
    const tx = txCandidates.find((entry) => Number.isFinite(entry));
    if (Number.isFinite(rx)) totalBytesPerSec += rx!;
    if (Number.isFinite(tx)) totalBytesPerSec += tx!;
  }
  return Math.max(0, bytesToMegabytes(totalBytesPerSec));
};

const extractDiskIoRateMB = (diskIoPayload: unknown, nodeKey: string) => {
  if (!Array.isArray(diskIoPayload)) return 0;
  const rows = diskIoPayload.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  let totalBytesPerSec = 0;
  const now = Date.now();
  for (const row of rows) {
    const value = row as Record<string, unknown>;
    // Prefer true rate fields when Glances exposes them.
    const readRateCandidates = [
      asBytesPerSecond(value.read_bytes_rate),
      asBytesPerSecond(value.read_rate),
      asBytesPerSecond(value.r_bytes_rate),
      asBytesPerSecond(value.r_speed)
    ];
    const writeRateCandidates = [
      asBytesPerSecond(value.write_bytes_rate),
      asBytesPerSecond(value.write_rate),
      asBytesPerSecond(value.w_bytes_rate),
      asBytesPerSecond(value.w_speed)
    ];
    const readRate = readRateCandidates.find((entry) => Number.isFinite(entry));
    const writeRate = writeRateCandidates.find((entry) => Number.isFinite(entry));
    if (Number.isFinite(readRate)) totalBytesPerSec += readRate!;
    if (Number.isFinite(writeRate)) totalBytesPerSec += writeRate!;
    if (Number.isFinite(readRate) || Number.isFinite(writeRate)) continue;

    // Fallback for payloads that only expose cumulative counters: delta over time.
    const readTotal = asBytesPerSecond(value.read_bytes);
    const writeTotal = asBytesPerSecond(value.write_bytes);
    if (!Number.isFinite(readTotal) && !Number.isFinite(writeTotal)) continue;
    const diskName = String(value.disk_name ?? value.key ?? value.name ?? value.interface_name ?? 'all').trim() || 'all';
    const stateKey = `${nodeKey}:${diskName}`;
    const prev = diskIoCounterState.get(stateKey);
    const nextRead = Number.isFinite(readTotal) ? readTotal! : prev?.read ?? 0;
    const nextWrite = Number.isFinite(writeTotal) ? writeTotal! : prev?.write ?? 0;
    if (prev && now > prev.at) {
      const elapsedSec = Math.max(0.25, (now - prev.at) / 1000);
      const readDelta = Math.max(0, nextRead - prev.read);
      const writeDelta = Math.max(0, nextWrite - prev.write);
      totalBytesPerSec += (readDelta + writeDelta) / elapsedSec;
    }
    diskIoCounterState.set(stateKey, { at: now, read: nextRead, write: nextWrite });
  }
  return Math.max(0, bytesToMegabytes(totalBytesPerSec));
};

const toLoadTriplet = (loadPayload: unknown, quicklookPayload: unknown) => {
  const fallbackQuicklook =
    quicklookPayload && typeof quicklookPayload === 'object' && !Array.isArray(quicklookPayload)
      ? (quicklookPayload as Record<string, unknown>)
      : {};
  const fromQuicklook = [
    toNumber(fallbackQuicklook.load, NaN),
    toNumber(fallbackQuicklook.load5, NaN),
    toNumber(fallbackQuicklook.load15, NaN)
  ];

  if (Array.isArray(loadPayload) && loadPayload.length > 0) {
    const first = loadPayload[0];
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      const record = first as Record<string, unknown>;
      return {
        load1: toNumber(record.min1 ?? record.load ?? fromQuicklook[0], 0),
        load5: toNumber(record.min5 ?? record.load5 ?? fromQuicklook[1], 0),
        load15: toNumber(record.min15 ?? record.load15 ?? fromQuicklook[2], 0)
      };
    }
  }

  if (loadPayload && typeof loadPayload === 'object' && !Array.isArray(loadPayload)) {
    const record = loadPayload as Record<string, unknown>;
    return {
      load1: toNumber(record.min1 ?? record.load ?? fromQuicklook[0], 0),
      load5: toNumber(record.min5 ?? record.load5 ?? fromQuicklook[1], 0),
      load15: toNumber(record.min15 ?? record.load15 ?? fromQuicklook[2], 0)
    };
  }

  return {
    load1: toNumber(fromQuicklook[0], 0),
    load5: toNumber(fromQuicklook[1], 0),
    load15: toNumber(fromQuicklook[2], 0)
  };
};

const fetchSystemMonitorNode = async (
  node: SystemMonitorNode,
  timeoutMs: number,
  metrics: SystemMonitorMetricKey[],
  inFlightByNodeEndpoint: Map<string, Promise<unknown>>
): Promise<SystemMonitorHost> => {
  const baseUrl =
    normalizeNodeBaseUrl(node.baseUrl) || `http://${node.host}:${node.port ?? DEFAULT_SYSTEM_PORT}`;
  const requiredEndpoints = resolveRequiredGlancesEndpoints(metrics);
  const endpointPayloads = new Map<GlancesEndpoint, unknown>();
  const endpointTasks = Array.from(requiredEndpoints).map((endpoint) => async () => {
    const payload = await fetchGlancesEndpoint(
      baseUrl,
      node.value,
      endpoint,
      timeoutMs,
      inFlightByNodeEndpoint
    );
    endpointPayloads.set(endpoint, payload);
  });
  await runWithConcurrencyLimit(endpointTasks, GLANCES_NODE_CONCURRENCY);

  const quicklookPayload = endpointPayloads.get('quicklook');
  const memPayload = endpointPayloads.get('mem');
  const fsPayload = endpointPayloads.get('fs');
  const sensorsPayload = endpointPayloads.get('sensors');
  const cpuPayload = endpointPayloads.get('cpu');
  const networkPayload = endpointPayloads.get('network');
  const diskIoPayload = endpointPayloads.get('diskio');
  const loadPayload = endpointPayloads.get('load');
  const osPayload = endpointPayloads.get('os');
  const uptimePayload = endpointPayloads.get('uptime');

  const quicklook =
    quicklookPayload && typeof quicklookPayload === 'object' && !Array.isArray(quicklookPayload)
      ? (quicklookPayload as Record<string, unknown>)
      : {};

  const cpu = Math.min(100, Math.max(0, toNumber(quicklook.cpu, 0)));
  const memory = Math.min(100, Math.max(0, toNumber(quicklook.mem, 0)));
  const { percent: activeMemoryPercent, hasActiveSample } = extractActiveMemoryPercent(memPayload);
  const platform = extractPlatform(osPayload, quicklookPayload, node);
  const includeActiveMemory = platform === 'darwin' || hasActiveSample;
  const disk = Math.min(100, Math.max(0, extractDiskUsedPercent(fsPayload)));
  const rawTemperature = extractTemperature(sensorsPayload, quicklook);
  const hasTemperature = Number.isFinite(rawTemperature);
  const temperature = hasTemperature
    ? Math.min(120, Math.max(0, rawTemperature))
    : NaN;
  const networkMB = Math.min(99999, Math.max(0, extractNetworkRateMB(networkPayload)));
  const diskIoMB = Math.min(99999, Math.max(0, extractDiskIoRateMB(diskIoPayload, node.value)));
  const { load1, load5, load15 } = toLoadTriplet(loadPayload, quicklook);
  const cpuRecord =
    cpuPayload && typeof cpuPayload === 'object' && !Array.isArray(cpuPayload)
      ? (cpuPayload as Record<string, unknown>)
      : {};
  const cpuCores = Math.max(
    1,
    Math.round(
      toNumber(
        cpuRecord.cpucore ??
          quicklook.cores ??
          quicklook.cpu_cores ??
          quicklook.core ??
          quicklook.cpu_count,
        0
      )
    ) || 8
  );
  const loadMax = Math.max(1, cpuCores);
  const loadPercent = Math.min(100, Math.max(0, (Math.max(0, load1) / Math.max(1, cpuCores)) * 100));
  const uptimeSec =
    [
      quicklook.uptime,
      quicklook.uptime_seconds,
      quicklook.system_uptime,
      uptimePayload
    ]
      .map((candidate) => parseUptimeSeconds(candidate))
      .find((value) => value > 0) ?? 0;

  const hasTelemetry = Boolean(
    quicklookPayload || fsPayload || sensorsPayload || networkPayload || diskIoPayload || loadPayload
  );
  const status: SystemMonitorHost['status'] = hasTelemetry ? 'ok' : 'down';

  return {
    id: node.value,
    label: node.label,
    host: node.host,
    ...(platform ? { platform } : {}),
    uptimeText: formatUptime(uptimeSec),
    uptimeSec,
    status,
    metrics: [
      { key: 'cpu', label: 'CPU', value: cpu, actual: cpu, percent: cpu, unit: '%', max: 100 },
      {
        key: 'memory',
        label: 'Memory',
        value: memory,
        actual: memory,
        percent: memory,
        unit: '%',
        max: 100
      },
      ...(includeActiveMemory
        ? [{
            key: 'activeMemory' as const,
            label: 'Active Memory',
            value: Number.isFinite(activeMemoryPercent) ? activeMemoryPercent : 0,
            actual: activeMemoryPercent,
            percent: Number.isFinite(activeMemoryPercent) ? activeMemoryPercent : 0,
            unit: '%',
            max: 100
          }]
        : []),
      { key: 'disk', label: 'Disk', value: disk, actual: disk, percent: disk, unit: '%', max: 100 },
      {
        key: 'temperature',
        label: 'CPU Temp',
        value: Number.isFinite(temperature) ? temperature : 0,
        actual: temperature,
        percent: Number.isFinite(temperature) ? clampPercent(temperature, 120) : 0,
        unit: 'C',
        max: 120
      },
      {
        key: 'network',
        label: 'Network',
        value: networkMB,
        actual: networkMB,
        percent: clampPercent(networkMB, 125),
        unit: 'MB/s',
        max: 125
      },
      {
        key: 'diskio',
        label: 'Disk I/O',
        value: diskIoMB,
        actual: diskIoMB,
        percent: clampPercent(diskIoMB, 500),
        unit: 'MB/s',
        max: 500
      },
      {
        key: 'load1',
        label: 'Load 1m',
        value: Math.max(0, load1),
        actual: Math.max(0, load1),
        percent: loadPercent,
        unit: '',
        max: loadMax
      },
      {
        key: 'load5',
        label: 'Load 5m',
        value: Math.max(0, load5),
        actual: Math.max(0, load5),
        percent: clampPercent(load5, loadMax),
        unit: '',
        max: loadMax
      },
      {
        key: 'load15',
        label: 'Load 15m',
        value: Math.max(0, load15),
        actual: Math.max(0, load15),
        percent: clampPercent(load15, loadMax),
        unit: '',
        max: loadMax
      }
    ]
  };
};

export const fetchSystemMonitorStatus = async (
  options: FetchSystemMonitorStatusOptions = {}
): Promise<MonitorPayload> => {
  const timeoutMs = Math.min(15000, Math.max(500, Number(options.timeoutMs ?? 6000)));
  const nodes = normalizeSystemNodes(options.nodes);
  if (nodes.length === 0) {
    return {
      items: [],
      systemHosts: [],
      checkedAt: new Date().toISOString(),
      mode: 'system',
      error: 'No system monitor nodes configured'
    };
  }

  const inFlightByNodeEndpoint = new Map<string, Promise<unknown>>();
  const systemHosts = await Promise.all(
    nodes.map((node) =>
      fetchSystemMonitorNode(
        node,
        timeoutMs,
        resolveSystemNodeMetrics(node, options),
        inFlightByNodeEndpoint
      )
    )
  );
  return {
    items: [],
    systemHosts,
    checkedAt: new Date().toISOString(),
    mode: 'system'
  };
};
