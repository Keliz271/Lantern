import { broadcast } from './stream';
import { env } from '$env/dynamic/private';
import type { WidgetInstance, DashboardSettings } from '$widgets/types';
import {
  normalizeDashboardSettings as normalizeSharedDashboardSettings,
  resolveDashboardDefaultTabId
} from '$lib/shared/dashboardSettings';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fetchTechnitiumStats } from './connectors/technitium';
import { fetchKomodoStacks } from './connectors/komodo';
import { fetchArrMetric } from './connectors/arr';
import { fetchSeerrMetric, fetchSeerrRequests } from './connectors/seerr';
import { fetchAudiobookshelfStats } from './connectors/audiobookshelf';
import { fetchSabnzbdOverview, fetchSabnzbdStats } from './connectors/sabnzbd';
import { fetchQbittorrentOverview, fetchQbittorrentStats } from './connectors/qbittorrent';
import { fetchHomeAssistantStats } from './connectors/homeAssistant';
import { fetchScrutinyStats } from './connectors/scrutiny';
import { fetchTandoorStats } from './connectors/tandoor';
import {
  fetchSpeedtestTrackerStats,
  fetchSpeedtestTrackerHistory
} from './connectors/speedtestTracker';
import { fetchPlexStats } from './connectors/plex';
import { fetchProwlarrIndexers } from './connectors/prowlarr';
import { fetchProfilarrStats } from './connectors/profilarr';
import { fetchMediaHistory, fetchPlexNowPlaying } from './connectors/mediaHistory';
import {
  fetchMonitorStatus,
  fetchSystemMonitorStatus,
  normalizeMonitorTargets,
  SYSTEM_MONITOR_METRIC_KEYS
} from './connectors/monitor';
import {
  fetchDockerContainers,
  getDefaultDockerServer,
  getDockerServers,
  resolveContainerHealth
} from '$serverlib/connectors/docker';
import { readPrivateEnv } from '$serverlib/env';
import { stripRuntimeWidgetFields } from '$serverlib/configSanitizer';

type WidgetConfig = { widgets: WidgetInstance[]; settings?: DashboardSettings };
const DEFAULT_DASHBOARD_TAB = { id: 'main', name: 'Main' } as const;
const SEERR_DEFAULT_METRICS = ['pending', 'approved', 'processing', 'available'] as const;
const SEERR_ALLOWED_METRICS = ['pending', 'approved', 'processing', 'available', 'unavailable'] as const;
const RADARR_DEFAULT_METRICS = ['wanted', 'missing', 'queued'] as const;
const RADARR_ALLOWED_METRICS = ['wanted', 'missing', 'queued', 'movies'] as const;
const READARR_DEFAULT_METRICS = ['wanted', 'queued', 'books'] as const;
const READARR_ALLOWED_METRICS = ['wanted', 'queued', 'books'] as const;
const SONARR_DEFAULT_METRICS = ['wanted', 'queued', 'series'] as const;
const SONARR_ALLOWED_METRICS = ['wanted', 'queued', 'series'] as const;
const AUDIOBOOKSHELF_DEFAULT_METRICS = ['podcasts', 'podcastsDuration', 'books', 'booksDuration'] as const;
const AUDIOBOOKSHELF_ALLOWED_METRICS = ['podcasts', 'podcastsDuration', 'books', 'booksDuration'] as const;
const SABNZBD_DEFAULT_METRICS = ['rate', 'queue', 'timeleft'] as const;
const SABNZBD_ALLOWED_METRICS = ['rate', 'queue', 'timeleft'] as const;
const QBITTORRENT_DEFAULT_METRICS = ['leech', 'download', 'seed', 'upload'] as const;
const QBITTORRENT_ALLOWED_METRICS = ['leech', 'download', 'seed', 'upload'] as const;
const KOMODO_DEFAULT_METRICS = ['summary_servers', 'summary_stacks', 'summary_containers'] as const;
const KOMODO_ALLOWED_METRICS = [
  'container_total',
  'container_running',
  'container_stopped',
  'container_unhealthy',
  'container_unknown',
  'stack_total',
  'stack_running',
  'stack_stopped',
  'stack_unhealthy',
  'stack_unknown',
  'summary_servers',
  'summary_stacks',
  'summary_containers'
] as const;
const PROWLARR_DEFAULT_METRICS = [
  'numberOfGrabs',
  'numberOfQueries',
  'numberOfFailGrabs',
  'numberOfFailQueries'
] as const;
const PROWLARR_ALLOWED_METRICS = [
  'numberOfGrabs',
  'numberOfQueries',
  'numberOfFailGrabs',
  'numberOfFailQueries'
] as const;
const PROFILARR_DEFAULT_METRICS = ['lastRepoSync', 'lastCommit', 'syncedProfiles'] as const;
const PROFILARR_ALLOWED_METRICS = [
  'lastRepoSync',
  'lastCommit',
  'syncedProfiles',
  'failedSyncTasks24h',
  'lastSyncStatus',
  'commitsBehindAhead',
  'customFormats'
] as const;
const HOME_ASSISTANT_DEFAULT_METRICS = ['people_home', 'lights_on', 'switches_on'] as const;
const HOME_ASSISTANT_ALLOWED_METRICS = ['people_home', 'lights_on', 'switches_on'] as const;
const HOME_ASSISTANT_ALLOWED_METRIC_SET = new Set<string>(HOME_ASSISTANT_ALLOWED_METRICS);
const SCRUTINY_DEFAULT_METRICS = ['passed', 'failed', 'unknown'] as const;
const SCRUTINY_ALLOWED_METRICS = ['passed', 'failed', 'unknown'] as const;
const TANDOOR_DEFAULT_METRICS = ['users', 'recipes', 'keywords'] as const;
const TANDOOR_ALLOWED_METRICS = ['users', 'recipes', 'keywords'] as const;
const SPEEDTEST_TRACKER_DEFAULT_METRICS = ['download', 'upload', 'ping'] as const;
const SPEEDTEST_TRACKER_ALLOWED_METRICS = ['download', 'upload', 'ping'] as const;
const PLEX_DEFAULT_METRICS = ['streams', 'albums', 'movies', 'tv'] as const;
const PLEX_ALLOWED_METRICS = ['streams', 'albums', 'movies', 'tv'] as const;
const TECHNITIUM_DEFAULT_METRICS = ['totalQueries', 'blockedPct', 'latency'] as const;
const TECHNITIUM_ALLOWED_METRICS = [
  'totalQueries',
  'blockedPct',
  'latency',
  'failures',
  'cachedAvgLatency',
  'cached',
  'recursive',
  'authoritative'
] as const;
const SYSTEM_MONITOR_DEFAULT_METRICS = ['cpu', 'memory', 'disk', 'temperature'] as const;
const RUNTIME_KEY = '__dashboard_state_runtime__';

const isHomeAssistantMetricKey = (
  value: string
): value is (typeof HOME_ASSISTANT_ALLOWED_METRICS)[number] =>
  HOME_ASSISTANT_ALLOWED_METRIC_SET.has(value);

type RuntimeState = {
  timer?: ReturnType<typeof setInterval>;
  refreshIntervalMs?: number;
  refreshPromise?: Promise<void> | null;
  diskRefreshPromise?: Promise<{ widgets: WidgetInstance[]; settings: DashboardSettings }> | null;
  lastDiskRefreshAt?: number;
  lastRefreshAtByWidgetId?: Record<string, number>;
  widgets?: WidgetInstance[];
  settings?: DashboardSettings;
};

const getRuntimeState = () => {
  const globalRef = globalThis as typeof globalThis & {
    [RUNTIME_KEY]?: RuntimeState;
  };
  if (!globalRef[RUNTIME_KEY]) {
    globalRef[RUNTIME_KEY] = {
      refreshPromise: null,
      diskRefreshPromise: null,
      lastDiskRefreshAt: 0,
      lastRefreshAtByWidgetId: {}
    };
  }
  const runtime = globalRef[RUNTIME_KEY]!;
  if (!('refreshPromise' in runtime)) runtime.refreshPromise = null;
  if (!('diskRefreshPromise' in runtime)) runtime.diskRefreshPromise = null;
  if (!('lastDiskRefreshAt' in runtime)) runtime.lastDiskRefreshAt = 0;
  if (!runtime.lastRefreshAtByWidgetId) runtime.lastRefreshAtByWidgetId = {};
  return runtime;
};

const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value);

const normalizeMonitorNodeBaseUrl = (value: unknown) => {
  const input = String(value ?? '').trim();
  if (!input) return '';
  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(input) ? input : `http://${input}`;
  try {
    const parsed = new URL(withScheme);
    return parsed.origin;
  } catch {
    return '';
  }
};

const normalizeDashboardSettings = (rawSettings?: DashboardSettings): DashboardSettings =>
  normalizeSharedDashboardSettings(rawSettings);

const resolveWidgetTabId = (
  options: Record<string, unknown>,
  dashboardSettings: DashboardSettings
) => {
  const tabs =
    Array.isArray(dashboardSettings.tabs) && dashboardSettings.tabs.length > 0
      ? dashboardSettings.tabs
      : [{ id: DEFAULT_DASHBOARD_TAB.id, name: DEFAULT_DASHBOARD_TAB.name }];
  const fallbackTabId = resolveDashboardDefaultTabId(
    tabs,
    dashboardSettings.defaultTabIdWeb ?? dashboardSettings.defaultTabId
  );
  const requestedTabId = typeof options.tabId === 'string' ? options.tabId.trim() : '';
  return tabs.some((tab) => tab.id === requestedTabId) ? requestedTabId : fallbackTabId;
};

const resolveConfigPath = () => {
  const override = String(readPrivateEnv('LANTERN_CONFIG_PATH', 'DASHBOARD_CONFIG_PATH') ?? '').trim();
  if (override) return override;
  // docker-compose commonly mounts the config at /config/widgets.json
  // so prefer it when present.
  const dockerMounted = '/config/widgets.json';
  if (existsSync(dockerMounted)) return dockerMounted;
  return path.resolve(process.cwd(), 'config/widgets.json');
};

const loadConfigFromDisk = async (): Promise<WidgetConfig> => {
  try {
    const raw = await readFile(resolveConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw) as WidgetConfig;
    if (!parsed || typeof parsed !== 'object') {
      return { widgets: [] };
    }
    return {
      ...parsed,
      widgets: stripRuntimeWidgetFields(Array.isArray(parsed.widgets) ? parsed.widgets : [])
    };
  } catch (error) {
    // If the file doesn't exist in a fresh container, start with empty config.
    if ((error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
      return { widgets: [] };
    }
    throw error;
  }
};

let config: WidgetConfig;
try {
  config = await loadConfigFromDisk();
} catch {
  config = { widgets: [] };
}
let settings: DashboardSettings = normalizeDashboardSettings(config.settings);
{
  const runtimeState = getRuntimeState();
  if (runtimeState.settings) {
    settings = runtimeState.settings;
  }
}

const normalizeLinkValue = (value?: string) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
};

const getSourceDefaultLink = (source?: string) => {
  switch (source) {
    case 'komodo':
      return env.KOMODO_URL;
    case 'technitium':
      return env.TECHNITIUM_URL;
    case 'radarr':
      return env.RADARR_URL;
    case 'sonarr':
      return env.SONARR_URL;
    case 'readarr':
      return env.READARR_URL;
    case 'audiobookshelf':
      return env.AUDIOBOOKSHELF_URL;
    case 'sabnzbd':
      return env.SABNZBD_URL;
    case 'qbittorrent':
      return env.QBITTORRENT_URL;
    case 'home-assistant':
      return env.HOME_ASSISTANT_URL;
    case 'scrutiny':
      return env.SCRUTINY_URL;
    case 'tandoor':
      return env.TANDOOR_URL;
    case 'speedtest-tracker':
      return env.SPEEDTEST_TRACKER_URL;
    case 'prowlarr':
      return env.PROWLARR_URL;
    case 'profilarr':
      return env.PROFILARR_URL;
    case 'grafana':
      return env.GRAFANA_URL;
    case 'plex':
      return env.PLEX_URL;
    case 'seerr':
    case 'seerr-requests':
      return env.SEERR_URL;
    case 'media-history':
      return env.PLEX_URL ?? env.JELLYFIN_URL;
    default:
      return undefined;
  }
};

const resolveWidgetLink = (widget: WidgetInstance) => {
  const explicit = normalizeLinkValue(widget.link);
  if (explicit) return explicit;
  if (widget.kind === 'plex' || widget.kind === 'history') {
    const subtype = widget.options?.subtype === 'now-playing' ? 'now-playing' : 'history';
    const provider = widget.options?.provider === 'jellyfin' ? 'jellyfin' : 'plex';
    const baseUrl = normalizeLinkValue(
      typeof widget.options?.baseUrl === 'string'
        ? widget.options.baseUrl
        : subtype === 'history' && provider === 'jellyfin'
          ? env.JELLYFIN_URL
          : env.PLEX_URL
    );
    if (baseUrl) return baseUrl;
  }
  if ((widget.source === 'monitor' || widget.source === 'service-hub') || widget.kind === 'monitor' || widget.kind === 'systemMonitor') {
    const targetsText =
      typeof widget.options?.targetsText === 'string' ? widget.options.targetsText : '';
    const target = normalizeMonitorTargets(widget.options?.targets, targetsText)[0];
    const fromTarget = normalizeLinkValue(target?.url);
    if (fromTarget) return fromTarget;
  }
  const rawBaseUrl = widget.options?.baseUrl;
  const optionBase = typeof rawBaseUrl === 'string' ? normalizeLinkValue(rawBaseUrl) : undefined;
  if (optionBase) return optionBase;
  return getSourceDefaultLink(widget.source);
};

const resolveHealthDefaults = (widget: WidgetInstance, defaultServer: string) => {
  const options = { ...(widget.options ?? {}) } as Record<string, unknown>;
  const isMonitorWidget =
    (widget.source === 'monitor' || widget.source === 'service-hub') || widget.kind === 'monitor' || widget.kind === 'systemMonitor';
  const hasHealthServer = Object.prototype.hasOwnProperty.call(options, 'healthServer');
  const hasHealthContainer = Object.prototype.hasOwnProperty.call(options, 'healthContainer');
  const healthServer =
    typeof options.healthServer === 'string' ? options.healthServer.trim() : '';
  const healthContainer =
    typeof options.healthContainer === 'string' ? options.healthContainer.trim() : '';

  if (!isMonitorWidget && !hasHealthContainer && !healthContainer && widget.source) {
    options.healthContainer = widget.source;
  }

  const resolvedContainer = isMonitorWidget ? healthContainer : healthContainer || (widget.source ?? '');

  if (!isMonitorWidget && !hasHealthServer && !healthServer && defaultServer && resolvedContainer) {
    options.healthServer = defaultServer;
  }

  return options;
};

const unique = (items: string[]) => Array.from(new Set(items));

const normalizeMetricList = (
  raw: unknown,
  allowed: readonly string[],
  defaults: readonly string[],
  max: number
) => {
  const selected = Array.isArray(raw)
    ? unique(raw.filter((item): item is string => typeof item === 'string'))
        .filter((item) => allowed.includes(item))
        .slice(0, max)
    : [];
  if (selected.length > 0) return selected;
  return unique([...defaults]).filter((item) => allowed.includes(item)).slice(0, max);
};

const normalizeMetricStyleOptions = (
  options: Record<string, unknown>,
  defaults: {
    boxHeight: number;
    fontSize: number;
    fontColor: string;
    labelFontSize?: number;
    labelFontColor?: string;
  }
) => {
  options.metricBoxWidth = Math.min(600, Math.max(0, Number(options.metricBoxWidth ?? 0)));
  options.metricBoxHeight = Math.min(
    220,
    Math.max(24, Number(options.metricBoxHeight ?? defaults.boxHeight))
  );
  options.metricBoxBorder = options.metricBoxBorder !== false;
  options.metricBoxBackgroundColor = isHexColor(options.metricBoxBackgroundColor)
    ? options.metricBoxBackgroundColor
    : '#0a1018';
  options.metricBoxBorderColor = isHexColor(options.metricBoxBorderColor)
    ? options.metricBoxBorderColor
    : '#ffffff';
  options.metricBoxBorderStyle =
    options.metricBoxBorderStyle === 'dashed' || options.metricBoxBorderStyle === 'glow'
      ? options.metricBoxBorderStyle
      : 'solid';
  options.metricFont =
    typeof options.metricFont === 'string' ? options.metricFont.trim() : '';
  options.metricFontSize = Math.min(
    48,
    Math.max(8, Number(options.metricFontSize ?? defaults.fontSize))
  );
  options.metricFontWeight = Math.min(
    900,
    Math.max(300, Number(options.metricFontWeight ?? 600))
  );
  options.metricFontColor = isHexColor(options.metricFontColor)
    ? options.metricFontColor
    : defaults.fontColor;
  options.metricLabelFont =
    typeof options.metricLabelFont === 'string' ? options.metricLabelFont.trim() : '';
  options.metricLabelFontSize = Math.min(
    48,
    Math.max(
      8,
      Number(options.metricLabelFontSize ?? defaults.labelFontSize ?? 12)
    )
  );
  options.metricLabelFontWeight = Math.min(
    900,
    Math.max(300, Number(options.metricLabelFontWeight ?? 600))
  );
  options.metricLabelFontColor = isHexColor(options.metricLabelFontColor)
    ? options.metricLabelFontColor
    : defaults.labelFontColor ?? defaults.fontColor;
};

const normalizeSourceOptions = (widget: WidgetInstance, options: Record<string, unknown>) => {
  const normalized = { ...options };
  if (!Object.prototype.hasOwnProperty.call(normalized, 'titleAboveSpacer')) {
    normalized.titleAboveSpacer = false;
  }
  normalized.cardTitleFont =
    typeof normalized.cardTitleFont === 'string' ? normalized.cardTitleFont.trim() : '';
  {
    const weight = Number(normalized.cardTitleWeight ?? 0);
    normalized.cardTitleWeight =
      Number.isFinite(weight) && weight > 0 ? Math.min(900, Math.max(300, weight)) : '';
  }
  {
    const size = Number(normalized.cardTitleSize ?? 0);
    normalized.cardTitleSize =
      Number.isFinite(size) && size > 0 ? Math.min(48, Math.max(8, size)) : '';
  }
  normalized.cardTitleColor = isHexColor(normalized.cardTitleColor)
    ? normalized.cardTitleColor
    : '';
  normalized.cardHeaderFont =
    typeof normalized.cardHeaderFont === 'string' ? normalized.cardHeaderFont.trim() : '';
  {
    const weight = Number(normalized.cardHeaderWeight ?? 0);
    normalized.cardHeaderWeight =
      Number.isFinite(weight) && weight > 0 ? Math.min(900, Math.max(300, weight)) : '';
  }
  {
    const size = Number(normalized.cardHeaderSize ?? 0);
    normalized.cardHeaderSize =
      Number.isFinite(size) && size > 0 ? Math.min(36, Math.max(8, size)) : '';
  }
  normalized.cardHeaderColor = isHexColor(normalized.cardHeaderColor)
    ? normalized.cardHeaderColor
    : '';

  if (widget.kind === 'clock') {
    normalized.clockDateSize = Math.min(
      64,
      Math.max(10, Number(normalized.clockDateSize ?? 17))
    );
    normalized.clockYearSize = Math.min(
      48,
      Math.max(9, Number(normalized.clockYearSize ?? 13))
    );
    normalized.clockTimeSize = Math.min(
      84,
      Math.max(12, Number(normalized.clockTimeSize ?? 26))
    );
    normalized.clockDateColor = isHexColor(normalized.clockDateColor)
      ? normalized.clockDateColor
      : '#eef4ff';
    normalized.clockYearColor = isHexColor(normalized.clockYearColor)
      ? normalized.clockYearColor
      : '#9aa8ba';
    normalized.clockTimeColor = isHexColor(normalized.clockTimeColor)
      ? normalized.clockTimeColor
      : '#eef4ff';
    normalized.clockDateFont =
      typeof normalized.clockDateFont === 'string'
        ? normalized.clockDateFont.trim()
        : '';
    normalized.clockYearFont =
      typeof normalized.clockYearFont === 'string'
        ? normalized.clockYearFont.trim()
        : '';
    normalized.clockTimeFont =
      typeof normalized.clockTimeFont === 'string'
        ? normalized.clockTimeFont.trim()
        : '';
  }

  if (widget.source === 'seerr') {
    const legacyMetric =
      typeof normalized.metric === 'string' ? [normalized.metric] : [];
    normalized.metrics = normalizeMetricList(
      Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
      SEERR_ALLOWED_METRICS,
      SEERR_DEFAULT_METRICS,
      4
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
  }

  if (widget.source === 'technitium') {
    normalized.metrics = normalizeMetricList(
      normalized.metrics,
      TECHNITIUM_ALLOWED_METRICS,
      TECHNITIUM_DEFAULT_METRICS,
      8
    );
    normalized.barStyle =
      normalized.barStyle === 'pill-liquid' || normalized.barStyle === 'squircle'
        ? normalized.barStyle
        : 'classic';
    normalized.barWidth = Math.min(48, Math.max(8, Number(normalized.barWidth ?? 18)));
    normalized.barGap = Math.min(24, Math.max(2, Number(normalized.barGap ?? 8)));
    normalized.barBorder = Math.min(
      8,
      Math.max(0, Number(normalized.barBorder ?? normalized.barGlow ?? 1))
    );
    normalized.barBorderColor = isHexColor(normalized.barBorderColor)
      ? normalized.barBorderColor
      : '#d2e4f6';
    normalized.barHeightScale = Math.min(1.8, Math.max(0.4, Number(normalized.barHeightScale ?? 1)));
    normalized.cornerSmoothing = Math.min(100, Math.max(0, Number(normalized.cornerSmoothing ?? 100)));
    normalized.dnsAxisFont =
      typeof normalized.dnsAxisFont === 'string' ? normalized.dnsAxisFont.trim() : '';
    normalized.dnsAxisWeight = Math.min(900, Math.max(300, Number(normalized.dnsAxisWeight ?? 600)));
    normalized.dnsAxisSize = Math.min(30, Math.max(8, Number(normalized.dnsAxisSize ?? 11)));
    normalized.dnsAxisColor = isHexColor(normalized.dnsAxisColor) ? normalized.dnsAxisColor : '#9fb4ca';
    normalized.dnsLegendFont =
      typeof normalized.dnsLegendFont === 'string' ? normalized.dnsLegendFont.trim() : '';
    normalized.dnsLegendWeight = Math.min(
      900,
      Math.max(300, Number(normalized.dnsLegendWeight ?? 600))
    );
    normalized.dnsLegendSize = Math.min(32, Math.max(8, Number(normalized.dnsLegendSize ?? 12)));
    normalized.dnsLegendColor = isHexColor(normalized.dnsLegendColor)
      ? normalized.dnsLegendColor
      : '#cadbec';
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
  }

  if (widget.source === 'komodo') {
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    if (widget.kind === 'stat') {
      normalized.metrics = normalizeMetricList(
        Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
        KOMODO_ALLOWED_METRICS,
        KOMODO_DEFAULT_METRICS,
        KOMODO_ALLOWED_METRICS.length
      );
      if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
        normalized.metricBoxes = true;
      }
      normalizeMetricStyleOptions(normalized, {
        boxHeight: 52,
        fontSize: 14,
        fontColor: '#eef4ff'
      });
    }
    normalized.komodoColumns = Math.min(
      12,
      Math.max(1, Number(normalized.komodoColumns ?? 3))
    );
    normalized.komodoRows = Math.min(
      20,
      Math.max(0, Number(normalized.komodoRows ?? 2))
    );
    normalized.containerWidth = Math.min(
      800,
      Math.max(160, Number(normalized.containerWidth ?? 280))
    );
    normalized.containerHeight = Math.min(
      320,
      Math.max(72, Number(normalized.containerHeight ?? 112))
    );
    normalized.containerNameSize = Math.min(
      48,
      Math.max(10, Number(normalized.containerNameSize ?? 16))
    );
    normalized.containerNameWeight = Math.min(
      900,
      Math.max(300, Number(normalized.containerNameWeight ?? 600))
    );
    normalized.containerNameFont =
      typeof normalized.containerNameFont === 'string'
        ? normalized.containerNameFont.trim()
        : '';
    normalized.containerNameColor = isHexColor(normalized.containerNameColor)
      ? normalized.containerNameColor
      : '#eef4ff';
    normalized.containerServerFont =
      typeof normalized.containerServerFont === 'string'
        ? normalized.containerServerFont.trim()
        : '';
    normalized.containerServerWeight = Math.min(
      900,
      Math.max(300, Number(normalized.containerServerWeight ?? 600))
    );
    normalized.containerServerSize = Math.min(
      36,
      Math.max(8, Number(normalized.containerServerSize ?? 12))
    );
    normalized.containerServerColor = isHexColor(normalized.containerServerColor)
      ? normalized.containerServerColor
      : '#9aa8ba';
    normalized.containerBackgroundColor = isHexColor(normalized.containerBackgroundColor)
      ? normalized.containerBackgroundColor
      : '#0a1018';
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showContainerBorder')) {
      normalized.showContainerBorder = true;
    } else {
      normalized.showContainerBorder = normalized.showContainerBorder !== false;
    }
    normalized.containerBorderColor = isHexColor(normalized.containerBorderColor)
      ? normalized.containerBorderColor
      : '#ffffff';
    normalized.containerBorderStyle =
      normalized.containerBorderStyle === 'dashed' || normalized.containerBorderStyle === 'glow'
        ? normalized.containerBorderStyle
        : 'solid';
    normalized.baseUrl =
      typeof normalized.baseUrl === 'string' ? normalized.baseUrl.trim() : '';
    normalized.apiKey =
      typeof normalized.apiKey === 'string' ? normalized.apiKey.trim() : '';
    normalized.apiSecret =
      typeof normalized.apiSecret === 'string' ? normalized.apiSecret.trim() : '';
    if (
      !normalized.iconOverrides ||
      typeof normalized.iconOverrides !== 'object' ||
      Array.isArray(normalized.iconOverrides)
    ) {
      normalized.iconOverrides = {};
    } else {
      normalized.iconOverrides = Object.fromEntries(
        Object.entries(normalized.iconOverrides as Record<string, unknown>).filter(
          ([name, value]) => typeof name === 'string' && typeof value === 'string'
        )
      );
    }
  }

  if (widget.source === 'seerr-requests') {
    normalized.limit = Math.min(30, Math.max(1, Number(normalized.limit ?? 10)));
    normalized.height = Math.max(220, Number(normalized.height ?? 450));
    normalized.metrics = normalizeMetricList(
      normalized.metrics,
      SEERR_ALLOWED_METRICS,
      SEERR_DEFAULT_METRICS,
      SEERR_ALLOWED_METRICS.length
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showMetrics')) {
      normalized.showMetrics = false;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 46,
      fontSize: 13,
      fontColor: '#eef4ff'
    });
    normalized.titleSize = Math.min(48, Math.max(9, Number(normalized.titleSize ?? 13)));
    normalized.titleColor = isHexColor(normalized.titleColor)
      ? normalized.titleColor
      : '#eef4ff';
    normalized.titleFont =
      typeof normalized.titleFont === 'string' ? normalized.titleFont.trim() : '';
    normalized.mediaSize = Math.min(36, Math.max(8, Number(normalized.mediaSize ?? 11)));
    normalized.mediaColor = isHexColor(normalized.mediaColor)
      ? normalized.mediaColor
      : '#9dbad0';
    normalized.mediaFont =
      typeof normalized.mediaFont === 'string' ? normalized.mediaFont.trim() : '';
    normalized.statusSize = Math.min(36, Math.max(8, Number(normalized.statusSize ?? 11)));
    normalized.statusScale = Math.min(1.8, Math.max(0.7, Number(normalized.statusScale ?? 1)));
    normalized.statusColor = isHexColor(normalized.statusColor)
      ? normalized.statusColor
      : '#d9ecff';
    normalized.statusFont =
      typeof normalized.statusFont === 'string' ? normalized.statusFont.trim() : '';
    normalized.userSize = Math.min(40, Math.max(9, Number(normalized.userSize ?? 11)));
    normalized.userColor = isHexColor(normalized.userColor)
      ? normalized.userColor
      : '#a8c7df';
    normalized.userFont =
      typeof normalized.userFont === 'string' ? normalized.userFont.trim() : '';
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showHealth')) {
      normalized.showHealth = false;
    }
  }

  if (widget.source === 'radarr') {
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    normalized.metrics = normalizeMetricList(
      Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
      RADARR_ALLOWED_METRICS,
      RADARR_DEFAULT_METRICS,
      4
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
  }

  if (widget.source === 'readarr') {
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    normalized.metrics = normalizeMetricList(
      Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
      READARR_ALLOWED_METRICS,
      READARR_DEFAULT_METRICS,
      3
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
  }

  if (widget.source === 'sonarr') {
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    normalized.metrics = normalizeMetricList(
      Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
      SONARR_ALLOWED_METRICS,
      SONARR_DEFAULT_METRICS,
      3
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
  }

  if (widget.source === 'audiobookshelf') {
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    normalized.metrics = normalizeMetricList(
      Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
      AUDIOBOOKSHELF_ALLOWED_METRICS,
      AUDIOBOOKSHELF_DEFAULT_METRICS,
      4
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
  }

  if (widget.source === 'sabnzbd') {
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    normalized.metrics = normalizeMetricList(
      Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
      SABNZBD_ALLOWED_METRICS,
      SABNZBD_DEFAULT_METRICS,
      3
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
  }

  if (widget.kind === 'sabnzbd') {
    normalized.showHistory = normalized.showHistory !== false;
    normalized.queueLimit = Math.min(30, Math.max(1, Number(normalized.queueLimit ?? 8)));
    normalized.historyLimit = Math.min(30, Math.max(1, Number(normalized.historyLimit ?? 8)));
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showHealth')) {
      normalized.showHealth = false;
    }
  }

  if (widget.source === 'qbittorrent') {
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    normalized.metrics = normalizeMetricList(
      Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
      QBITTORRENT_ALLOWED_METRICS,
      QBITTORRENT_DEFAULT_METRICS,
      4
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
  }

  if (widget.source === 'home-assistant') {
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    if (Array.isArray(normalized.metrics)) {
      normalized.metrics = unique(
        normalized.metrics.filter((item): item is string => typeof item === 'string')
      )
        .filter(isHomeAssistantMetricKey)
        .slice(0, 3);
    } else if (legacyMetric.length > 0) {
      normalized.metrics = normalizeMetricList(
        legacyMetric,
        HOME_ASSISTANT_ALLOWED_METRICS,
        HOME_ASSISTANT_DEFAULT_METRICS,
        3
      );
    } else {
      normalized.metrics = [...HOME_ASSISTANT_DEFAULT_METRICS].slice(0, 3);
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    if (Array.isArray(normalized.customMetrics)) {
      normalized.customMetrics = normalized.customMetrics
        .map((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
          const value = entry as Record<string, unknown>;
          const state = typeof value.state === 'string' ? value.state.trim() : '';
          const template = typeof value.template === 'string' ? value.template.trim() : '';
          const label = typeof value.label === 'string' ? value.label.trim() : '';
          const metricValue = typeof value.value === 'string' ? value.value.trim() : '';
          if (!state && !template) return null;
          return { state, template, label, value: metricValue };
        })
        .filter((entry): entry is { state: string; template: string; label: string; value: string } => Boolean(entry));
    } else {
      normalized.customMetrics = [];
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
  }

  if (widget.source === 'scrutiny') {
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    normalized.metrics = normalizeMetricList(
      Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
      SCRUTINY_ALLOWED_METRICS,
      SCRUTINY_DEFAULT_METRICS,
      3
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
  }

  if (widget.source === 'tandoor') {
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    normalized.metrics = normalizeMetricList(
      Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
      TANDOOR_ALLOWED_METRICS,
      TANDOOR_DEFAULT_METRICS,
      3
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
  }

  if (widget.source === 'speedtest-tracker' && widget.kind === 'stat') {
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    normalized.metrics = normalizeMetricList(
      Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
      SPEEDTEST_TRACKER_ALLOWED_METRICS,
      SPEEDTEST_TRACKER_DEFAULT_METRICS,
      3
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
  }

  if (widget.kind === 'speedtest') {
    normalized.speedtestTimeframe =
      typeof normalized.speedtestTimeframe === 'string' &&
      ['6h', '12h', '24h', '48h', '7d', '30d', 'custom'].includes(normalized.speedtestTimeframe)
        ? normalized.speedtestTimeframe
        : '48h';
    normalized.speedtestFrom =
      typeof normalized.speedtestFrom === 'string' && normalized.speedtestFrom.trim()
        ? normalized.speedtestFrom.trim()
        : 'now-48h';
    normalized.speedtestTo =
      typeof normalized.speedtestTo === 'string' && normalized.speedtestTo.trim()
        ? normalized.speedtestTo.trim()
        : 'now';
    normalized.speedtestPointsLimit = Math.min(
      1200,
      Math.max(20, Number(normalized.speedtestPointsLimit ?? 240))
    );
    normalized.speedtestShowTable = normalized.speedtestShowTable !== false;
    normalized.speedtestTableShowMean = normalized.speedtestTableShowMean !== false;
    normalized.speedtestTableShowLast = normalized.speedtestTableShowLast !== false;
    normalized.speedtestTableShowMin = normalized.speedtestTableShowMin === true;
    normalized.speedtestTableShowMax = normalized.speedtestTableShowMax === true;
    normalized.speedtestTableNameHeader =
      typeof normalized.speedtestTableNameHeader === 'string'
        ? normalized.speedtestTableNameHeader.trim()
        : 'Name';
    normalized.speedtestTableMeanHeader =
      typeof normalized.speedtestTableMeanHeader === 'string'
        ? normalized.speedtestTableMeanHeader.trim()
        : 'Mean';
    normalized.speedtestTableLastHeader =
      typeof normalized.speedtestTableLastHeader === 'string'
        ? normalized.speedtestTableLastHeader.trim()
        : 'Last';
    normalized.speedtestTableMinHeader =
      typeof normalized.speedtestTableMinHeader === 'string'
        ? normalized.speedtestTableMinHeader.trim()
        : 'Min';
    normalized.speedtestTableMaxHeader =
      typeof normalized.speedtestTableMaxHeader === 'string'
        ? normalized.speedtestTableMaxHeader.trim()
        : 'Max';
    normalized.speedtestDownloadLabel =
      typeof normalized.speedtestDownloadLabel === 'string'
        ? normalized.speedtestDownloadLabel.trim()
        : 'Download';
    normalized.speedtestUploadLabel =
      typeof normalized.speedtestUploadLabel === 'string'
        ? normalized.speedtestUploadLabel.trim()
        : 'Upload';
    normalized.speedtestYAxisLabel =
      typeof normalized.speedtestYAxisLabel === 'string'
        ? normalized.speedtestYAxisLabel.trim()
        : 'Mb/s';
    normalized.speedtestXAxisLabel =
      typeof normalized.speedtestXAxisLabel === 'string'
        ? normalized.speedtestXAxisLabel.trim()
        : '';
    normalized.speedtestYTicks = Math.min(
      10,
      Math.max(3, Math.round(Number(normalized.speedtestYTicks ?? 6)))
    );
    normalized.speedtestYTickStep = Math.min(
      500,
      Math.max(1, Math.round(Number(normalized.speedtestYTickStep ?? 5)))
    );
    normalized.speedtestXTicks = Math.min(
      8,
      Math.max(2, Math.round(Number(normalized.speedtestXTicks ?? 3)))
    );
    normalized.speedtestXTickEvery = Math.min(
      12,
      Math.max(1, Math.round(Number(normalized.speedtestXTickEvery ?? 1)))
    );
    normalized.speedtestXTickFormat =
      normalized.speedtestXTickFormat === 'date' || normalized.speedtestXTickFormat === 'time'
        ? normalized.speedtestXTickFormat
        : 'date-time';
    normalized.speedtestYTickLabels =
      typeof normalized.speedtestYTickLabels === 'string'
        ? normalized.speedtestYTickLabels.trim()
        : 'Mb/s';
    normalized.speedtestAutoYAxis = normalized.speedtestAutoYAxis !== false;
    normalized.speedtestYAxisMin = Number(normalized.speedtestYAxisMin ?? 0);
    normalized.speedtestYAxisMax = Number(normalized.speedtestYAxisMax ?? 0);
    normalized.speedtestShowGrid = normalized.speedtestShowGrid !== false;
    normalized.speedtestShowPoints = normalized.speedtestShowPoints !== false;
    normalized.speedtestSmoothCurves = normalized.speedtestSmoothCurves !== false;
    normalized.speedtestCurveThickness = Math.min(
      8,
      Math.max(1, Number(normalized.speedtestCurveThickness ?? 2.2))
    );
    normalized.speedtestPointSize = Math.min(
      10,
      Math.max(0.5, Number(normalized.speedtestPointSize ?? 3.2))
    );
    normalized.speedtestDownloadColor = isHexColor(normalized.speedtestDownloadColor)
      ? normalized.speedtestDownloadColor
      : '#1f82ff';
    normalized.speedtestUploadColor = isHexColor(normalized.speedtestUploadColor)
      ? normalized.speedtestUploadColor
      : '#9c4dff';
    normalized.speedtestTableHeaderColor = isHexColor(normalized.speedtestTableHeaderColor)
      ? normalized.speedtestTableHeaderColor
      : '#6fa9ff';
    normalized.speedtestTableBodyColor = isHexColor(normalized.speedtestTableBodyColor)
      ? normalized.speedtestTableBodyColor
      : '#d9e6fb';
    normalized.speedtestTableHeaderSize = Math.min(
      28,
      Math.max(9, Math.round(Number(normalized.speedtestTableHeaderSize ?? 15)))
    );
    normalized.speedtestTableBodySize = Math.min(
      28,
      Math.max(9, Math.round(Number(normalized.speedtestTableBodySize ?? 15)))
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showHealth')) {
      normalized.showHealth = false;
    }
  }

  if (widget.source === 'prowlarr' || widget.kind === 'prowlarr') {
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    if (widget.kind === 'stat') {
      normalized.metrics = normalizeMetricList(
        Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
        PROWLARR_ALLOWED_METRICS,
        PROWLARR_DEFAULT_METRICS,
        PROWLARR_ALLOWED_METRICS.length
      );
      if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
        normalized.metricBoxes = true;
      }
      normalizeMetricStyleOptions(normalized, {
        boxHeight: 52,
        fontSize: 14,
        fontColor: '#eef4ff'
      });
    }
    normalized.collapseAfter = Math.min(
      100,
      Math.max(1, Number(normalized.collapseAfter ?? 5))
    );
    normalized.prowlarrSort =
      normalized.prowlarrSort === 'enabled' ? 'enabled' : 'alphabetical';
    normalized.showHealthColumn = normalized.showHealthColumn !== false;
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showHealth')) {
      normalized.showHealth = false;
    }
  }

  if (widget.source === 'profilarr') {
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    normalized.metrics = normalizeMetricList(
      Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
      PROFILARR_ALLOWED_METRICS,
      PROFILARR_DEFAULT_METRICS,
      PROFILARR_ALLOWED_METRICS.length
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
  }

  if (widget.source === 'plex') {
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    normalized.metrics = normalizeMetricList(
      Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
      PLEX_ALLOWED_METRICS,
      PLEX_DEFAULT_METRICS,
      4
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
  }

  if ((widget.source === 'monitor' || widget.source === 'service-hub') || widget.kind === 'monitor' || widget.kind === 'systemMonitor') {
    const normalizedTargets = normalizeMonitorTargets(normalized.targets, String(normalized.targetsText ?? ''));
    normalized.targets = normalizedTargets;
    normalized.targetsText = normalizedTargets
      .map(
        (target) =>
          `${target.name}|${target.url}|${target.icon ?? ''}|${target.method ?? 'GET'}|${target.dockerServer ?? ''}|${target.dockerContainer ?? ''}`
      )
      .join('\n');
    normalized.columns = Math.min(6, Math.max(1, Number(normalized.columns ?? 3)));
    normalized.timeoutMs = Math.min(15000, Math.max(500, Number(normalized.timeoutMs ?? 6000)));
    normalized.monitorRefreshSec = Math.min(60, Math.max(1, Number(normalized.monitorRefreshSec ?? 15)));
    normalized.monitorStyle =
      widget.kind === 'systemMonitor'
        ? 'system'
        : widget.kind === 'monitor'
          ? 'list'
          : normalized.monitorStyle === 'system'
            ? 'system'
            : 'list';
    normalized.monitorDisplay =
      normalized.monitorDisplay === 'gauge' ||
      normalized.monitorDisplay === 'linear' ||
      normalized.monitorDisplay === 'header' ||
      normalized.monitorDisplay === 'spark'
        ? normalized.monitorDisplay
        : 'compact';
    normalized.monitorSystemOrientation =
      normalized.monitorSystemOrientation === 'stacked' ? 'stacked' : 'side-by-side';
    const legacyMonitorMetric =
      typeof normalized.monitorSystemMetric === 'string' ? [normalized.monitorSystemMetric] : [];
    normalized.monitorSystemMetrics = normalizeMetricList(
      Array.isArray(normalized.monitorSystemMetrics)
        ? normalized.monitorSystemMetrics
        : legacyMonitorMetric,
      SYSTEM_MONITOR_METRIC_KEYS,
      SYSTEM_MONITOR_DEFAULT_METRICS,
      SYSTEM_MONITOR_METRIC_KEYS.length
    ) as string[];
    const rawMetricsByNode =
      normalized.monitorSystemMetricsByNode &&
      typeof normalized.monitorSystemMetricsByNode === 'object' &&
      !Array.isArray(normalized.monitorSystemMetricsByNode)
        ? (normalized.monitorSystemMetricsByNode as Record<string, unknown>)
        : {};
    normalized.monitorSystemMetricsByNode = Object.fromEntries(
      Object.entries(rawMetricsByNode)
        .map(([nodeId, metrics]) => {
          const cleanNodeId = String(nodeId ?? '').trim();
          if (!cleanNodeId) return null;
          const normalizedMetrics = normalizeMetricList(
            Array.isArray(metrics) ? metrics : [],
            SYSTEM_MONITOR_METRIC_KEYS,
            Array.isArray(normalized.monitorSystemMetrics)
              ? normalized.monitorSystemMetrics
              : [...SYSTEM_MONITOR_DEFAULT_METRICS],
            SYSTEM_MONITOR_METRIC_KEYS.length
          );
          return [cleanNodeId, normalizedMetrics] as const;
        })
        .filter((entry): entry is readonly [string, string[]] => Boolean(entry))
    );
    normalized.monitorMetricValueMode = 'actual';
    normalized.monitorAutoHeight =
      normalized.monitorStyle === 'system' ? normalized.monitorAutoHeight !== false : false;
    normalized.monitorCriticalPulse = normalized.monitorCriticalPulse !== false;
    normalized.monitorLinearNodeGap = Math.min(
      80,
      Math.max(0, Number(normalized.monitorLinearNodeGap ?? 0))
    );
    normalized.monitorLinearBarHeight = Math.min(
      32,
      Math.max(4, Number(normalized.monitorLinearBarHeight ?? 12))
    );
    normalized.monitorLinearBarWidth = Math.min(
      100,
      Math.max(40, Number(normalized.monitorLinearBarWidth ?? 100))
    );
    normalized.monitorShowNodeIp = normalized.monitorShowNodeIp !== false;
    normalized.monitorShowMetricIcons = normalized.monitorShowMetricIcons !== false;
    normalized.monitorHeadOffsetY = Math.min(120, Math.max(-120, Number(normalized.monitorHeadOffsetY ?? 0)));
    normalized.monitorVitalsOffsetY = Math.min(120, Math.max(-120, Number(normalized.monitorVitalsOffsetY ?? 0)));
    normalized.iconSize = Math.min(96, Math.max(16, Number(normalized.iconSize ?? 38)));
    normalized.monitorRingSize = Math.min(240, Math.max(64, Number(normalized.monitorRingSize ?? 112)));
    normalized.monitorStrokeWidth = Math.min(20, Math.max(2, Number(normalized.monitorStrokeWidth ?? 8)));
    normalized.monitorGaugeColumnGap = Math.min(
      300,
      Math.max(-300, Number(normalized.monitorGaugeColumnGap ?? 10))
    );
    normalized.monitorWarnThreshold = Math.min(100, Math.max(0, Number(normalized.monitorWarnThreshold ?? 75)));
    normalized.monitorCriticalThreshold = Math.min(
      100,
      Math.max(
        Number(normalized.monitorWarnThreshold ?? 75),
        Number(normalized.monitorCriticalThreshold ?? 90)
      )
    );
    normalized.monitorPrimaryFont =
      typeof normalized.monitorPrimaryFont === 'string'
        ? normalized.monitorPrimaryFont.trim()
        : '';
    normalized.monitorPrimarySize = Math.min(80, Math.max(10, Number(normalized.monitorPrimarySize ?? 28)));
    normalized.monitorPrimaryColor = isHexColor(normalized.monitorPrimaryColor)
      ? normalized.monitorPrimaryColor
      : '#eef4ff';
    normalized.monitorGaugeTrackColor = isHexColor(normalized.monitorGaugeTrackColor)
      ? normalized.monitorGaugeTrackColor
      : '#2a3440';
    normalized.monitorGaugeColor = isHexColor(normalized.monitorGaugeColor)
      ? normalized.monitorGaugeColor
      : normalized.monitorPrimaryColor;
    normalized.monitorGaugeWarnColor = isHexColor(normalized.monitorGaugeWarnColor)
      ? normalized.monitorGaugeWarnColor
      : '#ffd479';
    normalized.monitorGaugeCriticalColor = isHexColor(normalized.monitorGaugeCriticalColor)
      ? normalized.monitorGaugeCriticalColor
      : '#ff6b6b';
    normalized.monitorLinearTrackColor = isHexColor(normalized.monitorLinearTrackColor)
      ? normalized.monitorLinearTrackColor
      : '#243041';
    normalized.monitorLinearFillStartColor = isHexColor(normalized.monitorLinearFillStartColor)
      ? normalized.monitorLinearFillStartColor
      : '#43b9ff';
    normalized.monitorLinearFillMidColor = isHexColor(normalized.monitorLinearFillMidColor)
      ? normalized.monitorLinearFillMidColor
      : '#7d75ff';
    normalized.monitorLinearFillEndColor = isHexColor(normalized.monitorLinearFillEndColor)
      ? normalized.monitorLinearFillEndColor
      : '#ff6778';
    normalized.monitorLinearStripeColor = isHexColor(normalized.monitorLinearStripeColor)
      ? normalized.monitorLinearStripeColor
      : '#ffffff';
    normalized.monitorLinearIconBgColor = isHexColor(normalized.monitorLinearIconBgColor)
      ? normalized.monitorLinearIconBgColor
      : '#182332';
    normalized.monitorLinearIconBorderColor = isHexColor(normalized.monitorLinearIconBorderColor)
      ? normalized.monitorLinearIconBorderColor
      : '#54657a';
    normalized.monitorUnitFont =
      typeof normalized.monitorUnitFont === 'string'
        ? normalized.monitorUnitFont.trim()
        : '';
    normalized.monitorUnitSize = Math.min(48, Math.max(8, Number(normalized.monitorUnitSize ?? 13)));
    normalized.monitorUnitColor = isHexColor(normalized.monitorUnitColor)
      ? normalized.monitorUnitColor
      : '#9aa8ba';
    const normalizedSystemNodes = (Array.isArray(normalized.monitorSystemNodes)
      ? normalized.monitorSystemNodes
          .map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
            const value = String((entry as Record<string, unknown>).value ?? '').trim();
            const host = String((entry as Record<string, unknown>).host ?? '').trim();
            if (!value || !host) return null;
            const label = String((entry as Record<string, unknown>).label ?? value).trim() || value;
            const portRaw = Number((entry as Record<string, unknown>).port ?? 61208);
            const port = Number.isFinite(portRaw) ? Math.min(65535, Math.max(1, Math.round(portRaw))) : 61208;
            const baseUrl = normalizeMonitorNodeBaseUrl((entry as Record<string, unknown>).baseUrl);
            return { value, label, host, port, ...(baseUrl ? { baseUrl } : {}) };
          })
          .filter(
            (entry): entry is { value: string; label: string; host: string; port: number; baseUrl?: string } =>
              Boolean(entry)
          )
      : []) as Array<{ value: string; label: string; host: string; port: number; baseUrl?: string }>;
    normalized.monitorSystemNodes = normalizedSystemNodes;
    if (normalized.monitorStyle === 'system' && normalizedSystemNodes.length === 0) {
      normalized.monitorSystemNodes = [
        {
          value: 'node-1',
          label: 'Node 1 (192.168.1.10)',
          host: '192.168.1.10',
          port: 61208,
          baseUrl: 'http://192.168.1.10:61208'
        },
        {
          value: 'node-2',
          label: 'Node 2 (192.168.1.11)',
          host: '192.168.1.11',
          port: 61208,
          baseUrl: 'http://192.168.1.11:61208'
        }
      ];
    }
    const validNodeIds = new Set(
      (normalized.monitorSystemNodes as Array<{ value: string; label: string; host: string; port: number }>)
        .map((entry) => String(entry.value ?? '').trim())
        .filter((value) => value.length > 0)
    );
    normalized.monitorSystemMetricsByNode = Object.fromEntries(
      Object.entries(
        (normalized.monitorSystemMetricsByNode as Record<string, unknown>) ?? {}
      ).filter(([nodeId]) => validNodeIds.has(String(nodeId).trim()))
    );
    normalized.monitorNameFont =
      typeof normalized.monitorNameFont === 'string'
        ? normalized.monitorNameFont.trim()
        : '';
    normalized.monitorNameSize = Math.min(
      42,
      Math.max(8, Number(normalized.monitorNameSize ?? 16))
    );
    normalized.monitorNameColor = isHexColor(normalized.monitorNameColor)
      ? normalized.monitorNameColor
      : '#eef4ff';
    normalized.monitorMetricLabelFont =
      typeof normalized.monitorMetricLabelFont === 'string'
        ? normalized.monitorMetricLabelFont.trim()
        : '';
    normalized.monitorMetricLabelWeight = Math.min(
      900,
      Math.max(300, Number(normalized.monitorMetricLabelWeight ?? normalized.monitorLatencyWeight ?? 600))
    );
    normalized.monitorMetricLabelSize = Math.min(
      36,
      Math.max(8, Number(normalized.monitorMetricLabelSize ?? normalized.monitorLatencySize ?? 13))
    );
    normalized.monitorMetricLabelColor = isHexColor(normalized.monitorMetricLabelColor)
      ? normalized.monitorMetricLabelColor
      : (isHexColor(normalized.monitorLatencyColor) ? normalized.monitorLatencyColor : '#9aa8ba');
    normalized.monitorMetricValueFont =
      typeof normalized.monitorMetricValueFont === 'string'
        ? normalized.monitorMetricValueFont.trim()
        : '';
    normalized.monitorMetricValueWeight = Math.min(
      900,
      Math.max(300, Number(normalized.monitorMetricValueWeight ?? normalized.monitorPrimaryWeight ?? 700))
    );
    normalized.monitorMetricValueSize = Math.min(
      80,
      Math.max(10, Number(normalized.monitorMetricValueSize ?? normalized.monitorPrimarySize ?? 28))
    );
    normalized.monitorMetricValueColor = isHexColor(normalized.monitorMetricValueColor)
      ? normalized.monitorMetricValueColor
      : (isHexColor(normalized.monitorPrimaryColor) ? normalized.monitorPrimaryColor : '#eef4ff');
    normalized.monitorStatusFont =
      typeof normalized.monitorStatusFont === 'string'
        ? normalized.monitorStatusFont.trim()
        : '';
    normalized.monitorStatusSize = Math.min(
      36,
      Math.max(8, Number(normalized.monitorStatusSize ?? 13))
    );
    normalized.monitorStatusColor = isHexColor(normalized.monitorStatusColor)
      ? normalized.monitorStatusColor
      : '#b6cadf';
    normalized.monitorLatencyFont =
      typeof normalized.monitorLatencyFont === 'string'
        ? normalized.monitorLatencyFont.trim()
        : '';
    normalized.monitorLatencySize = Math.min(
      36,
      Math.max(8, Number(normalized.monitorLatencySize ?? 13))
    );
    normalized.monitorLatencyColor = isHexColor(normalized.monitorLatencyColor)
      ? normalized.monitorLatencyColor
      : '#9aa8ba';
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showStatusDot')) {
      normalized.showStatusDot = true;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showStatusText')) {
      normalized.showStatusText = true;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showLatency')) {
      normalized.showLatency = true;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showHealth')) {
      normalized.showHealth = false;
    }
  }

  if (widget.kind === 'plex' || widget.kind === 'history' || widget.source === 'media-history') {
    normalized.subtype = normalized.subtype === 'now-playing' ? 'now-playing' : 'history';
    normalized.provider = normalized.provider === 'jellyfin' ? 'jellyfin' : 'plex';
    normalized.limit = Math.min(30, Math.max(1, Number(normalized.limit ?? 10)));
    normalized.idleHistoryLimit = Math.min(20, Math.max(1, Number(normalized.idleHistoryLimit ?? 6)));
    normalized.height = Math.max(180, Number(normalized.height ?? 360));
    normalized.sessionLimit = Math.min(6, Math.max(1, Number(normalized.sessionLimit ?? 1)));
    normalized.nowPlayingPosterTextGap = Math.min(
      40,
      Math.max(-40, Number(normalized.nowPlayingPosterTextGap ?? 2))
    );
    normalized.nowPlayingMetadataVerticalOffset = Math.min(
      40,
      Math.max(-40, Number(normalized.nowPlayingMetadataVerticalOffset ?? 0))
    );
    normalized.sessionMetaFont =
      typeof normalized.sessionMetaFont === 'string' ? normalized.sessionMetaFont.trim() : '';
    {
      const weight = Number(normalized.sessionMetaWeight ?? 0);
      normalized.sessionMetaWeight =
        Number.isFinite(weight) && weight > 0 ? Math.min(900, Math.max(300, weight)) : '';
    }
    {
      const size = Number(normalized.sessionMetaSize ?? 0);
      normalized.sessionMetaSize =
        Number.isFinite(size) && size > 0 ? Math.min(36, Math.max(8, size)) : '';
    }
    normalized.sessionMetaColor = isHexColor(normalized.sessionMetaColor)
      ? normalized.sessionMetaColor
      : '';
    const legacyMetric = typeof normalized.metric === 'string' ? [normalized.metric] : [];
    normalized.metrics = normalizeMetricList(
      Array.isArray(normalized.metrics) ? normalized.metrics : legacyMetric,
      PLEX_ALLOWED_METRICS,
      PLEX_DEFAULT_METRICS,
      4
    );
    if (!Object.prototype.hasOwnProperty.call(normalized, 'metricBoxes')) {
      normalized.metricBoxes = true;
    }
    normalizeMetricStyleOptions(normalized, {
      boxHeight: 52,
      fontSize: 14,
      fontColor: '#eef4ff'
    });
    normalized.userName =
      typeof normalized.userName === 'string' ? normalized.userName.trim() : '';
    normalized.mediaTypes =
      typeof normalized.mediaTypes === 'string' && normalized.mediaTypes.trim()
        ? normalized.mediaTypes.trim()
        : 'Movie,Episode';
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showHealth')) {
      normalized.showHealth = false;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showThumbnail')) {
      normalized.showThumbnail = true;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showUser')) {
      normalized.showUser = true;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'compact')) {
      normalized.compact = true;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showStatus')) {
      normalized.showStatus = true;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showFallbackMetrics')) {
      normalized.showFallbackMetrics = true;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'showFallbackHistory')) {
      normalized.showFallbackHistory = true;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'nowPlayingAutoMetadata')) {
      normalized.nowPlayingAutoMetadata = true;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'sessionMetaSize')) {
      normalized.sessionMetaSize = 20;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'sessionMetaWeight')) {
      normalized.sessionMetaWeight = 300;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'sessionMetaColor')) {
      normalized.sessionMetaColor = '#eef4ff';
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'sessionLabelSize')) {
      normalized.sessionLabelSize = 12;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'sessionLabelWeight')) {
      normalized.sessionLabelWeight = 300;
    }
    if (!Object.prototype.hasOwnProperty.call(normalized, 'sessionLabelColor')) {
      normalized.sessionLabelColor = '#9aa8ba';
    }
  }

  return normalized;
};

const normalizeWidgets = (items: WidgetInstance[], dashboardSettings: DashboardSettings) => {
  const dockerServers = getDockerServers();
  const defaultDockerServer = getDefaultDockerServer(dockerServers);
  const seenIds = new Set<string>();
  const makeWidgetId = () => {
    try {
      return randomUUID();
    } catch {
      return `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  };

  const normalizeSourceKey = (source: unknown) => {
    const raw = typeof source === 'string' ? source.trim() : '';
    if (!raw) return '';
    const compact = raw.toLowerCase().replace(/[\s_]+/g, '-');
    if (compact === 'homeassistant' || compact === 'home-assistant') return 'home-assistant';
    if (compact === 'profillar' || compact === 'profilarr') return 'profilarr';
    return raw;
  };

  const inferLegacySourceFromTitle = (title: unknown) => {
    const raw = typeof title === 'string' ? title.trim() : '';
    if (!raw) return '';
    const compact = raw.toLowerCase().replace(/[\s_]+/g, '-');
    if (compact === 'homeassistant' || compact === 'home-assistant') return 'home-assistant';
    if (compact === 'profillar' || compact === 'profilarr') return 'profilarr';
    return '';
  };

  return items.map((widget, index) => {
    const requestedId = typeof widget.id === 'string' ? widget.id.trim() : '';
    const id = requestedId && !seenIds.has(requestedId) ? requestedId : makeWidgetId();
    seenIds.add(id);
    const monitorStyle =
      widget.options && typeof widget.options === 'object' && !Array.isArray(widget.options)
        ? (widget.options as Record<string, unknown>).monitorStyle
        : undefined;
    const normalizedKind =
      widget.kind === 'history'
        ? 'plex'
        : widget.kind === 'monitor' && monitorStyle === 'system'
          ? 'systemMonitor'
          : widget.kind;
    const explicitSource = normalizeSourceKey(widget.source);
    const fallbackSource = inferLegacySourceFromTitle(widget.title);
    const normalizedSource =
      explicitSource ||
      fallbackSource ||
      (normalizedKind === 'requests'
        ? 'seerr-requests'
        : normalizedKind === 'sabnzbd'
          ? 'sabnzbd'
        : normalizedKind === 'speedtest'
          ? 'speedtest-tracker'
        : normalizedKind === 'prowlarr'
          ? 'prowlarr'
          : explicitSource);
    const normalizedWidget = { ...widget, kind: normalizedKind, source: normalizedSource } as WidgetInstance;
    const sourceOptions = normalizeSourceOptions(
      normalizedWidget,
      resolveHealthDefaults(normalizedWidget, defaultDockerServer)
    );
    sourceOptions.tabId = resolveWidgetTabId(sourceOptions, dashboardSettings);
    return {
      id,
      kind: normalizedKind,
      title: widget.title ?? 'Untitled',
      source: normalizedSource,
      link: normalizeLinkValue(widget.link),
      layout: {
        span: widget.layout?.span ?? 4,
        height: widget.layout?.height,
        columnStart:
          typeof widget.layout?.columnStart === 'number' &&
          Number.isFinite(widget.layout.columnStart) &&
          widget.layout.columnStart >= 1 &&
          widget.layout.columnStart <= 25
            ? Math.round(widget.layout.columnStart)
            : undefined
      },
      mobile: widget.mobile ?? { span: 4 },
      options: sourceOptions,
      data: widget.data ?? null
    };
  });
};

let widgets: WidgetInstance[] = normalizeWidgets(config.widgets, settings);
{
  const runtimeState = getRuntimeState();
  if (Array.isArray(runtimeState.widgets)) {
    widgets = runtimeState.widgets;
  }
}

const DEFAULT_REFRESH_INTERVAL_MS = 15000;
const MIN_REFRESH_INTERVAL_MS = 1000;

const isMonitorLikeWidget = (widget: WidgetInstance) =>
  widget.source === 'monitor' ||
  widget.source === 'service-hub' ||
  widget.kind === 'monitor' ||
  widget.kind === 'systemMonitor';

const resolveWidgetRefreshIntervalMs = (widget: WidgetInstance) => {
  if (!isMonitorLikeWidget(widget)) return DEFAULT_REFRESH_INTERVAL_MS;
  const seconds = Number(widget.options?.monitorRefreshSec ?? 15);
  const safeSeconds = Number.isFinite(seconds) ? seconds : 15;
  return Math.min(60000, Math.max(MIN_REFRESH_INTERVAL_MS, Math.round(safeSeconds * 1000)));
};

const shouldRefreshWidget = (
  widget: WidgetInstance,
  lastRefreshAtByWidgetId: Record<string, number>,
  now: number
) => {
  const lastRefreshedAt = Number(lastRefreshAtByWidgetId[widget.id] ?? 0);
  if (!Number.isFinite(lastRefreshedAt) || lastRefreshedAt <= 0) return true;
  return now - lastRefreshedAt >= resolveWidgetRefreshIntervalMs(widget);
};

const resolveDiskRefreshIntervalMs = () => {
  const raw = Number(readPrivateEnv('LANTERN_DISK_REFRESH_MIN_MS', 'DASHBOARD_DISK_REFRESH_MIN_MS') ?? 2000);
  if (!Number.isFinite(raw)) return 2000;
  return Math.min(60000, Math.max(250, Math.round(raw)));
};

const refreshWidgets = async () => {
  // Snapshot the widget list so an in-flight refresh can't accidentally
  // overwrite freshly-saved widget options/layouts if config changes mid-refresh.
  const widgetsSnapshot = widgets;
  const runtimeState = getRuntimeState();
  const now = Date.now();
  const lastRefreshAtByWidgetId = runtimeState.lastRefreshAtByWidgetId ?? {};
  const widgetsToRefresh = widgetsSnapshot.filter((widget) =>
    shouldRefreshWidget(widget, lastRefreshAtByWidgetId, now)
  );
  if (widgetsToRefresh.length === 0) {
    return;
  }

  const dockerServers = getDockerServers();
  const defaultDockerServer = getDefaultDockerServer(dockerServers);
  const healthTargets = new Map<string, { server: string; container: string }>();
  const serversToFetch = new Set<string>();

  widgetsToRefresh.forEach((widget) => {
    const options = widget.options ?? {};
    const isMonitorWidget = isMonitorLikeWidget(widget);
    const hasHealthServer = Object.prototype.hasOwnProperty.call(options, 'healthServer');
    const hasHealthContainer = Object.prototype.hasOwnProperty.call(options, 'healthContainer');
    const rawServer = options.healthServer;
    const rawContainer = options.healthContainer;
    const explicitServer = typeof rawServer === 'string' && rawServer.trim() ? rawServer.trim() : '';
    const explicitContainer = typeof rawContainer === 'string' && rawContainer.trim() ? rawContainer.trim() : '';
    let server = explicitServer;
    let container = explicitContainer;

    if (isMonitorWidget && (!server || !container)) {
      const targetsText =
        typeof widget.options?.targetsText === 'string' ? widget.options.targetsText : '';
      const fallbackTarget = normalizeMonitorTargets(widget.options?.targets, targetsText).find((target) => {
        const targetContainer =
          typeof target.dockerContainer === 'string' ? target.dockerContainer.trim() : '';
        return targetContainer.length > 0;
      });
      if (fallbackTarget) {
        const targetServer =
          typeof fallbackTarget.dockerServer === 'string' ? fallbackTarget.dockerServer.trim() : '';
        const targetContainer =
          typeof fallbackTarget.dockerContainer === 'string' ? fallbackTarget.dockerContainer.trim() : '';
        if (!server && targetServer && dockerServers[targetServer]) {
          server = targetServer;
        }
        if (!container && targetContainer) {
          container = targetContainer;
        }
      }
    }

    if (!server && !isMonitorWidget && !hasHealthServer) {
      server = defaultDockerServer;
    }
    if (!container && !isMonitorWidget && !hasHealthContainer) {
      container = widget.source ?? '';
    }

    if (server && container) {
      healthTargets.set(widget.id, { server, container });
      serversToFetch.add(server);
    }
  });

  const containersByServer: Record<string, Awaited<ReturnType<typeof fetchDockerContainers>>> = {};
  await Promise.all(
    Array.from(serversToFetch).map(async (server) => {
      const baseUrl = dockerServers[server];
      if (!baseUrl) {
        containersByServer[server] = [];
        return;
      }
      try {
        containersByServer[server] = await fetchDockerContainers(baseUrl);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`[docker-health] Failed to fetch containers for "${server}" at ${baseUrl}: ${reason}`);
        containersByServer[server] = [];
      }
    })
  );

  const updated = await Promise.all(
    widgetsToRefresh.map(async (widget) => {
      const link = resolveWidgetLink(widget);
      const target = healthTargets.get(widget.id);
      const health =
        target && containersByServer[target.server]
          ? resolveContainerHealth(containersByServer[target.server], target.container)
          : undefined;

      if (widget.source === 'technitium') {
        try {
          const points = Number(widget.options?.points ?? 12);
          const timeframe = typeof widget.options?.timeframe === 'string' ? widget.options.timeframe : undefined;
          const token = typeof widget.options?.token === 'string' ? widget.options.token : undefined;
          const baseUrl = typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const timeScale = typeof widget.options?.timeScale === 'string' ? widget.options.timeScale : undefined;
          const metrics = normalizeMetricList(
            widget.options?.metrics,
            TECHNITIUM_ALLOWED_METRICS,
            TECHNITIUM_DEFAULT_METRICS,
            8
          );
          const baseData = await fetchTechnitiumStats(points, timeframe, token, baseUrl, timeScale);
          const metricValueMap: Record<string, { value: number | string; label: string; unit?: string }> = {
            totalQueries: { value: baseData.summary.totalQueries, label: 'Queries' },
            blockedPct: { value: baseData.summary.blockedPct, label: 'Blocked', unit: '%' },
            latency: { value: baseData.summary.latency.toFixed(2), label: 'Latency', unit: 'ms' },
            failures: { value: baseData.summary.failures, label: 'Failure' },
            cachedAvgLatency: {
              value: baseData.summary.cachedAvgLatency.toFixed(2),
              label: 'Cached Avg. Latency',
              unit: 'ms'
            },
            cached: { value: baseData.summary.cached, label: 'Cached' },
            recursive: { value: baseData.summary.recursive, label: 'Recursive' },
            authoritative: { value: baseData.summary.authoritative, label: 'Authoritative' }
          };
          const selectedMetrics = metrics
            .map((metric) => ({ key: metric, ...metricValueMap[metric] }))
            .filter((metric) => Boolean(metric.label));
          const data = {
            ...baseData,
            metrics: selectedMetrics
          };
          return { ...widget, link, health, data };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data:
              widget.data ??
              { error: error instanceof Error ? error.message : 'Technitium error' }
          };
        }
      }

      if (widget.source === 'komodo') {
        try {
          const baseUrl =
            typeof widget.options?.baseUrl === 'string' && widget.options.baseUrl.trim()
              ? widget.options.baseUrl.trim()
              : undefined;
          const apiKey =
            typeof widget.options?.apiKey === 'string' && widget.options.apiKey.trim()
              ? widget.options.apiKey.trim()
              : undefined;
          const apiSecret =
            typeof widget.options?.apiSecret === 'string' && widget.options.apiSecret.trim()
              ? widget.options.apiSecret.trim()
              : undefined;
          const iconOverrides =
            widget.options?.iconOverrides &&
            typeof widget.options.iconOverrides === 'object' &&
            !Array.isArray(widget.options.iconOverrides)
              ? (widget.options.iconOverrides as Record<string, string>)
              : undefined;
          const data = await fetchKomodoStacks(iconOverrides, { baseUrl, apiKey, apiSecret });
          if (widget.kind === 'stat') {
            const metrics = normalizeMetricList(
              widget.options?.metrics,
              KOMODO_ALLOWED_METRICS,
              KOMODO_DEFAULT_METRICS,
              KOMODO_ALLOWED_METRICS.length
            );
            const summary = data.summary ?? {
              total: 0,
              running: 0,
              stopped: 0,
              unhealthy: 0,
              unknown: 0,
              servers: 0
            };
            const metricValueMap: Record<string, { value: number; label: string }> = {
              container_total: { value: summary.total ?? 0, label: 'Containers Total' },
              container_running: { value: summary.running ?? 0, label: 'Containers Running' },
              container_stopped: { value: summary.stopped ?? 0, label: 'Containers Stopped' },
              container_unhealthy: { value: summary.unhealthy ?? 0, label: 'Containers Unhealthy' },
              container_unknown: { value: summary.unknown ?? 0, label: 'Containers Unknown' },
              stack_total: { value: summary.total ?? 0, label: 'Stacks Total' },
              stack_running: { value: summary.running ?? 0, label: 'Stacks Running' },
              stack_stopped: { value: summary.stopped ?? 0, label: 'Stacks Stopped' },
              stack_unhealthy: { value: summary.unhealthy ?? 0, label: 'Stacks Unhealthy' },
              stack_unknown: { value: summary.unknown ?? 0, label: 'Stacks Unknown' },
              summary_servers: { value: summary.servers ?? 0, label: 'Servers' },
              summary_stacks: { value: summary.total ?? 0, label: 'Stacks' },
              summary_containers: { value: summary.total ?? 0, label: 'Containers' }
            };
            const mappedMetrics = metrics.map((metric) => ({
              key: metric,
              value: metricValueMap[metric]?.value ?? 0,
              label: metricValueMap[metric]?.label ?? metric
            }));
            return {
              ...widget,
              link,
              health,
              data: {
                metrics: mappedMetrics,
                value: mappedMetrics[0]?.value ?? 0,
                label: mappedMetrics[0]?.label ?? 'Current'
              }
            };
          }
          return { ...widget, link, health, data };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data:
              widget.data ??
              { error: error instanceof Error ? error.message : 'Docker Manager error' }
          };
        }
      }

	      if (
	        widget.source === 'radarr' ||
	        widget.source === 'readarr' ||
	        widget.source === 'sonarr'
	      ) {
	        try {
	          const arrSource = widget.source as 'radarr' | 'readarr' | 'sonarr';
	          const metrics = normalizeMetricList(
	            widget.options?.metrics,
	            arrSource === 'radarr'
	              ? RADARR_ALLOWED_METRICS
	              : arrSource === 'sonarr'
	                ? SONARR_ALLOWED_METRICS
	                : READARR_ALLOWED_METRICS,
	            arrSource === 'radarr'
	              ? RADARR_DEFAULT_METRICS
	              : arrSource === 'sonarr'
	                ? SONARR_DEFAULT_METRICS
	                : READARR_DEFAULT_METRICS,
	            arrSource === 'radarr' ? 4 : 3
	          );
          const baseUrl = typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const apiKey = typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;
	          const data = await Promise.all(
	            metrics.map(async (metric) => {
	              const result = await fetchArrMetric(
	                arrSource,
	                metric as
	                  | 'wanted'
	                  | 'missing'
                  | 'queued'
                  | 'movies'
                  | 'books'
                  | 'series',
                { baseUrl, apiKey }
              );
              return { key: metric, value: result.value, label: result.label };
            })
          );
          return {
            ...widget,
            link,
            health,
            data: {
              metrics: data,
              value: data[0]?.value ?? 0,
              label: data[0]?.label ?? 'Current'
            }
          };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data: widget.data ?? { error: error instanceof Error ? error.message : 'Arr error' }
          };
        }
      }

      if (widget.source === 'audiobookshelf') {
        try {
          const metrics = normalizeMetricList(
            widget.options?.metrics,
            AUDIOBOOKSHELF_ALLOWED_METRICS,
            AUDIOBOOKSHELF_DEFAULT_METRICS,
            4
          );
          const baseUrl =
            typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const apiKey =
            typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;
          const stats = await fetchAudiobookshelfStats({ baseUrl, apiKey });
          const data = await Promise.all(
            metrics.map(async (metric) => {
              const result = stats[
                metric as 'podcasts' | 'podcastsDuration' | 'books' | 'booksDuration'
              ];
              return { key: metric, value: result.value, label: result.label };
            })
          );
          return {
            ...widget,
            link,
            health,
            data: {
              metrics: data,
              value: data[0]?.value ?? 0,
              label: data[0]?.label ?? 'Current'
            }
          };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data: widget.data ?? {
              error: error instanceof Error ? error.message : 'Audiobookshelf error'
            }
          };
        }
      }

      if (widget.source === 'sabnzbd') {
        if (widget.kind === 'sabnzbd') {
          try {
            const baseUrl =
              typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
            const apiKey =
              typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;
            const overview = await fetchSabnzbdOverview({ baseUrl, apiKey });
            return { ...widget, link, health, data: overview };
          } catch (error) {
            return {
              ...widget,
              link,
              health,
              data: widget.data ?? { error: error instanceof Error ? error.message : 'SABnzbd error' }
            };
          }
        }

        try {
          const metrics = normalizeMetricList(
            widget.options?.metrics,
            SABNZBD_ALLOWED_METRICS,
            SABNZBD_DEFAULT_METRICS,
            3
          );
          const baseUrl =
            typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const apiKey =
            typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;
          const stats = await fetchSabnzbdStats({ baseUrl, apiKey });
          const data = await Promise.all(
            metrics.map(async (metric) => {
              const result = stats[metric as 'rate' | 'queue' | 'timeleft'];
              return { key: metric, value: result.value, label: result.label };
            })
          );
          return {
            ...widget,
            link,
            health,
            data: {
              metrics: data,
              value: data[0]?.value ?? 0,
              label: data[0]?.label ?? 'Current'
            }
          };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data: widget.data ?? { error: error instanceof Error ? error.message : 'SABnzbd error' }
          };
        }
      }

      if (widget.source === 'qbittorrent') {
        if (widget.kind === 'sabnzbd') {
          try {
            const baseUrl =
              typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
            const username =
              typeof widget.options?.username === 'string' ? widget.options.username : undefined;
            const password =
              typeof widget.options?.password === 'string' ? widget.options.password : undefined;
            const overview = await fetchQbittorrentOverview({ baseUrl, username, password });
            return { ...widget, link, health, data: overview };
          } catch (error) {
            return {
              ...widget,
              link,
              health,
              data: widget.data ?? {
                error: error instanceof Error ? error.message : 'qBittorrent error'
              }
            };
          }
        }

        try {
          const metrics = normalizeMetricList(
            widget.options?.metrics,
            QBITTORRENT_ALLOWED_METRICS,
            QBITTORRENT_DEFAULT_METRICS,
            4
          );
          const baseUrl =
            typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const username =
            typeof widget.options?.username === 'string' ? widget.options.username : undefined;
          const password =
            typeof widget.options?.password === 'string' ? widget.options.password : undefined;
          const stats = await fetchQbittorrentStats({ baseUrl, username, password });
          const data = await Promise.all(
            metrics.map(async (metric) => {
              const result = stats[metric as 'leech' | 'download' | 'seed' | 'upload'];
              return {
                key: metric,
                value: result.value,
                label: result.label,
                unit: result.unit
              };
            })
          );
          return {
            ...widget,
            link,
            health,
            data: {
              metrics: data,
              value: data[0]?.value ?? 0,
              label: data[0]?.label ?? 'Current'
            }
          };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data: widget.data ?? {
              error: error instanceof Error ? error.message : 'qBittorrent error'
            }
          };
        }
      }

      if (widget.source === 'home-assistant') {
        try {
          const metrics = Array.isArray(widget.options?.metrics)
            ? unique(widget.options.metrics.filter((item): item is string => typeof item === 'string'))
                .filter(isHomeAssistantMetricKey)
                .slice(0, 3)
            : normalizeMetricList(
                typeof widget.options?.metric === 'string' ? [widget.options.metric] : widget.options?.metrics,
                HOME_ASSISTANT_ALLOWED_METRICS,
                HOME_ASSISTANT_DEFAULT_METRICS,
                3
              );
          const baseUrl =
            typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const apiKey =
            typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;
          const customMetrics = Array.isArray(widget.options?.customMetrics)
            ? widget.options.customMetrics
            : [];
          const stats = await fetchHomeAssistantStats({ baseUrl, apiKey, customMetrics });
          const selectedBuiltin = metrics.map((metric) => {
            const result =
              stats.builtin[metric as 'people_home' | 'lights_on' | 'switches_on'];
            return {
              key: metric,
              value: result.value,
              label: result.label,
              unit: result.unit
            };
          });
          const data = [...selectedBuiltin, ...stats.custom];
          return {
            ...widget,
            link,
            health,
            data: {
              metrics: data,
              value: data[0]?.value ?? 0,
              unit: data[0]?.unit,
              label: data[0]?.label ?? 'Current'
            }
          };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data: widget.data ?? {
              error: error instanceof Error ? error.message : 'Home Assistant error'
            }
          };
        }
      }

      if (widget.source === 'scrutiny') {
        try {
          const metrics = normalizeMetricList(
            widget.options?.metrics,
            SCRUTINY_ALLOWED_METRICS,
            SCRUTINY_DEFAULT_METRICS,
            3
          );
          const baseUrl =
            typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const apiKey =
            typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;
          const stats = await fetchScrutinyStats({ baseUrl, apiKey });
          const data = await Promise.all(
            metrics.map(async (metric) => {
              const result = stats[metric as 'passed' | 'failed' | 'unknown'];
              return { key: metric, value: result.value, label: result.label };
            })
          );
          return {
            ...widget,
            link,
            health,
            data: {
              metrics: data,
              value: data[0]?.value ?? 0,
              label: data[0]?.label ?? 'Current'
            }
          };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data: widget.data ?? {
              error: error instanceof Error ? error.message : 'Scrutiny error'
            }
          };
        }
      }

      if (widget.source === 'tandoor') {
        try {
          const metrics = normalizeMetricList(
            widget.options?.metrics,
            TANDOOR_ALLOWED_METRICS,
            TANDOOR_DEFAULT_METRICS,
            3
          );
          const baseUrl =
            typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const apiKey =
            typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;
          const stats = await fetchTandoorStats({ baseUrl, apiKey });
          const data = await Promise.all(
            metrics.map(async (metric) => {
              const result = stats[metric as 'users' | 'recipes' | 'keywords'];
              return { key: metric, value: result.value, label: result.label };
            })
          );
          return {
            ...widget,
            link,
            health,
            data: {
              metrics: data,
              value: data[0]?.value ?? 0,
              label: data[0]?.label ?? 'Current'
            }
          };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data: widget.data ?? {
              error: error instanceof Error ? error.message : 'Tandoor error'
            }
          };
        }
      }

      if (widget.kind === 'speedtest' && widget.source === 'speedtest-tracker') {
        try {
          const baseUrl =
            typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const apiKey =
            typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;
          const timeframe =
            typeof widget.options?.speedtestTimeframe === 'string'
              ? widget.options.speedtestTimeframe
              : '48h';
          const from =
            typeof widget.options?.speedtestFrom === 'string'
              ? widget.options.speedtestFrom
              : 'now-48h';
          const to =
            typeof widget.options?.speedtestTo === 'string'
              ? widget.options.speedtestTo
              : 'now';
          const limit = Math.min(
            1200,
            Math.max(20, Number(widget.options?.speedtestPointsLimit ?? 240))
          );
          const history = await fetchSpeedtestTrackerHistory({
            baseUrl,
            apiKey,
            timeframe,
            from,
            to,
            limit
          });
          return {
            ...widget,
            link,
            health,
            data: {
              points: history.points,
              summary: history.summary
            }
          };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data: widget.data ?? {
              error: error instanceof Error ? error.message : 'Speedtest Tracker error'
            }
          };
        }
      }

      if (widget.source === 'speedtest-tracker') {
        try {
          const metrics = normalizeMetricList(
            widget.options?.metrics,
            SPEEDTEST_TRACKER_ALLOWED_METRICS,
            SPEEDTEST_TRACKER_DEFAULT_METRICS,
            3
          );
          const baseUrl =
            typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const apiKey =
            typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;
          const stats = await fetchSpeedtestTrackerStats({ baseUrl, apiKey });
          const data = await Promise.all(
            metrics.map(async (metric) => {
              const result = stats[metric as 'download' | 'upload' | 'ping'];
              return {
                key: metric,
                value: result.value,
                label: result.label,
                unit: result.unit
              };
            })
          );
          return {
            ...widget,
            link,
            health,
            data: {
              metrics: data,
              value: data[0]?.value ?? 0,
              unit: data[0]?.unit,
              label: data[0]?.label ?? 'Current'
            }
          };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data: widget.data ?? {
              error: error instanceof Error ? error.message : 'Speedtest Tracker error'
            }
          };
        }
      }

      if (widget.source === 'prowlarr' || widget.kind === 'prowlarr') {
        try {
          const baseUrl =
            typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const apiKey =
            typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;
          const data = await fetchProwlarrIndexers({ baseUrl, apiKey });
          if (widget.kind === 'stat') {
            const metrics = normalizeMetricList(
              widget.options?.metrics,
              PROWLARR_ALLOWED_METRICS,
              PROWLARR_DEFAULT_METRICS,
              PROWLARR_ALLOWED_METRICS.length
            );
            const metricValueMap: Record<string, { value: number; label: string }> = {
              numberOfGrabs: {
                value: Number(data.summary?.numberOfGrabs ?? 0),
                label: 'Grabs'
              },
              numberOfQueries: {
                value: Number(data.summary?.numberOfQueries ?? 0),
                label: 'Queries'
              },
              numberOfFailGrabs: {
                value: Number(data.summary?.numberOfFailGrabs ?? 0),
                label: 'Failed Grabs'
              },
              numberOfFailQueries: {
                value: Number(data.summary?.numberOfFailQueries ?? 0),
                label: 'Failed Queries'
              }
            };
            const mappedMetrics = metrics.map((metric) => ({
              key: metric,
              value: metricValueMap[metric]?.value ?? 0,
              label: metricValueMap[metric]?.label ?? metric
            }));
            return {
              ...widget,
              link,
              health,
              data: {
                metrics: mappedMetrics,
                value: mappedMetrics[0]?.value ?? 0,
                label: mappedMetrics[0]?.label ?? 'Current'
              }
            };
          }
          return { ...widget, link, health, data };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data: widget.data ?? {
              error: error instanceof Error ? error.message : 'Prowlarr error'
            }
          };
        }
      }

      if (widget.source === 'profilarr') {
        try {
          const baseUrl =
            typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const apiKey =
            typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;
          const metrics = normalizeMetricList(
            widget.options?.metrics,
            PROFILARR_ALLOWED_METRICS,
            PROFILARR_DEFAULT_METRICS,
            PROFILARR_ALLOWED_METRICS.length
          );
          const stats = await fetchProfilarrStats({ baseUrl, apiKey });
          const data = metrics.map((metric) => {
            const result = stats[metric as (typeof PROFILARR_ALLOWED_METRICS)[number]];
            return {
              key: metric,
              value: result?.value ?? 'Unknown',
              label: result?.label ?? metric
            };
          });
          return {
            ...widget,
            link,
            health,
            data: {
              metrics: data,
              value: data[0]?.value ?? 'Unknown',
              label: data[0]?.label ?? 'Current'
            }
          };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data: widget.data ?? {
              error: error instanceof Error ? error.message : 'Profilarr error'
            }
          };
        }
      }

      if (widget.source === 'plex' && widget.kind !== 'plex' && widget.kind !== 'history') {
        try {
          const metrics = normalizeMetricList(
            widget.options?.metrics,
            PLEX_ALLOWED_METRICS,
            PLEX_DEFAULT_METRICS,
            4
          );
          const baseUrl =
            typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const apiKey =
            typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;
          const stats = await fetchPlexStats({ baseUrl, apiKey });
          const data = await Promise.all(
            metrics.map(async (metric) => {
              const result = stats[metric as 'streams' | 'albums' | 'movies' | 'tv'];
              return { key: metric, value: result.value, label: result.label };
            })
          );
          return {
            ...widget,
            link,
            health,
            data: {
              metrics: data,
              value: data[0]?.value ?? 0,
              label: data[0]?.label ?? 'Current'
            }
          };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data: widget.data ?? { error: error instanceof Error ? error.message : 'Plex error' }
          };
        }
      }

      if (widget.source === 'seerr') {
        try {
          const metrics = normalizeMetricList(
            widget.options?.metrics,
            SEERR_ALLOWED_METRICS,
            SEERR_DEFAULT_METRICS,
            SEERR_ALLOWED_METRICS.length
          );
          const baseUrl = typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const apiKey = typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;
          const data = await Promise.all(
            metrics.map(async (metric) => {
              const result = await fetchSeerrMetric(
                metric as 'pending' | 'approved' | 'available' | 'processing' | 'unavailable',
                { baseUrl, apiKey }
              );
              return { key: metric, value: result.value, label: result.label };
            })
          );
          return {
            ...widget,
            link,
            health,
            data: {
              metrics: data,
              value: data[0]?.value ?? 0,
              label: data[0]?.label ?? 'Current'
            }
          };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data: widget.data ?? { error: error instanceof Error ? error.message : 'Seerr error' }
          };
        }
      }

      if (widget.source === 'seerr-requests') {
        try {
          const baseUrl = typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const apiKey = typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;
          const limit = Number(widget.options?.limit ?? 10);
          const metrics = normalizeMetricList(
            widget.options?.metrics,
            SEERR_ALLOWED_METRICS,
            SEERR_DEFAULT_METRICS,
            SEERR_ALLOWED_METRICS.length
          );
          const [requestsData, metricsData] = await Promise.all([
            fetchSeerrRequests({ baseUrl, apiKey, limit }),
            Promise.all(
              metrics.map(async (metric) => {
                const result = await fetchSeerrMetric(
                  metric as 'pending' | 'approved' | 'available' | 'processing' | 'unavailable',
                  { baseUrl, apiKey }
                );
                return { key: metric, value: result.value, label: result.label };
              })
            )
          ]);
          const data = {
            ...requestsData,
            metrics: metricsData
          };
          return { ...widget, link, health, data };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data:
              widget.data ??
              { error: error instanceof Error ? error.message : 'Seerr requests error' }
          };
        }
      }

      if ((widget.source === 'monitor' || widget.source === 'service-hub') || widget.kind === 'monitor' || widget.kind === 'systemMonitor') {
        try {
          const monitorRefreshSec = Math.min(
            60,
            Math.max(1, Number(widget.options?.monitorRefreshSec ?? 15))
          );
          const lastCheckedAt =
            widget.data &&
            typeof widget.data === 'object' &&
            !Array.isArray(widget.data) &&
            typeof (widget.data as Record<string, unknown>).checkedAt === 'string'
              ? Date.parse(String((widget.data as Record<string, unknown>).checkedAt))
              : NaN;
          const skipFetch =
            Number.isFinite(lastCheckedAt) && Date.now() - lastCheckedAt < monitorRefreshSec * 1000;
          if (skipFetch && widget.data) {
            return { ...widget, link, health, data: widget.data };
          }

          const timeoutMs = Number(widget.options?.timeoutMs ?? 6000);
          const monitorStyle =
            widget.kind === 'systemMonitor'
              ? 'system'
              : widget.options?.monitorStyle === 'system'
                ? 'system'
                : 'list';
          const data =
            monitorStyle === 'system'
              ? await fetchSystemMonitorStatus({
                  nodes: widget.options?.monitorSystemNodes,
                  timeoutMs,
                  metricKeys: widget.options?.monitorSystemMetrics,
                  metricsByNode: widget.options?.monitorSystemMetricsByNode
                })
              : await fetchMonitorStatus({
                  targets: widget.options?.targets,
                  targetsText:
                    typeof widget.options?.targetsText === 'string' ? widget.options.targetsText : '',
                  timeoutMs,
                  dockerServers,
                  defaultDockerServer,
                  containersByServer
                });
          return { ...widget, link, health, data };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data:
              widget.data ??
              { error: error instanceof Error ? error.message : 'Monitor error' }
          };
        }
      }

      if (widget.kind === 'plex' || widget.kind === 'history' || widget.source === 'media-history') {
        try {
          const subtype = widget.options?.subtype === 'now-playing' ? 'now-playing' : 'history';
          const provider = widget.options?.provider === 'jellyfin' ? 'jellyfin' : 'plex';
          const baseUrl =
            typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl : undefined;
          const apiKey =
            typeof widget.options?.apiKey === 'string' ? widget.options.apiKey : undefined;

          const data =
            subtype === 'now-playing'
              ? await (async () => {
                  const nowPlaying = await fetchPlexNowPlaying({
                    widgetId: widget.id,
                    provider,
                    baseUrl,
                    apiKey,
                    sessionLimit: Number(widget.options?.sessionLimit ?? 1)
                  });
                  if (nowPlaying.sessions.length > 0) {
                    return nowPlaying;
                  }

                  const showFallbackMetrics = widget.options?.showFallbackMetrics !== false;
                  const showFallbackHistory = widget.options?.showFallbackHistory !== false;
                  const fallbackMetrics = showFallbackMetrics
                    ? normalizeMetricList(
                        widget.options?.metrics,
                        PLEX_ALLOWED_METRICS,
                        PLEX_DEFAULT_METRICS,
                        4
                      )
                    : [];
                  const [metricsData, historyData] = await Promise.all([
                    fallbackMetrics.length > 0
                      ? fetchPlexStats({ baseUrl, apiKey }).then((stats) =>
                          fallbackMetrics.map((metric) => {
                            const result = stats[metric as 'streams' | 'albums' | 'movies' | 'tv'];
                            return { key: metric, value: result.value, label: result.label };
                          })
                        )
                      : Promise.resolve([]),
                    showFallbackHistory
                      ? fetchMediaHistory({
                          widgetId: widget.id,
                          provider,
                          baseUrl,
                          apiKey,
                          userName:
                            typeof widget.options?.userName === 'string'
                              ? widget.options.userName
                              : undefined,
                          mediaTypes:
                            typeof widget.options?.mediaTypes === 'string'
                              ? widget.options.mediaTypes
                              : undefined,
                          limit: Number(widget.options?.idleHistoryLimit ?? 6)
                        }).then((payload) => payload.items)
                      : Promise.resolve([])
                  ]);

                  return {
                    ...nowPlaying,
                    fallbackMetrics: metricsData,
                    fallbackHistory: historyData
                  };
                })()
              : await fetchMediaHistory({
                  widgetId: widget.id,
                  provider,
                  baseUrl,
                  apiKey,
                  userName:
                    typeof widget.options?.userName === 'string'
                      ? widget.options.userName
                      : undefined,
                  mediaTypes:
                    typeof widget.options?.mediaTypes === 'string'
                      ? widget.options.mediaTypes
                      : undefined,
                  limit: Number(widget.options?.limit ?? 10)
                }).then(async (payload) => {
                  const showFallbackMetrics = widget.options?.showFallbackMetrics !== false;
                  if (!showFallbackMetrics || provider !== 'plex') return payload;
                  const fallbackMetrics = normalizeMetricList(
                    widget.options?.metrics,
                    PLEX_ALLOWED_METRICS,
                    PLEX_DEFAULT_METRICS,
                    4
                  );
                  if (fallbackMetrics.length === 0) return payload;
                  const stats = await fetchPlexStats({ baseUrl, apiKey });
                  const metrics = fallbackMetrics.map((metric) => {
                    const result = stats[metric as 'streams' | 'albums' | 'movies' | 'tv'];
                    return { key: metric, value: result.value, label: result.label };
                  });
                  return { ...payload, metrics };
                });
          return { ...widget, link, health, data };
        } catch (error) {
          return {
            ...widget,
            link,
            health,
            data:
              widget.data ??
              { error: error instanceof Error ? error.message : 'Plex widget error' }
          };
        }
      }

      return { ...widget, link, health };
    })
  );

  const refreshedById = new Map(updated.map((widget) => [widget.id, widget] as const));
  const baseWidgets = widgets !== widgetsSnapshot ? widgets : widgetsSnapshot;
  widgets = baseWidgets.map((widget) => {
    const refreshed = refreshedById.get(widget.id);
    if (!refreshed) return widget;
    return {
      ...widget,
      data: refreshed.data,
      health: refreshed.health,
      link: refreshed.link ?? widget.link
    };
  });

  const nextRefreshAtByWidgetId = { ...lastRefreshAtByWidgetId };
  for (const widget of widgetsToRefresh) {
    nextRefreshAtByWidgetId[widget.id] = now;
  }
  const activeIds = new Set(widgets.map((widget) => widget.id));
  for (const widgetId of Object.keys(nextRefreshAtByWidgetId)) {
    if (!activeIds.has(widgetId)) delete nextRefreshAtByWidgetId[widgetId];
  }

  runtimeState.lastRefreshAtByWidgetId = nextRefreshAtByWidgetId;
  runtimeState.widgets = widgets;
  runtimeState.settings = settings;
  broadcast('widgets', { widgets, settings });
};

const scheduleRefresh = async () => {
  const runtime = getRuntimeState();
  if (runtime.refreshPromise) {
    return runtime.refreshPromise;
  }

  runtime.refreshPromise = (async () => {
    try {
      await refreshWidgets();
    } finally {
      const nextRuntime = getRuntimeState();
      nextRuntime.refreshPromise = null;
    }
  })();

  return runtime.refreshPromise;
};

export const ensureWidgetsFresh = async () => {
  await scheduleRefresh();
  return { widgets, settings };
};

export const refreshConfigFromDisk = async () => {
  const runtimeState = getRuntimeState();
  const now = Date.now();
  const minRefreshIntervalMs = resolveDiskRefreshIntervalMs();

  if (
    runtimeState.lastDiskRefreshAt &&
    now - runtimeState.lastDiskRefreshAt < minRefreshIntervalMs
  ) {
    return { widgets, settings };
  }

  if (runtimeState.diskRefreshPromise) {
    return runtimeState.diskRefreshPromise;
  }

  runtimeState.diskRefreshPromise = (async () => {
    let diskConfig: WidgetConfig;
    try {
      diskConfig = await loadConfigFromDisk();
    } catch {
      // Keep the current in-memory snapshot if disk is temporarily unreadable.
      return { widgets, settings };
    }
    const nextSettings = normalizeDashboardSettings(diskConfig.settings);
    const nextConfigWidgets = normalizeWidgets(diskConfig.widgets ?? [], nextSettings);
    const previousById = new Map(widgets.map((widget) => [widget.id, widget] as const));

    config = {
      widgets: nextConfigWidgets,
      settings: nextSettings
    };
    settings = nextSettings;
    widgets = nextConfigWidgets.map((widget) => {
      const previous = previousById.get(widget.id);
      return {
        ...widget,
        data: previous?.data ?? null,
        health: previous?.health,
        link: previous?.link
      };
    });
    runtimeState.lastRefreshAtByWidgetId = {};
    runtimeState.widgets = widgets;
    runtimeState.settings = settings;
    ensureRefreshTimer();
    return { widgets, settings };
  })();

  try {
    return await runtimeState.diskRefreshPromise;
  } finally {
    const nextRuntime = getRuntimeState();
    nextRuntime.lastDiskRefreshAt = Date.now();
    nextRuntime.diskRefreshPromise = null;
  }
};

const resolveRefreshIntervalMs = (list: WidgetInstance[]) => {
  const monitorIntervalsMs = list
    .filter((widget) => isMonitorLikeWidget(widget))
    .map((widget) => resolveWidgetRefreshIntervalMs(widget));
  if (monitorIntervalsMs.length === 0) return DEFAULT_REFRESH_INTERVAL_MS;
  return Math.max(
    MIN_REFRESH_INTERVAL_MS,
    Math.min(DEFAULT_REFRESH_INTERVAL_MS, Math.min(...monitorIntervalsMs))
  );
};

const ensureRefreshTimer = () => {
  const runtimeState = getRuntimeState();
  const nextIntervalMs = resolveRefreshIntervalMs(widgets);
  if (runtimeState.timer && runtimeState.refreshIntervalMs === nextIntervalMs) return;
  if (runtimeState.timer) {
    clearInterval(runtimeState.timer);
  }
  runtimeState.refreshIntervalMs = nextIntervalMs;
  runtimeState.timer = setInterval(() => {
    void scheduleRefresh();
  }, nextIntervalMs);
};

const runtime = getRuntimeState();
if (runtime.timer) clearInterval(runtime.timer);
runtime.timer = undefined;
runtime.refreshIntervalMs = undefined;
ensureRefreshTimer();

void scheduleRefresh();

export const getWidgets = () => widgets;

export const updateWidgetConfig = async (nextConfig: WidgetConfig) => {
  const previousById = new Map(
    widgets.map((widget) => [widget.id, widget] as const)
  );
  const nextSettings = normalizeDashboardSettings(nextConfig.settings);
  config = {
    widgets: normalizeWidgets(nextConfig.widgets ?? [], nextSettings),
    settings: nextSettings
  };
  settings = nextSettings;
  widgets = config.widgets.map((widget) => {
    const previous = previousById.get(widget.id);
    return {
      ...widget,
      data: previous?.data ?? null,
      health: previous?.health,
      link: previous?.link
    };
  });
  {
    const runtimeState = getRuntimeState();
    runtimeState.lastRefreshAtByWidgetId = {};
    runtimeState.widgets = widgets;
    runtimeState.settings = settings;
  }
  ensureRefreshTimer();
  // Push option/layout-only edits (like monitor orientation) immediately.
  broadcast('widgets', { widgets, settings });
  // Refresh data in the background so saves/navigation are not blocked by slow connectors.
  void scheduleRefresh().catch(() => {});
};

export const getSettings = () => settings;
