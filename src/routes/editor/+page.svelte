<script lang="ts">
	  import { onMount } from 'svelte';
	  import WidgetGrid from '$components/WidgetGrid.svelte';
	  import ConfirmationModal from '$lib/components/ConfirmationModal.svelte';
	  import TabIdentityModal from '$lib/components/TabIdentityModal.svelte';
		  import SettingsDrawer from '$lib/components/SettingsDrawer.svelte';
		  import TypographyControl from '$lib/components/TypographyControl.svelte';
		  import { getDashboardIconUrlBySlug, getSourceIconUrl } from '$lib/shared/dashboardIcons';
		  import type { WidgetInstance, WidgetKind, DashboardTab, DashboardSettings } from '$widgets/types';
		  import {
		    TAB_ICON_DEFS,
		    normalizeTabIconKey,
		    tabIconFallbackForName,
		    getTabIconPaths,
		    type TabIconKey
		  } from '$widgets/tabIcons';
		  import {
		    defaultPortBySource,
		    widgetStyleCategories,
		    type WidgetStyleOption
		  } from '$lib/shared/widgetCatalog';
		  import {
		    DASHBOARD_GRID_COLUMNS,
		    createDefaultDashboardSettings,
		    normalizeDashboardSettings,
		    resolveDashboardDefaultTabId as resolveDefaultDashboardTabId
		  } from '$lib/shared/dashboardSettings';
		  import {
		    normalizeEditorTabConfig,
		    resolveEditorTabState,
		    resolveEditorWidgetTabId
		  } from '$lib/shared/editorTabState';
		  import {
		    parseExecutionNodes,
		    type ExecutionNode,
		    type ExecutionNodeId
		  } from '$lib/shared/executionNodes';
		  import {
		    buildMonitorSystemNodeBaseUrl,
		    getMonitorSystemNodesForWidget,
		    getMonitorTargetsForWidget,
		    normalizeMonitorMethod,
		    sanitizeMonitorTargets,
		    serializeMonitorTargetsText,
		    type MonitorEditorTarget,
		    type MonitorSystemNode
		  } from '$lib/shared/monitorEditor';
		  import { normalizeHexColor, toWidgetBackgroundRgb } from '$lib/shared/styleUtils';
		  import { slugifyTabId, reorderById } from '$lib/shared/tabs';
		  import { goto } from '$app/navigation';
		  import { env as publicEnv } from '$env/dynamic/public';

	  type WidgetConfig = {
	    widgets: WidgetInstance[];
	    settings?: DashboardSettings;
	  };

  let config: WidgetConfig = { widgets: [] };
  let selectedId = '';
  let saving = false;
  let mounted = false;
  let error = '';
  let showError = false;
  let errorTimer: ReturnType<typeof setTimeout> | null = null;
  let dragId = '';
  let dragOverId = '';
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartSpan = 4;
  let resizeStartHeight = 0;
  let activeTab = 'widgets';
  let dashboardSettingsTab: 'layout' | 'appearance' | 'background' | 'typography' | 'tabs' = 'layout';
  let lastWidgetSelection = '';
	  const initialSettings = createDefaultDashboardSettings();
	  let settings: Required<DashboardSettings> = initialSettings;
	  let dashboardTabs: DashboardTab[] = [...initialSettings.tabs];
	  let defaultDashboardTabId = initialSettings.defaultTabId;
	  let defaultDashboardTabIdWeb = initialSettings.defaultTabIdWeb;
	  let defaultDashboardTabIdMobile = initialSettings.defaultTabIdMobile;
	  let widgetEditorTabId = initialSettings.defaultTabId;
  let requestedEditorTabId = '';
  let requestedWidgetId = '';
  let returnDashboardTabId = '';
  let returnWithEditMode = false;
  let liveWidgets: WidgetInstance[] = [];
  let liveWidgetMap = new Map<string, WidgetInstance>();
  let selectedWidgetItem: WidgetInstance | undefined;
  let editableWidgets: WidgetInstance[] = [];
  let sidebarWidgetQuery = '';
  let sortedEditableWidgets: WidgetInstance[] = [];
  let filteredSidebarWidgets: WidgetInstance[] = [];
  let previewWidget: WidgetInstance | undefined;
  let previewItems: WidgetInstance[] = [];
  let previewViewport: 'desktop' | 'mobile' = 'desktop';
  let previewZoom = 1;
  const MIN_PREVIEW_ZOOM = 0.5;
  const MAX_PREVIEW_ZOOM = 2;
	  const PREVIEW_DESKTOP_GRID_COLUMNS = DASHBOARD_GRID_COLUMNS;
  const PREVIEW_DESKTOP_GRID_WIDTH = 1600;
  const PREVIEW_DESKTOP_MAGNIFICATION = 2;
  let previewDesktopWidth = PREVIEW_DESKTOP_GRID_WIDTH;
  let stageSavePulse = false;
  let stageSavePulseTimer: ReturnType<typeof setTimeout> | null = null;
  let previewFrameEl: HTMLDivElement | null = null;
  let stageWidgetFootprint = { width: 0, height: 0 };
  let savedSnapshot = '';
  let hasDraftChanges = false;
  let showControlCenter = false;
  let tabButtonRefs: Record<string, HTMLButtonElement | null> = {};
  let addTabButtonRef: HTMLButtonElement | null = null;
  let tabLaneEl: HTMLDivElement | null = null;
  let previousTabCount = 0;
  let tabLaneMiddleDrag = false;
  let tabLaneDragStartX = 0;
  let tabLaneDragStartLeft = 0;
  let lastAutoScrolledTabId = '';
  let pendingTabDeletion: DashboardTab | null = null;
  let showTabDeleteModal = false;
  let deletingTabId = '';
  let showConnectionSecret = false;
  let komodoIconDraftName = '';
  let komodoIconDraftUrl = '';
  let komodoIconDraftWidgetId = '';
  let draggingTabId = '';
  let dragOverTabId = '';
  let dragOverTabPosition: 'before' | 'after' = 'before';
  let fontTarget: 'title' | 'header' = 'title';
  let showAddWidgetWizard = false;
  let addWidgetWizardStep: 'style' | 'node' = 'style';
  let pendingWidgetKind: WidgetKind = 'stat';
  let pendingWidgetTitle = 'Metric Grids';
  let pendingWidgetSource = '';
  let pendingWidgetPresetOptions: Record<string, unknown> = {};
  const tabRef = (node: HTMLButtonElement, tabId: string) => {
    tabButtonRefs[tabId] = node;
    return {
      update(nextTabId: string) {
        if (nextTabId !== tabId) {
          tabButtonRefs[tabId] = null;
          tabButtonRefs[nextTabId] = node;
        }
      },
      destroy() {
        if (tabButtonRefs[tabId] === node) tabButtonRefs[tabId] = null;
      }
    };
  };
  const getActiveFontFamily = () =>
    fontTarget === 'title'
      ? (settings.globalTitleFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif')
      : (settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif');
  const getActiveFontWeight = () =>
    fontTarget === 'title' ? (settings.globalTitleFontWeight ?? 600) : (settings.globalHeaderFontWeight ?? 600);
  const getActiveFontColor = () =>
    fontTarget === 'title'
      ? normalizeHexColor(settings.globalTitleColor, '#eef4ff')
      : normalizeHexColor(settings.globalHeaderColor, '#eef4ff');
  const getActiveFontSize = () =>
    fontTarget === 'title' ? Number(settings.cardTitleSize ?? 17.6) : Number(settings.cardTitleAboveSize ?? 12);
  const setActiveFontFamily = (value: string) => {
    if (fontTarget === 'title') updateSettings({ globalTitleFontFamily: value });
    else updateSettings({ globalHeaderFontFamily: value });
  };
  const setActiveFontWeight = (value: number) => {
    const clamped = Math.min(900, Math.max(300, Number(value)));
    if (fontTarget === 'title') updateSettings({ globalTitleFontWeight: clamped });
    else updateSettings({ globalHeaderFontWeight: clamped });
  };
  const setActiveFontColor = (value: string) => {
    const normalized = normalizeHexColor(value, '#eef4ff');
    if (fontTarget === 'title') updateSettings({ globalTitleColor: normalized });
    else updateSettings({ globalHeaderColor: normalized });
  };
  const setActiveFontSize = (value: number) => {
    if (fontTarget === 'title') {
      updateSettings({ cardTitleSize: Math.min(48, Math.max(10, Number(value))) });
    } else {
      updateSettings({ cardTitleAboveSize: Math.min(36, Math.max(8, Number(value))) });
    }
  };
  $: if (
    typeof window !== 'undefined' &&
    widgetEditorTabId &&
    widgetEditorTabId !== lastAutoScrolledTabId
  ) {
    lastAutoScrolledTabId = widgetEditorTabId;
    requestAnimationFrame(() => {
      tabButtonRefs[widgetEditorTabId]?.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
      });
    });
  }
  $: if (typeof window !== 'undefined' && dashboardTabs.length !== previousTabCount) {
    const grew = dashboardTabs.length > previousTabCount;
    previousTabCount = dashboardTabs.length;
    if (grew) {
      requestAnimationFrame(() => {
        addTabButtonRef?.scrollIntoView({
          behavior: 'smooth',
          inline: 'end',
          block: 'nearest'
        });
      });
    }
  }

  const kinds: WidgetKind[] = ['stat', 'chart', 'service', 'prowlarr', 'sabnzbd', 'speedtest', 'grafana', 'monitor', 'systemMonitor', 'calendar', 'clock', 'requests', 'plex'];
  const kindLabels: Record<WidgetKind, string> = {
    stat: 'Metric Grids',
    chart: 'DNS',
    service: 'Docker Manager',
    prowlarr: 'Prowlarr',
    sabnzbd: 'Downloaders',
    speedtest: 'SpeedTest',
    grafana: 'Grafana',
    monitor: 'Service Hub',
    systemMonitor: 'System Monitor',
    calendar: 'Calendar',
    clock: 'Clock',
    requests: 'Seer Requests',
    plex: 'Media Player',
    history: 'Media Player (Legacy)'
  };
  const sourceKeyOptions = [
    { value: '', label: 'none' },
    { value: 'technitium', label: 'technitium' },
    { value: 'komodo', label: 'komodo' },
    { value: 'service-hub', label: 'service-hub' },
    { value: 'glances', label: 'glances' },
    { value: 'seerr', label: 'seerr' },
    { value: 'seerr-requests', label: 'seerr-requests' },
    { value: 'radarr', label: 'radarr' },
    { value: 'readarr', label: 'readarr' },
    { value: 'sonarr', label: 'sonarr' },
    { value: 'audiobookshelf', label: 'audiobookshelf' },
    { value: 'sabnzbd', label: 'SABnzbd' },
    { value: 'qbittorrent', label: 'qBittorrent' },
    { value: 'home-assistant', label: 'home-assistant' },
    { value: 'scrutiny', label: 'scrutiny' },
    { value: 'tandoor', label: 'tandoor' },
    { value: 'speedtest-tracker', label: 'speedtest-tracker' },
    { value: 'prowlarr', label: 'prowlarr' },
    { value: 'profilarr', label: 'profilarr' },
    { value: 'grafana', label: 'grafana' },
    { value: 'plex', label: 'plex' },
    { value: 'jellyfin', label: 'jellyfin' },
    { value: 'media-history', label: 'media-history' }
  ] as const;
  const sortedSourceKeyOptions = [...sourceKeyOptions].sort((a, b) => {
    return a.label.toLowerCase().localeCompare(b.label.toLowerCase());
  });
  const downloaderSourceOptions = sortedSourceKeyOptions.filter(
    (option) => option.value === '' || option.value === 'sabnzbd' || option.value === 'qbittorrent'
  );
  const metricGridSourceAllowList = new Set([
    'audiobookshelf',
    'komodo',
    'home-assistant',
    'plex',
    'prowlarr',
    'qbittorrent',
    'radarr',
    'readarr',
    'sabnzbd',
    'scrutiny',
    'seerr',
    'sonarr',
    'speedtest-tracker',
    'tandoor',
    'technitium',
    'profilarr'
  ]);
  const metricGridSourceOptions = sortedSourceKeyOptions.filter((option) =>
    metricGridSourceAllowList.has(option.value)
  );
  const speedtestSourceOptions = sortedSourceKeyOptions.filter(
    (option) => option.value === 'speedtest-tracker'
  );
  const mediaPlayerSourceOptions = sortedSourceKeyOptions.filter(
    (option) => option.value === 'plex' || option.value === 'jellyfin'
  );
  const systemMonitorSourceOptions = sortedSourceKeyOptions.filter(
    (option) => option.value === 'glances'
  );
  const getSourceOptionsForKind = (kind: WidgetKind) =>
    kind === 'sabnzbd'
      ? downloaderSourceOptions
      : kind === 'systemMonitor'
        ? systemMonitorSourceOptions
      : kind === 'speedtest'
        ? speedtestSourceOptions
      : kind === 'plex' || kind === 'history'
        ? mediaPlayerSourceOptions
      : kind === 'stat'
        ? metricGridSourceOptions
        : sortedSourceKeyOptions;
  const hasSourceOptionForKind = (kind: WidgetKind, source: string) =>
    getSourceOptionsForKind(kind).some((option) => option.value === source);
  const getMonitorMode = (widget: WidgetInstance | undefined): 'system' | 'list' => {
    if (!widget) return 'list';
    if (widget.kind === 'systemMonitor') return 'system';
    if (widget.kind === 'monitor') return 'list';
    return widget.options?.monitorStyle === 'system' ? 'system' : 'list';
  };
  const getSystemMonitorDisplay = (
    widget: WidgetInstance | undefined
  ): 'compact' | 'gauge' | 'linear' | 'header' | 'spark' => {
    if (getMonitorMode(widget) !== 'system') return 'compact';
    const raw = String(widget?.options?.monitorDisplay ?? 'compact');
    return raw === 'gauge' || raw === 'linear' || raw === 'header' || raw === 'spark'
      ? raw
      : 'compact';
  };
  const getDefaultSourceForKind = (kind: WidgetKind, currentSource = '') => {
    if (kind === 'monitor') return 'service-hub';
    if (kind === 'systemMonitor') return 'glances';
    if (kind === 'prowlarr') return 'prowlarr';
    if (kind === 'sabnzbd') return '';
    if (kind === 'plex' || kind === 'history') return 'plex';
    if (kind === 'speedtest') return 'speedtest-tracker';
    if (kind === 'requests') return 'seerr-requests';
    if (kind === 'grafana') return 'grafana';
    if (kind === 'calendar' || kind === 'clock') return '';
    if (kind === 'stat') return metricGridSourceOptions[0]?.value ?? 'audiobookshelf';
    return currentSource.trim();
  };
  const isMonitorSource = (source: unknown) => {
    const normalized = String(source ?? '').trim().toLowerCase();
    return normalized === 'monitor' || normalized === 'service-hub';
  };
  const isMonitorWidget = (widget: WidgetInstance | undefined) =>
    Boolean(widget && (widget.kind === 'monitor' || widget.kind === 'systemMonitor' || isMonitorSource(widget.source)));
  const normalizeWidgetSource = (widget: WidgetInstance): WidgetInstance => {
    if (widget.kind === 'monitor') {
      return { ...widget, source: 'service-hub' };
    }
    if (widget.kind === 'systemMonitor') {
      return { ...widget, source: 'glances' };
    }
    if (widget.kind === 'requests') {
      return { ...widget, source: 'seerr-requests' };
    }
    return widget;
  };
  const seerrMetricOptions = ['pending', 'approved', 'processing', 'available', 'unavailable'] as const;
  const technitiumMetricOptions = [
    'totalQueries',
    'blockedPct',
    'latency',
    'failures',
    'cachedAvgLatency',
    'cached',
    'recursive',
    'authoritative'
  ] as const;
  const radarrMetricOptions = ['wanted', 'missing', 'queued', 'movies'] as const;
  const readarrMetricOptions = ['wanted', 'queued', 'books'] as const;
  const sonarrMetricOptions = ['wanted', 'queued', 'series'] as const;
  const audiobookshelfMetricOptions = ['podcasts', 'podcastsDuration', 'books', 'booksDuration'] as const;
  const sabnzbdMetricOptions = ['rate', 'queue', 'timeleft'] as const;
  const qbittorrentMetricOptions = ['leech', 'download', 'seed', 'upload'] as const;
  const komodoMetricOptions = [
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
  const prowlarrMetricOptions = [
    'numberOfGrabs',
    'numberOfQueries',
    'numberOfFailGrabs',
    'numberOfFailQueries'
  ] as const;
  const profilarrMetricOptions = [
    'lastRepoSync',
    'lastCommit',
    'syncedProfiles',
    'failedSyncTasks24h',
    'lastSyncStatus',
    'commitsBehindAhead',
    'customFormats'
  ] as const;
  const scrutinyMetricOptions = ['passed', 'failed', 'unknown'] as const;
  const tandoorMetricOptions = ['users', 'recipes', 'keywords'] as const;
  const speedtestTrackerMetricOptions = ['download', 'upload', 'ping'] as const;
  const homeAssistantMetricOptions = ['people_home', 'lights_on', 'switches_on'] as const;
  const plexMetricOptions = ['streams', 'albums', 'movies', 'tv'] as const;
  const monitorSystemMetricOptions = [
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
  const metricLabels: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    available: 'Available',
    processing: 'Processing',
    unavailable: 'Unavailable',
    wanted: 'Wanted',
    missing: 'Missing',
    queued: 'Queued',
    movies: 'Movies',
    books: 'Books',
    series: 'Series',
    podcasts: 'Podcasts',
    podcastsDuration: 'Podcast Time',
    booksDuration: 'Book Time',
    users: 'Users',
    recipes: 'Recipes',
    keywords: 'Keywords',
    people_home: 'People Home',
    lights_on: 'Lights On',
    switches_on: 'Switches On',
    rate: 'Rate',
    queue: 'Queue',
    timeleft: 'Time Left',
    leech: 'Leech',
    download: 'Download',
    seed: 'Seed',
    upload: 'Upload',
    container_total: 'Containers Total',
    container_running: 'Containers Running',
    container_stopped: 'Containers Stopped',
    container_unhealthy: 'Containers Unhealthy',
    container_unknown: 'Containers Unknown',
    stack_total: 'Stacks Total',
    stack_running: 'Stacks Running',
    stack_stopped: 'Stacks Stopped',
    stack_unhealthy: 'Stacks Unhealthy',
    stack_unknown: 'Stacks Unknown',
    summary_servers: 'Servers',
    summary_stacks: 'Stacks',
    summary_containers: 'Containers',
    numberOfGrabs: 'Grabs',
    numberOfQueries: 'Queries',
    numberOfFailGrabs: 'Failed Grabs',
    numberOfFailQueries: 'Failed Queries',
    lastRepoSync: 'Last Repo Sync',
    lastCommit: 'Last Commit',
    syncedProfiles: 'Synced Profiles',
    failedSyncTasks24h: 'Failed Sync (24h)',
    lastSyncStatus: 'Last Sync Status',
    commitsBehindAhead: 'Commits (Behind/Ahead)',
    customFormats: 'Custom Formats',
    streams: 'Streams',
    albums: 'Albums',
    tv: 'TV',
    totalQueries: 'Queries',
    blockedPct: 'Blocked',
    latency: 'Latency',
    failures: 'Failure',
    cachedAvgLatency: 'Cached Avg. Latency',
    cached: 'Cached',
    recursive: 'Recursive',
    authoritative: 'Authoritative',
    passed: 'Passed',
    failed: 'Failed',
    unknown: 'Unknown',
    ping: 'Ping',
    temperature: 'CPU Temp',
    activeMemory: 'Active Memory',
    network: 'Network',
    diskio: 'Disk I/O',
    load1: 'Load 1m',
    load5: 'Load 5m',
    load15: 'Load 15m'
  };

  type ServicePreviewItem = {
    name?: string;
    icon?: string;
  };

  type MonitorTargetTestState = {
    status: 'idle' | 'loading' | 'ok' | 'error';
    message: string;
  };
  type WidgetHealthTestState = {
    status: 'idle' | 'loading' | 'ok' | 'error';
    message: string;
  };

  type HomeAssistantCustomMetric = {
    state: string;
    template: string;
    label: string;
    value: string;
  };

  const MAX_HOME_ASSISTANT_CUSTOM_METRICS = 20;
  let homeAssistantCustomMetricsForSelected: HomeAssistantCustomMetric[] = [];
  let homeAssistantCustomMetricsDrafts: Record<string, HomeAssistantCustomMetric[]> = {};
  let monitorTargetTestStates: Record<string, MonitorTargetTestState> = {};
  let widgetHealthTestStates: Record<string, WidgetHealthTestState> = {};
  let draggingMonitorMetricNode = '';
  let draggingMonitorMetricKey = '';
  let dragOverMonitorMetricNode = '';
  let dragOverMonitorMetricKey = '';
  let dragOverMonitorMetricPosition: 'before' | 'after' = 'before';
  const getMonitorTargetTestKey = (widgetId: string, index: number) => `${widgetId}:${index}`;
  const clearMonitorTargetTestsForWidget = (widgetId: string) => {
    monitorTargetTestStates = Object.fromEntries(
      Object.entries(monitorTargetTestStates).filter(([key]) => !key.startsWith(`${widgetId}:`))
    );
  };
  const executionNodes = parseExecutionNodes(publicEnv.PUBLIC_EXECUTION_NODES ?? '');
  const getWidgetNodeBadge = (widget: WidgetInstance) => {
    const rawNode =
      typeof widget.options?.executionNode === 'string' && widget.options.executionNode.trim()
        ? widget.options.executionNode.trim()
        : typeof widget.options?.healthServer === 'string' && widget.options.healthServer.trim()
          ? widget.options.healthServer.trim()
          : '';
    const resolved = executionNodes.find((entry) => entry.value === rawNode);
    if (!resolved) return rawNode || 'Unknown';
    const short = resolved.label.split('(')[0]?.trim() || resolved.value;
    return short;
  };
  const handlePreviewWidgetClick = (widget: WidgetInstance | undefined) => {
    if (!widget) return;
    const rawLink = String(widget.link ?? '').trim();
    if (!rawLink) return;
    const normalized = /^https?:\/\//i.test(rawLink) ? rawLink : `https://${rawLink}`;
    try {
      const destination = new URL(normalized);
      window.open(destination.toString(), '_blank', 'noopener,noreferrer');
    } catch {
      return;
    }
  };
  const getWidgetProviderValue = (widget: WidgetInstance) => {
    if (widget.kind === 'plex' || widget.kind === 'history') {
      const provider = String(widget.options?.provider ?? '').trim().toLowerCase();
      if (provider) return provider;
    }
    const normalized = String(widget.source ?? '').trim().toLowerCase();
    return normalized === 'monitor' ? 'service-hub' : normalized;
  };
  const getWidgetProviderLabel = (widget: WidgetInstance) => {
    const provider = getWidgetProviderValue(widget);
    if (!provider) return 'No source';
    const option =
      getSourceOptionsForKind(widget.kind).find((entry) => entry.value === provider) ??
      sourceKeyOptions.find((entry) => entry.value === provider);
    return option?.label ?? provider;
  };
  const getWidgetSidebarTitle = (widget: WidgetInstance) => {
    const title = String(widget.title ?? '').trim();
    return title || getWidgetProviderLabel(widget);
  };
  const getWidgetSidebarIconUrl = (widget: WidgetInstance) => {
    const provider = getWidgetProviderValue(widget);
    if (!provider) return '';
    return getSourceIconUrl(provider) ?? getDashboardIconUrlBySlug(provider) ?? '';
  };
  const getWidgetSidebarSortKey = (widget: WidgetInstance) => {
    const title = String(widget.title ?? '').trim();
    const fallback = getWidgetProviderLabel(widget);
    return (title || fallback || '').toLowerCase();
  };
  const getKomodoRowsControlValue = (value: unknown) => {
    const parsed = Number(value ?? 2);
    if (Number.isFinite(parsed) && Math.round(parsed) === 0) return 'auto';
    return String(Math.min(20, Math.max(1, Math.round(parsed) || 2)));
  };
  const parseKomodoRowsControlValue = (raw: string) => {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'auto' || normalized === '0') return 0;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return 2;
    return Math.min(20, Math.max(1, Math.round(parsed)));
  };
  type TypographyScope =
    | 'cardTitle'
    | 'cardHeader'
    | 'metricValue'
    | 'metricLabel'
    | 'sessionMeta'
    | 'sessionLabels'
    | 'playbackStatus'
    | 'nowPlayingTitleText'
    | 'nowPlayingUserText'
    | 'requestTitleText'
    | 'requestMediaText'
    | 'requestUserText'
    | 'requestBadgeText'
    | 'monitorName'
    | 'monitorStatus'
    | 'monitorLatency'
    | 'monitorPrimary'
    | 'monitorUnit'
    | 'komodoName'
    | 'komodoServer'
    | 'dnsAxis'
    | 'dnsLegend';
  type TypographyField = 'font' | 'weight' | 'size' | 'color';
  type TypographySnapshot = { font: string; weight: number; size: number; color: string };
  const typographyFontOptions = [
    { value: 'Space Grotesk, Sora, Manrope, sans-serif', label: 'Space Grotesk' },
    { value: 'Sora, Space Grotesk, sans-serif', label: 'Sora' },
    { value: 'Manrope, Space Grotesk, sans-serif', label: 'Manrope' },
    { value: 'Inter, sans-serif', label: 'Inter' },
    { value: 'system-ui, sans-serif', label: 'System' }
  ];
  const typographyOptionKey: Record<TypographyScope, Record<TypographyField, string>> = {
    cardTitle: {
      font: 'cardTitleFont',
      weight: 'cardTitleWeight',
      size: 'cardTitleSize',
      color: 'cardTitleColor'
    },
    cardHeader: {
      font: 'cardHeaderFont',
      weight: 'cardHeaderWeight',
      size: 'cardHeaderSize',
      color: 'cardHeaderColor'
    },
    metricValue: {
      font: 'metricFont',
      weight: 'metricFontWeight',
      size: 'metricFontSize',
      color: 'metricFontColor'
    },
    metricLabel: {
      font: 'metricLabelFont',
      weight: 'metricLabelFontWeight',
      size: 'metricLabelFontSize',
      color: 'metricLabelFontColor'
    },
    sessionMeta: {
      font: 'sessionMetaFont',
      weight: 'sessionMetaWeight',
      size: 'sessionMetaSize',
      color: 'sessionMetaColor'
    },
    sessionLabels: {
      font: 'sessionLabelFont',
      weight: 'sessionLabelWeight',
      size: 'sessionLabelSize',
      color: 'sessionLabelColor'
    },
    playbackStatus: {
      font: 'playbackStatusFont',
      weight: 'playbackStatusWeight',
      size: 'playbackStatusSize',
      color: 'playbackStatusColor'
    },
    nowPlayingTitleText: {
      font: 'nowPlayingTitleTextFont',
      weight: 'nowPlayingTitleTextWeight',
      size: 'nowPlayingTitleTextSize',
      color: 'nowPlayingTitleTextColor'
    },
    nowPlayingUserText: {
      font: 'nowPlayingUserTextFont',
      weight: 'nowPlayingUserTextWeight',
      size: 'nowPlayingUserTextSize',
      color: 'nowPlayingUserTextColor'
    },
    requestTitleText: {
      font: 'titleFont',
      weight: 'titleWeight',
      size: 'titleSize',
      color: 'titleColor'
    },
    requestMediaText: {
      font: 'mediaFont',
      weight: 'mediaWeight',
      size: 'mediaSize',
      color: 'mediaColor'
    },
    requestUserText: {
      font: 'userFont',
      weight: 'userWeight',
      size: 'userSize',
      color: 'userColor'
    },
    requestBadgeText: {
      font: 'statusFont',
      weight: 'statusWeight',
      size: 'statusSize',
      color: 'statusColor'
    },
    monitorName: {
      font: 'monitorNameFont',
      weight: 'monitorNameWeight',
      size: 'monitorNameSize',
      color: 'monitorNameColor'
    },
    monitorStatus: {
      font: 'monitorStatusFont',
      weight: 'monitorStatusWeight',
      size: 'monitorStatusSize',
      color: 'monitorStatusColor'
    },
    monitorLatency: {
      font: 'monitorLatencyFont',
      weight: 'monitorLatencyWeight',
      size: 'monitorLatencySize',
      color: 'monitorLatencyColor'
    },
    monitorPrimary: {
      font: 'monitorPrimaryFont',
      weight: 'monitorPrimaryWeight',
      size: 'monitorPrimarySize',
      color: 'monitorPrimaryColor'
    },
    monitorUnit: {
      font: 'monitorUnitFont',
      weight: 'monitorUnitWeight',
      size: 'monitorUnitSize',
      color: 'monitorUnitColor'
    },
    komodoName: {
      font: 'containerNameFont',
      weight: 'containerNameWeight',
      size: 'containerNameSize',
      color: 'containerNameColor'
    },
    komodoServer: {
      font: 'containerServerFont',
      weight: 'containerServerWeight',
      size: 'containerServerSize',
      color: 'containerServerColor'
    },
    dnsAxis: {
      font: 'dnsAxisFont',
      weight: 'dnsAxisWeight',
      size: 'dnsAxisSize',
      color: 'dnsAxisColor'
    },
    dnsLegend: {
      font: 'dnsLegendFont',
      weight: 'dnsLegendWeight',
      size: 'dnsLegendSize',
      color: 'dnsLegendColor'
    }
  };
  const getTypographyInherited = (scope: TypographyScope): TypographySnapshot => {
    if (scope === 'cardTitle') {
      return {
        font: settings.globalTitleFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: Math.min(900, Math.max(300, Number(settings.globalTitleFontWeight ?? 600))),
        size: Math.min(48, Math.max(8, Number(settings.cardTitleSize ?? 17.6))),
        color: normalizeHexColor(settings.globalTitleColor, '#eef4ff')
      };
    }
    if (scope === 'cardHeader') {
      return {
        font: settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: Math.min(900, Math.max(300, Number(settings.globalHeaderFontWeight ?? 600))),
        size: Math.min(36, Math.max(8, Number(settings.cardTitleAboveSize ?? 12))),
        color: normalizeHexColor(settings.globalHeaderColor, '#eef4ff')
      };
    }
    if (scope === 'sessionMeta') {
      return {
        font: settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: 300,
        size: 20,
        color: '#eef4ff'
      };
    }
    if (scope === 'sessionLabels') {
      return {
        font: settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: 300,
        size: 12,
        color: '#9aa8ba'
      };
    }
    if (scope === 'playbackStatus') {
      return {
        font: settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: Math.min(900, Math.max(300, Number(settings.globalHeaderFontWeight ?? 600))),
        size: 10,
        color: '#cadbec'
      };
    }
    if (scope === 'nowPlayingTitleText') {
      return {
        font: settings.globalTitleFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: Math.min(900, Math.max(300, Number(settings.globalTitleFontWeight ?? 600))),
        size: 13,
        color: '#f4f8ff'
      };
    }
    if (scope === 'nowPlayingUserText') {
      return {
        font: settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: Math.min(900, Math.max(300, Number(settings.globalHeaderFontWeight ?? 600))),
        size: 10,
        color: '#cadbec'
      };
    }
    if (scope === 'requestTitleText') {
      return {
        font: settings.globalTitleFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: Math.min(900, Math.max(300, Number(settings.globalTitleFontWeight ?? 600))),
        size: 13,
        color: '#eef4ff'
      };
    }
    if (scope === 'requestMediaText') {
      return {
        font: settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: Math.min(900, Math.max(300, Number(settings.globalHeaderFontWeight ?? 600))),
        size: 11,
        color: '#9dbad0'
      };
    }
    if (scope === 'requestUserText') {
      return {
        font: settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: Math.min(900, Math.max(300, Number(settings.globalHeaderFontWeight ?? 600))),
        size: 11,
        color: '#a8c7df'
      };
    }
    if (scope === 'requestBadgeText') {
      return {
        font: settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: Math.min(900, Math.max(300, Number(settings.globalHeaderFontWeight ?? 600))),
        size: 11,
        color: '#d9ecff'
      };
    }
    if (scope === 'monitorName') {
      return {
        font: settings.globalTitleFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: 600,
        size: 16,
        color: '#eef4ff'
      };
    }
    if (scope === 'monitorStatus') {
      return {
        font: settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: 600,
        size: 13,
        color: '#b6cadf'
      };
    }
    if (scope === 'monitorLatency') {
      return {
        font: settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: 600,
        size: 13,
        color: '#9aa8ba'
      };
    }
    if (scope === 'monitorPrimary') {
      return {
        font: settings.globalTitleFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: 700,
        size: 28,
        color: '#eef4ff'
      };
    }
    if (scope === 'monitorUnit') {
      return {
        font: settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: 600,
        size: 13,
        color: '#9aa8ba'
      };
    }
    if (scope === 'komodoName') {
      return {
        font: settings.globalTitleFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: 600,
        size: 16,
        color: '#eef4ff'
      };
    }
    if (scope === 'komodoServer') {
      return {
        font: settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: 600,
        size: 12,
        color: '#9aa8ba'
      };
    }
    if (scope === 'dnsAxis') {
      return {
        font: settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: Math.min(900, Math.max(300, Number(settings.globalHeaderFontWeight ?? 600))),
        size: 11,
        color: '#9fb4ca'
      };
    }
    if (scope === 'dnsLegend') {
      return {
        font: settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
        weight: Math.min(900, Math.max(300, Number(settings.globalHeaderFontWeight ?? 600))),
        size: 12,
        color: '#cadbec'
      };
    }
    return {
      font:
        scope === 'metricLabel'
          ? settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif'
          : settings.globalTitleFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif',
      weight:
        scope === 'metricLabel'
          ? Math.min(900, Math.max(300, Number(settings.globalHeaderFontWeight ?? 600)))
          : Math.min(900, Math.max(300, Number(settings.globalTitleFontWeight ?? 600))),
      size: scope === 'metricLabel' ? 12 : 14,
      color:
        scope === 'metricLabel'
          ? normalizeHexColor(settings.globalHeaderColor, '#eef4ff')
          : normalizeHexColor(settings.globalTitleColor, '#eef4ff')
    };
  };
  const getTypographyRaw = (widget: WidgetInstance | undefined, scope: TypographyScope, field: TypographyField) =>
    widget?.options?.[typographyOptionKey[scope][field]];
  const isTypographyInherited = (
    widget: WidgetInstance | undefined,
    scope: TypographyScope,
    field: TypographyField
  ) => {
    const raw = getTypographyRaw(widget, scope, field);
    if (field === 'font') return typeof raw !== 'string' || !raw.trim();
    if (field === 'color') {
      return typeof raw !== 'string' || !/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(raw);
    }
    const numeric = Number(raw);
    return !Number.isFinite(numeric) || numeric <= 0;
  };
  const getTypographyDisplay = (
    widget: WidgetInstance | undefined,
    scope: TypographyScope,
    field: TypographyField
  ) => {
    const inherited = getTypographyInherited(scope);
    const raw = getTypographyRaw(widget, scope, field);
    if (isTypographyInherited(widget, scope, field)) {
      if (field === 'font') return `${inherited.font} [Global]`;
      if (field === 'color') return `${inherited.color} [Global]`;
      return `${Math.round(Number(inherited[field]))}px [Global]`;
    }
    if (field === 'font') return typeof raw === 'string' ? raw : inherited.font;
    if (field === 'color') return normalizeHexColor(raw, inherited.color);
    return `${Math.round(Number(raw ?? inherited[field]))}px`;
  };
  const getTypographyNumeric = (
    widget: WidgetInstance | undefined,
    scope: TypographyScope,
    field: 'size' | 'weight'
  ) => {
    const inherited = getTypographyInherited(scope)[field];
    const raw = Number(getTypographyRaw(widget, scope, field));
    return Number.isFinite(raw) && raw > 0 ? raw : inherited;
  };
  const getTypographyColor = (widget: WidgetInstance | undefined, scope: TypographyScope) => {
    const inherited = getTypographyInherited(scope).color;
    const raw = getTypographyRaw(widget, scope, 'color');
    return normalizeHexColor(raw, inherited);
  };
  const setTypographyField = (
    widget: WidgetInstance | undefined,
    scope: TypographyScope,
    field: TypographyField,
    value: string | number
  ) => {
    if (!widget) return;
    const key = typographyOptionKey[scope][field];
    updateWidget(widget.id, {
      options: {
        [key]: value
      }
    });
  };

  const toConfigSnapshot = (value: WidgetConfig) => JSON.stringify(value);
  const getSelectedExecutionNode = (widget: WidgetInstance | undefined): ExecutionNodeId => {
    const raw = typeof widget?.options?.executionNode === 'string' ? widget.options.executionNode : '';
    return executionNodes.some((node) => node.value === raw)
      ? (raw as ExecutionNodeId)
      : (executionNodes[0]?.value ?? 'node-1');
  };
  const getNodeSuggestedBaseUrl = (widget: WidgetInstance | undefined, nodeId?: ExecutionNodeId) => {
    const source = (widget?.source ?? '').trim();
    const port = defaultPortBySource[source];
    const node = executionNodes.find((entry) => entry.value === (nodeId ?? getSelectedExecutionNode(widget)));
    if (!node || !port) return '';
    return `http://${node.host}:${port}`;
  };
  const applyExecutionNodeToWidget = (widget: WidgetInstance | undefined, nodeId: ExecutionNodeId) => {
    if (!widget) return;
    const currentBaseUrl = typeof widget.options?.baseUrl === 'string' ? widget.options.baseUrl.trim() : '';
    const suggested = getNodeSuggestedBaseUrl(widget, nodeId);
    updateWidget(widget.id, {
      options: {
        executionNode: nodeId,
        healthServer: nodeId,
        ...(currentBaseUrl ? {} : suggested ? { baseUrl: suggested } : {})
      }
    });
  };
  const applySuggestedBaseUrl = (widget: WidgetInstance | undefined) => {
    if (!widget) return;
    const suggested = getNodeSuggestedBaseUrl(widget);
    if (!suggested) return;
    updateWidget(widget.id, { options: { baseUrl: suggested } });
  };

  const unique = (values: string[]) => Array.from(new Set(values));
  const normalizeHomeAssistantCustomMetrics = (metrics: HomeAssistantCustomMetric[]) =>
    metrics
      .map((metric) => ({
        state: metric.state.trim(),
        template: metric.template.trim(),
        label: metric.label.trim(),
        value: metric.value.trim()
      }))
      .slice(0, MAX_HOME_ASSISTANT_CUSTOM_METRICS);

  const extractHomeAssistantCustomMetricsFromWidget = (widget: WidgetInstance | undefined) => {
    if (!widget) return [] as HomeAssistantCustomMetric[];
    const fromArray = Array.isArray(widget.options?.customMetrics)
      ? widget.options.customMetrics
          .map((entry) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
            const value = entry as Record<string, unknown>;
            return {
              state: String(value.state ?? '').trim(),
              template: String(value.template ?? '').trim(),
              label: String(value.label ?? '').trim(),
              value: String(value.value ?? '').trim()
            } satisfies HomeAssistantCustomMetric;
          })
          .filter((entry): entry is HomeAssistantCustomMetric => Boolean(entry))
      : [];
    return normalizeHomeAssistantCustomMetrics(fromArray);
  };

  const buildHomeAssistantCustomMetricsDrafts = (widgets: WidgetInstance[]) =>
    Object.fromEntries(
      widgets
        .filter((widget) => widget.source === 'home-assistant' && typeof widget.id === 'string')
        .map((widget) => [widget.id, extractHomeAssistantCustomMetricsFromWidget(widget)])
    ) as Record<string, HomeAssistantCustomMetric[]>;

  const getHomeAssistantCustomMetrics = (widget: WidgetInstance | undefined) => {
    if (!widget?.id) return [] as HomeAssistantCustomMetric[];
    return (
      homeAssistantCustomMetricsDrafts[widget.id] ??
      extractHomeAssistantCustomMetricsFromWidget(widget)
    );
  };

  const applyHomeAssistantCustomMetricDrafts = (widgets: WidgetInstance[]) =>
    widgets.map((widget) => {
      if (!widget.id || widget.source !== 'home-assistant') return widget;
      const customMetrics = homeAssistantCustomMetricsDrafts[widget.id];
      if (!customMetrics) return widget;
      return {
        ...widget,
        options: {
          ...(widget.options ?? {}),
          customMetrics: normalizeHomeAssistantCustomMetrics(customMetrics)
        }
      };
    });

  const persistHomeAssistantCustomMetrics = (
    widgetId: string,
    metrics: HomeAssistantCustomMetric[]
  ) => {
    if (!widgetId) return;
    const cleaned = normalizeHomeAssistantCustomMetrics(metrics);
    homeAssistantCustomMetricsDrafts = {
      ...homeAssistantCustomMetricsDrafts,
      [widgetId]: cleaned
    };
  };

  const addHomeAssistantCustomMetric = (widgetId: string) => {
    const widget = config.widgets.find((item) => item.id === widgetId);
    if (!widget) return;
    const current = getHomeAssistantCustomMetrics(widget);
    if (current.length >= MAX_HOME_ASSISTANT_CUSTOM_METRICS) return;
    persistHomeAssistantCustomMetrics(widgetId, [
      ...current,
      {
        state: '',
        template: '',
        label: '',
        value: ''
      }
    ]);
  };

  const removeHomeAssistantCustomMetric = (widgetId: string, index: number) => {
    const widget = config.widgets.find((item) => item.id === widgetId);
    if (!widget) return;
    persistHomeAssistantCustomMetrics(
      widgetId,
      getHomeAssistantCustomMetrics(widget).filter((_, itemIndex) => itemIndex !== index)
    );
  };

  const updateHomeAssistantCustomMetricField = (
    widgetId: string,
    index: number,
    field: keyof HomeAssistantCustomMetric,
    value: string
  ) => {
    const widget = config.widgets.find((item) => item.id === widgetId);
    if (!widget) return;
    const next = [...getHomeAssistantCustomMetrics(widget)];
    if (!next[index]) return;
    next[index] = {
      ...next[index],
      [field]: value
    };
    if (field === 'state' && value.trim()) {
      next[index].template = '';
    }
    if (field === 'template' && value.trim()) {
      next[index].state = '';
    }
    persistHomeAssistantCustomMetrics(widgetId, next);
  };
  const applyDashboardTabs = (tabsInput: DashboardTab[], requestedDefaultTabId?: string) => {
    const normalized = normalizeEditorTabConfig(
      {
        widgets: config.widgets,
        settings: {
          ...settings,
          tabs: tabsInput
        }
      },
      requestedDefaultTabId
    );

    const nextSettings = {
      ...settings,
      ...normalized.settings
    };

    settings = nextSettings;
    config = {
      ...config,
      settings: nextSettings,
      widgets: normalized.widgets
    };
  };

	  const addDashboardTab = () => {
	    const tabs = dashboardTabs;
	    const baseName = `Tab ${tabs.length + 1}`;
	    const baseId = slugifyTabId(baseName);
	    const existingIds = new Set(tabs.map((tab) => tab.id));
	    let id = baseId;
	    let suffix = 2;
	    while (existingIds.has(id)) {
	      id = `${baseId}-${suffix}`;
	      suffix += 1;
	    }
	    applyDashboardTabs([...tabs, { id, name: baseName, icon: tabIconFallbackForName(baseName) }], id);
	  };

  const handleTabLaneWheel = (event: WheelEvent) => {
    if (!tabLaneEl) return;
    if (event.shiftKey || Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      tabLaneEl.scrollLeft += event.deltaY + event.deltaX;
      event.preventDefault();
    }
  };

  const handleTabLanePointerDown = (event: PointerEvent) => {
    if (!tabLaneEl || event.button !== 1) return;
    tabLaneMiddleDrag = true;
    tabLaneDragStartX = event.clientX;
    tabLaneDragStartLeft = tabLaneEl.scrollLeft;
    tabLaneEl.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleTabLanePointerMove = (event: PointerEvent) => {
    if (!tabLaneMiddleDrag || !tabLaneEl) return;
    const delta = event.clientX - tabLaneDragStartX;
    tabLaneEl.scrollLeft = tabLaneDragStartLeft - delta;
  };

  const handleTabLanePointerUp = (event: PointerEvent) => {
    if (!tabLaneMiddleDrag || !tabLaneEl) return;
    tabLaneMiddleDrag = false;
    if (tabLaneEl.hasPointerCapture(event.pointerId)) {
      tabLaneEl.releasePointerCapture(event.pointerId);
    }
  };

	  const renameDashboardTab = (tabId: string, nextName: string, nextIcon?: TabIconKey) => {
	    const trimmed = nextName.trim();
	    if (!trimmed) return;
	    const tabs = dashboardTabs.map((tab) =>
	      tab.id === tabId
	        ? {
	            ...tab,
	            name: trimmed,
	            icon:
	              nextIcon ?? normalizeTabIconKey(tab.icon) ?? tabIconFallbackForName(trimmed)
	          }
	        : tab
	    );
	    applyDashboardTabs(tabs, resolveDefaultDashboardTabId(tabs));
	  };

	  let showTabIdentityModal = false;
	  let tabIdentityTabId = '';
	  let tabIdentityName = '';
	  let tabIdentityIcon: TabIconKey = 'layoutGrid';

	  const openTabIdentityModal = (tabId: string) => {
	    const tab = dashboardTabs.find((entry) => entry.id === tabId);
	    if (!tab) return;
	    tabIdentityTabId = tabId;
	    tabIdentityName = tab.name;
	    tabIdentityIcon = normalizeTabIconKey(tab.icon) ?? tabIconFallbackForName(tab.name);
	    showTabIdentityModal = true;
	  };

	  const closeTabIdentityModal = () => {
	    showTabIdentityModal = false;
	    tabIdentityTabId = '';
	  };

	  const saveTabIdentityModal = (event: CustomEvent<{ name: string; icon: TabIconKey }>) => {
	    const tabId = tabIdentityTabId;
	    if (!tabId) return;
	    renameDashboardTab(tabId, event.detail.name, event.detail.icon);
	    closeTabIdentityModal();
	  };

  const duplicateDashboardTab = (tabId: string) => {
    const tabs = dashboardTabs;
    const tab = tabs.find((entry) => entry.id === tabId);
    if (!tab) return;

    const existingNames = new Set(tabs.map((t) => t.name.toLowerCase().trim()));
    const baseName = `${tab.name} Copy`.trim() || 'Tab Copy';
    let name = baseName;
    let nameSuffix = 2;
    while (existingNames.has(name.toLowerCase().trim())) {
      name = `${baseName} ${nameSuffix}`;
      nameSuffix += 1;
    }

    const baseId = slugifyTabId(name);
    const existingIds = new Set(tabs.map((t) => t.id));
    let id = baseId;
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    const tabIndex = tabs.findIndex((entry) => entry.id === tabId);
    const nextTabs = [...tabs];
	    nextTabs.splice(Math.max(0, tabIndex + 1), 0, {
	      id,
	      name,
	      icon: normalizeTabIconKey(tab.icon) ?? tabIconFallbackForName(tab.name)
	    });

    const fallbackTabIdForLegacy = resolveDefaultDashboardTabId(tabs, settings.defaultTabId);
    const resolveWidgetTabId = (widget: WidgetInstance) => {
      const currentTabId = typeof widget.options?.tabId === 'string' ? widget.options.tabId.trim() : '';
      return tabs.some((t) => t.id === currentTabId) ? currentTabId : fallbackTabIdForLegacy;
    };

    const cloneWidgetId = () =>
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const nextWidgets: WidgetInstance[] = [];
    for (const widget of config.widgets) {
      nextWidgets.push(widget);
      if (resolveWidgetTabId(widget) === tabId) {
        nextWidgets.push({
          ...widget,
          id: cloneWidgetId(),
          options: {
            ...(widget.options ?? {}),
            tabId: id
          }
        });
      }
    }

    const currentDefaultTabId = resolveDefaultDashboardTabId(tabs, settings.defaultTabId);
    const currentDefaultWebId = resolveDefaultDashboardTabId(tabs, settings.defaultTabIdWeb ?? currentDefaultTabId);
    const currentDefaultMobileId = resolveDefaultDashboardTabId(
      tabs,
      settings.defaultTabIdMobile ?? currentDefaultTabId
    );

    const nextDefaultTabId = resolveDefaultDashboardTabId(nextTabs, currentDefaultTabId);
    const nextDefaultWebId = resolveDefaultDashboardTabId(nextTabs, currentDefaultWebId);
    const nextDefaultMobileId = resolveDefaultDashboardTabId(nextTabs, currentDefaultMobileId);

    const nextSettings = {
      ...settings,
      tabs: nextTabs,
      defaultTabId: nextDefaultTabId,
      defaultTabIdWeb: nextDefaultWebId,
      defaultTabIdMobile: nextDefaultMobileId
    };

    settings = nextSettings;
    config = {
      ...config,
      settings: nextSettings,
      widgets: nextWidgets
    };
    widgetEditorTabId = id;
    selectedId =
      nextWidgets.find((widget) => (typeof widget.options?.tabId === 'string' ? widget.options.tabId.trim() : '') === id)?.id ??
      '';

	  };

  const requestDeleteTab = (tabId: string) => {
    const tabs = dashboardTabs;
    if (tabs.length <= 1) return;
    const tab = tabs.find((entry) => entry.id === tabId);
    if (!tab) return;
    pendingTabDeletion = tab;
    showTabDeleteModal = true;
  };

  const finalizeDeleteTab = (tabId: string) => {
    const tabs = dashboardTabs;
    if (tabs.length <= 1) return;
    const nextTabs = tabs.filter((tab) => tab.id !== tabId);
    if (nextTabs.length === 0) return;

    const currentDefaultTabId = resolveDefaultDashboardTabId(tabs, settings.defaultTabId);
    const currentDefaultWebId = resolveDefaultDashboardTabId(tabs, settings.defaultTabIdWeb ?? currentDefaultTabId);
    const currentDefaultMobileId = resolveDefaultDashboardTabId(
      tabs,
      settings.defaultTabIdMobile ?? currentDefaultTabId
    );
    const fallbackTabIdForLegacy = resolveDefaultDashboardTabId(tabs, settings.defaultTabId);
    const nextDefaultTabId =
      currentDefaultTabId === tabId
        ? nextTabs[0].id
        : resolveDefaultDashboardTabId(nextTabs, currentDefaultTabId);
    const nextDefaultWebId =
      currentDefaultWebId === tabId
        ? nextDefaultTabId
        : resolveDefaultDashboardTabId(nextTabs, currentDefaultWebId);
    const nextDefaultMobileId =
      currentDefaultMobileId === tabId
        ? nextDefaultTabId
        : resolveDefaultDashboardTabId(nextTabs, currentDefaultMobileId);

    const nextWidgets = config.widgets.filter((widget) => {
      const currentTabId =
        typeof widget.options?.tabId === 'string' ? widget.options.tabId.trim() : '';
      const widgetTabId = tabs.some((tab) => tab.id === currentTabId)
        ? currentTabId
        : fallbackTabIdForLegacy;
      return widgetTabId !== tabId;
    });

    const nextSettings = {
      ...settings,
      tabs: nextTabs,
      defaultTabId: nextDefaultTabId,
      defaultTabIdWeb: nextDefaultWebId,
      defaultTabIdMobile: nextDefaultMobileId
    };

    settings = nextSettings;
    config = {
      ...config,
      settings: nextSettings,
      widgets: nextWidgets
    };
    widgetEditorTabId = nextTabs[0].id;
    deletingTabId = '';
  };

  const confirmDeleteTab = () => {
    const tabId = pendingTabDeletion?.id;
    if (!tabId) {
      showTabDeleteModal = false;
      return;
    }
    showTabDeleteModal = false;
    pendingTabDeletion = null;
    deletingTabId = tabId;
    setTimeout(() => {
      finalizeDeleteTab(tabId);
    }, 220);
  };

  const cancelDeleteTab = () => {
    showTabDeleteModal = false;
    pendingTabDeletion = null;
  };

  const removeDashboardTab = (tabId: string) => {
    requestDeleteTab(tabId);
  };

  const resetTabDragState = () => {
    draggingTabId = '';
    dragOverTabId = '';
    dragOverTabPosition = 'before';
  };

  const handleTabDragStart = (tabId: string, event: DragEvent) => {
    draggingTabId = tabId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', tabId);
    }
  };

  const handleTabDragOver = (tabId: string, event: DragEvent) => {
    const sourceId = draggingTabId || event.dataTransfer?.getData('text/plain') || '';
    if (!sourceId || sourceId === tabId) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    const position =
      rect && rect.width > 0 && event.clientX - rect.left > rect.width / 2 ? 'after' : 'before';
    dragOverTabId = tabId;
    dragOverTabPosition = position;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  };

  const handleTabDrop = (tabId: string, event: DragEvent) => {
    event.preventDefault();
    const sourceId = draggingTabId || event.dataTransfer?.getData('text/plain') || '';
    const position =
      dragOverTabId === tabId ? dragOverTabPosition : ('before' as 'before' | 'after');
    resetTabDragState();
    if (!sourceId || sourceId === tabId) return;
    const nextTabs = reorderById(dashboardTabs, sourceId, tabId, position);
    if (nextTabs === dashboardTabs) return;
    applyDashboardTabs(nextTabs, resolveDefaultDashboardTabId(nextTabs, settings.defaultTabId));
  };

  const setDefaultDashboardTabWeb = (tabId: string) => {
    const tabs = dashboardTabs;
    if (!tabs.some((tab) => tab.id === tabId)) return;
    const nextSettings = { ...settings, defaultTabIdWeb: tabId, defaultTabId: tabId };
    settings = nextSettings;
    config = { ...config, settings: nextSettings };
  };

  const setDefaultDashboardTabMobile = (tabId: string) => {
    const tabs = dashboardTabs;
    if (!tabs.some((tab) => tab.id === tabId)) return;
    const defaultTabId = resolveDefaultDashboardTabId(tabs, settings.defaultTabIdWeb ?? settings.defaultTabId);
    const nextSettings = { ...settings, defaultTabIdMobile: tabId, defaultTabId };
    settings = nextSettings;
    config = { ...config, settings: nextSettings };
  };

  const getWidgetTabId = (widget: WidgetInstance | undefined) => {
    return resolveEditorWidgetTabId(widget, dashboardTabs, defaultDashboardTabId);
  };

  const normalizeMetricSelection = (
    raw: unknown,
    allowed: readonly string[],
    fallback: string[],
    max: number
  ) => {
    const fromArray = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
    const selected = unique(fromArray.filter((item) => allowed.includes(item)));
    if (selected.length > 0) {
      return selected.slice(0, max);
    }
    return unique(fallback.filter((item) => allowed.includes(item))).slice(0, max);
  };

  const getMonitorSystemMetricsByNode = (widget: WidgetInstance | undefined) => {
    if (!widget || !widget.options || typeof widget.options !== 'object') return {} as Record<string, string[]>;
    const raw = (widget.options as Record<string, unknown>).monitorSystemMetricsByNode;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {} as Record<string, string[]>;
    const entries = Object.entries(raw as Record<string, unknown>)
      .map(([nodeId, value]) => {
        const cleanNodeId = String(nodeId ?? '').trim();
        if (!cleanNodeId) return null;
        const metrics = Array.isArray(value)
          ? unique(
              value.filter(
                (item): item is string =>
                  typeof item === 'string' &&
                  (monitorSystemMetricOptions as readonly string[]).includes(item)
              )
            )
          : [];
        if (metrics.length === 0) return null;
        return [cleanNodeId, metrics] as const;
      })
      .filter((entry): entry is readonly [string, string[]] => Boolean(entry));
    return Object.fromEntries(entries) as Record<string, string[]>;
  };

  const getMonitorSystemMetrics = (
    widget: WidgetInstance | undefined,
    nodeId?: string,
    allowEmpty = false
  ) => {
    if (!widget) return allowEmpty ? [] : [...monitorSystemMetricOptions.slice(0, 4)];
    const cleanNodeId = String(nodeId ?? '').trim();
    if (cleanNodeId) {
      const byNode = getMonitorSystemMetricsByNode(widget);
      const scoped = byNode[cleanNodeId];
      if (Array.isArray(scoped) && scoped.length > 0) return scoped;
    }
    const selected = Array.isArray(widget.options?.monitorSystemMetrics)
      ? unique(
          widget.options.monitorSystemMetrics.filter(
            (item): item is string =>
              typeof item === 'string' &&
              (monitorSystemMetricOptions as readonly string[]).includes(item)
          )
        )
      : [];
    if (selected.length > 0) return selected;
    return allowEmpty ? [] : [...monitorSystemMetricOptions.slice(0, 4)];
  };

  const canUseActiveMemoryMetric = (widget: WidgetInstance | undefined, nodeId?: string) => {
    if (!widget || !nodeId) return false;
    const normalizedNodeId = nodeId.trim().toLowerCase();
    if (normalizedNodeId.includes('mac') || normalizedNodeId.includes('darwin')) {
      return true;
    }
    const nodeMeta = getMonitorSystemNodes(widget).find((node) => node.value === nodeId);
    const nodeMetaText = `${nodeMeta?.label ?? ''} ${nodeMeta?.host ?? ''}`.toLowerCase();
    if (nodeMetaText.includes('mac mini') || nodeMetaText.includes('darwin') || nodeMetaText.includes('macos')) {
      return true;
    }
    const payload =
      widget.data && typeof widget.data === 'object' && !Array.isArray(widget.data)
        ? (widget.data as Record<string, unknown>)
        : null;
    const hosts = Array.isArray(payload?.systemHosts)
      ? payload.systemHosts.filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry && typeof entry === 'object' && !Array.isArray(entry))
        )
      : [];
    const host = hosts.find((entry) => String(entry.id ?? '').trim() === nodeId);
    if (!host) return false;
    const platform = String(host.platform ?? host.os ?? '').trim().toLowerCase();
    if (platform.includes('darwin') || platform.includes('mac os') || platform.includes('macos')) {
      return true;
    }
    const hostMetrics = Array.isArray(host.metrics)
      ? host.metrics.filter(
          (entry): entry is Record<string, unknown> =>
            Boolean(entry && typeof entry === 'object' && !Array.isArray(entry))
        )
      : [];
    return hostMetrics.some((entry) => String(entry.key ?? '').trim() === 'activeMemory');
  };

  const getMonitorSystemMetricOptionsForNode = (
    widget: WidgetInstance | undefined,
    nodeId?: string
  ) => {
    const selected = getMonitorSystemMetrics(widget, nodeId, true);
    return monitorSystemMetricOptions.filter((key) => {
      if (key !== 'activeMemory') return true;
      return canUseActiveMemoryMetric(widget, nodeId) || selected.includes('activeMemory');
    });
  };

  const persistMonitorSystemMetrics = (
    widget: WidgetInstance | undefined,
    metrics: string[],
    nodeId?: string
  ) => {
    if (!widget) return;
    const cleaned = unique(
      metrics.filter((item) => (monitorSystemMetricOptions as readonly string[]).includes(item))
    );
    if (cleaned.length === 0) return;
    const cleanNodeId = String(nodeId ?? '').trim();
    if (!cleanNodeId) {
      updateWidget(widget.id, { options: { monitorSystemMetrics: cleaned } });
      return;
    }
    const byNode = {
      ...getMonitorSystemMetricsByNode(widget),
      [cleanNodeId]: cleaned
    };
    updateWidget(widget.id, { options: { monitorSystemMetricsByNode: byNode } });
  };

  const toggleMonitorSystemMetric = (
    widget: WidgetInstance | undefined,
    key: string,
    nodeId?: string
  ) => {
    if (!widget || !(monitorSystemMetricOptions as readonly string[]).includes(key)) return;
    if (key === 'activeMemory' && !canUseActiveMemoryMetric(widget, nodeId)) {
      const current = getMonitorSystemMetrics(widget, nodeId);
      if (!current.includes(key)) return;
    }
    const current = getMonitorSystemMetrics(widget, nodeId);
    if (current.includes(key)) {
      if (current.length <= 1) return;
      persistMonitorSystemMetrics(
        widget,
        current.filter((item) => item !== key),
        nodeId
      );
      return;
    }
    persistMonitorSystemMetrics(widget, [...current, key], nodeId);
  };

  const moveMonitorSystemMetric = (
    widget: WidgetInstance | undefined,
    key: string,
    direction: 'up' | 'down',
    nodeId?: string
  ) => {
    if (!widget) return;
    const current = getMonitorSystemMetrics(widget, nodeId);
    const index = current.indexOf(key);
    if (index < 0) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= current.length) return;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    persistMonitorSystemMetrics(widget, next, nodeId);
  };

  const handleMonitorMetricDragStart = (nodeId: string, key: string, event: DragEvent) => {
    draggingMonitorMetricNode = nodeId;
    draggingMonitorMetricKey = key;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${nodeId}:${key}`);
    }
  };

  const handleMonitorMetricDragOver = (nodeId: string, key: string, event: DragEvent) => {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    const position =
      rect && rect.height > 0 && event.clientY - rect.top > rect.height / 2 ? 'after' : 'before';
    dragOverMonitorMetricNode = nodeId;
    dragOverMonitorMetricKey = key;
    dragOverMonitorMetricPosition = position;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  };

  const handleMonitorMetricDrop = (
    widget: WidgetInstance | undefined,
    nodeId: string,
    targetKey: string,
    event: DragEvent
  ) => {
    event.preventDefault();
    const sourceToken = draggingMonitorMetricKey
      ? `${draggingMonitorMetricNode}:${draggingMonitorMetricKey}`
      : event.dataTransfer?.getData('text/plain') || '';
    const [sourceNodeId = '', sourceKey = ''] = sourceToken.split(':', 2);
    const position =
      dragOverMonitorMetricNode === nodeId && dragOverMonitorMetricKey === targetKey
        ? dragOverMonitorMetricPosition
        : 'before';
    draggingMonitorMetricNode = '';
    draggingMonitorMetricKey = '';
    dragOverMonitorMetricNode = '';
    dragOverMonitorMetricKey = '';
    dragOverMonitorMetricPosition = 'before';
    if (!widget || !sourceKey || sourceKey === targetKey || sourceNodeId !== nodeId) return;
    const current = getMonitorSystemMetrics(widget, nodeId, true);
    const sourceIndex = current.indexOf(sourceKey);
    const targetIndex = current.indexOf(targetKey);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = current.filter((key) => key !== sourceKey);
    const insertAtRaw = next.indexOf(targetKey);
    const insertAt = insertAtRaw < 0 ? next.length : insertAtRaw + (position === 'after' ? 1 : 0);
    next.splice(insertAt, 0, sourceKey);
    persistMonitorSystemMetrics(widget, next, nodeId);
  };

  const resetMonitorMetricDragState = () => {
    draggingMonitorMetricNode = '';
    draggingMonitorMetricKey = '';
    dragOverMonitorMetricNode = '';
    dragOverMonitorMetricKey = '';
    dragOverMonitorMetricPosition = 'before';
  };

  const getWidgetMetrics = (
    widget: WidgetInstance | undefined,
    allowed: readonly string[],
    fallback: string[],
    max: number,
    allowEmpty = false
  ) => {
    const effectiveMax = (widget?.kind as string) === 'stat' ? Math.max(allowed.length, max) : max;
    if (!widget) return allowEmpty ? [] : fallback.slice(0, effectiveMax);
    if (Array.isArray(widget.options?.metrics)) {
      const selected = unique(
        widget.options.metrics.filter((item): item is string => typeof item === 'string')
      )
        .filter((item) => allowed.includes(item))
        .slice(0, effectiveMax);
      if (selected.length > 0) return selected;
      return allowEmpty ? [] : normalizeMetricSelection([], allowed, fallback, effectiveMax);
    }
    const legacyMetric = typeof widget.options?.metric === 'string' ? [widget.options.metric] : [];
    return normalizeMetricSelection(legacyMetric, allowed, fallback, effectiveMax);
  };

  const getHomeAssistantCustomMetricKeys = (widget: WidgetInstance | undefined) =>
    getHomeAssistantCustomMetrics(widget).map((_, index) => `custom-${index + 1}`);

  const getHomeAssistantAllowedMetricKeys = (widget: WidgetInstance | undefined) =>
    unique([...homeAssistantMetricOptions, ...getHomeAssistantCustomMetricKeys(widget)]);

  const getHomeAssistantMetricOrder = (widget: WidgetInstance | undefined) => {
    if (!widget) return [] as string[];
    const allowed = getHomeAssistantAllowedMetricKeys(widget);
    const configured = Array.isArray(widget.options?.metrics)
      ? unique(
          widget.options.metrics
            .filter((item): item is string => typeof item === 'string')
            .filter((item) => allowed.includes(item))
        )
      : [];
    const customKeys = getHomeAssistantCustomMetricKeys(widget);

    if (configured.length > 0) {
      const withCustom = [...configured];
      customKeys.forEach((key) => {
        if (!withCustom.includes(key)) withCustom.push(key);
      });
      return withCustom;
    }

    const builtin = getWidgetMetrics(
      widget,
      homeAssistantMetricOptions,
      ['people_home', 'lights_on', 'switches_on'],
      homeAssistantMetricOptions.length,
      true
    );
    return unique([...builtin, ...customKeys]).filter((item) => allowed.includes(item));
  };

  const getMetricGridMetricConfig = (widget: WidgetInstance | undefined) => {
    if (!widget || widget.kind !== 'stat') return null;
    if (widget.source === 'technitium') {
      return {
        allowed: technitiumMetricOptions,
        fallback: ['totalQueries', 'blockedPct', 'latency'],
        max: technitiumMetricOptions.length,
        allowEmpty: false
      };
    }
    if (widget.source === 'seerr') {
      return {
        allowed: seerrMetricOptions,
        fallback: ['pending', 'approved', 'available'],
        max: seerrMetricOptions.length,
        allowEmpty: false
      };
    }
    if (widget.source === 'radarr') {
      return {
        allowed: radarrMetricOptions,
        fallback: ['wanted', 'missing', 'queued'],
        max: radarrMetricOptions.length,
        allowEmpty: false
      };
    }
    if (widget.source === 'readarr') {
      return {
        allowed: readarrMetricOptions,
        fallback: ['wanted', 'queued', 'books'],
        max: readarrMetricOptions.length,
        allowEmpty: false
      };
    }
    if (widget.source === 'sonarr') {
      return {
        allowed: sonarrMetricOptions,
        fallback: ['wanted', 'queued', 'series'],
        max: sonarrMetricOptions.length,
        allowEmpty: false
      };
    }
    if (widget.source === 'audiobookshelf') {
      return {
        allowed: audiobookshelfMetricOptions,
        fallback: ['podcasts', 'podcastsDuration', 'books', 'booksDuration'],
        max: audiobookshelfMetricOptions.length,
        allowEmpty: false
      };
    }
    if (widget.source === 'komodo' || widget.source === 'docker') {
      return {
        allowed: komodoMetricOptions,
        fallback: ['summary_servers', 'summary_stacks', 'summary_containers'],
        max: komodoMetricOptions.length,
        allowEmpty: false
      };
    }
    if (widget.source === 'prowlarr') {
      return {
        allowed: prowlarrMetricOptions,
        fallback: ['numberOfGrabs', 'numberOfQueries', 'numberOfFailGrabs', 'numberOfFailQueries'],
        max: prowlarrMetricOptions.length,
        allowEmpty: false
      };
    }
    if (widget.source === 'profilarr') {
      return {
        allowed: profilarrMetricOptions,
        fallback: ['lastRepoSync', 'lastCommit', 'syncedProfiles'],
        max: profilarrMetricOptions.length,
        allowEmpty: false
      };
    }
    if (widget.source === 'sabnzbd') {
      return {
        allowed: sabnzbdMetricOptions,
        fallback: ['rate', 'queue', 'timeleft'],
        max: sabnzbdMetricOptions.length,
        allowEmpty: false
      };
    }
    if (widget.source === 'qbittorrent') {
      return {
        allowed: qbittorrentMetricOptions,
        fallback: ['leech', 'download', 'seed', 'upload'],
        max: qbittorrentMetricOptions.length,
        allowEmpty: false
      };
    }
    if (widget.source === 'scrutiny') {
      return {
        allowed: scrutinyMetricOptions,
        fallback: ['passed', 'failed', 'unknown'],
        max: scrutinyMetricOptions.length,
        allowEmpty: false
      };
    }
    if (widget.source === 'tandoor') {
      return {
        allowed: tandoorMetricOptions,
        fallback: ['users', 'recipes', 'keywords'],
        max: tandoorMetricOptions.length,
        allowEmpty: false
      };
    }
    if (widget.source === 'speedtest-tracker') {
      return {
        allowed: speedtestTrackerMetricOptions,
        fallback: ['download', 'upload', 'ping'],
        max: speedtestTrackerMetricOptions.length,
        allowEmpty: false
      };
    }
    if (widget.source === 'home-assistant') {
      const allowed = getHomeAssistantAllowedMetricKeys(widget);
      const fallback = getHomeAssistantMetricOrder(widget);
      return {
        allowed,
        fallback,
        max: allowed.length,
        allowEmpty: true
      };
    }
    if (widget.source === 'plex') {
      return {
        allowed: plexMetricOptions,
        fallback: ['streams', 'albums', 'movies', 'tv'],
        max: plexMetricOptions.length,
        allowEmpty: false
      };
    }
    return null;
  };

  const getHomeAssistantMetricDisplayLabel = (widget: WidgetInstance | undefined, key: string) => {
    const customMatch = /^custom-(\d+)$/.exec(key);
    if (customMatch) {
      const index = Number(customMatch[1]) - 1;
      const customMetric = getHomeAssistantCustomMetrics(widget)[index];
      if (customMetric) {
        return (
          customMetric.label.trim() ||
          customMetric.state.trim() ||
          customMetric.template.trim() ||
          `Custom ${index + 1}`
        );
      }
      return `Custom ${customMatch[1]}`;
    }
    return metricLabels[key] ?? key;
  };

  const supportsMetricBoxes = (widget: WidgetInstance | undefined) => {
    if (!widget) return false;
    if (widget.kind === 'speedtest') return false;
    if (widget.kind === 'stat') return true;
    if (widget.source === 'technitium') return true;
    if (widget.source === 'seerr-requests') return true;
    if (
      widget.source === 'seerr' ||
      widget.source === 'radarr' ||
      widget.source === 'readarr' ||
      widget.source === 'sonarr' ||
      widget.source === 'audiobookshelf' ||
      widget.source === 'sabnzbd' ||
      widget.source === 'qbittorrent' ||
      widget.source === 'home-assistant' ||
      widget.source === 'scrutiny' ||
      widget.source === 'tandoor' ||
      widget.source === 'speedtest-tracker' ||
      widget.source === 'plex' ||
      widget.source === 'profilarr'
    ) {
      return true;
    }
    if ((widget.kind === 'plex' || widget.kind === 'history') && widget.options?.subtype === 'now-playing') {
      return true;
    }
    return false;
  };

  const deriveHomeAssistantPreviewData = (
    widget: WidgetInstance,
    liveData: unknown,
    customMetricDrafts?: HomeAssistantCustomMetric[]
  ) => {
    const sourceData =
      liveData && typeof liveData === 'object' && !Array.isArray(liveData)
        ? (liveData as Record<string, unknown>)
        : widget.data && typeof widget.data === 'object' && !Array.isArray(widget.data)
          ? (widget.data as Record<string, unknown>)
          : {};

    const sourceMetrics = Array.isArray(sourceData.metrics)
      ? sourceData.metrics.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      : [];

    const metricsByKey = new Map<string, { key: string; value: number | string; label: string; unit?: string }>();
    sourceMetrics.forEach((metric) => {
      const value = metric as Record<string, unknown>;
      const key = typeof value.key === 'string' ? value.key : '';
      if (!key) return;
      const metricValue =
        typeof value.value === 'number' || typeof value.value === 'string' ? value.value : '—';
      const metricLabel =
        typeof value.label === 'string' && value.label.trim()
          ? value.label
          : metricLabels[key] ?? key;
      metricsByKey.set(key, {
        key,
        value: metricValue,
        label: metricLabel,
        unit: typeof value.unit === 'string' ? value.unit : undefined
      });
    });

    const drafts = customMetricDrafts ?? getHomeAssistantCustomMetrics(widget);
    const customLabelByKey = new Map<string, string>();
    drafts.forEach((metric, index) => {
      customLabelByKey.set(
        `custom-${index + 1}`,
        metric.label.trim() || metric.state.trim() || metric.template.trim() || `Custom ${index + 1}`
      );
    });

    const metrics = getHomeAssistantMetricOrder(widget).map((key) => {
      const fromLive = metricsByKey.get(key);
      if (fromLive) return fromLive;
      const fallbackLabel = customLabelByKey.get(key) ?? metricLabels[key] ?? key;
      return {
        key,
        value: '—',
        label: fallbackLabel
      };
    });
    const firstMetric = metrics[0];

    return {
      ...sourceData,
      metrics,
      value: firstMetric?.value ?? 0,
      label: firstMetric?.label ?? 'Current',
      unit: firstMetric?.unit
    };
  };

  const deriveMonitorPreviewData = (widget: WidgetInstance, liveData: unknown) => {
    const sourceData =
      liveData && typeof liveData === 'object' && !Array.isArray(liveData)
        ? (liveData as Record<string, unknown>)
        : widget.data && typeof widget.data === 'object' && !Array.isArray(widget.data)
          ? (widget.data as Record<string, unknown>)
          : {};

    const liveItems = Array.isArray(sourceData.items)
      ? sourceData.items.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      : [];

    const normalizeMonitorIcon = (icon: string, name: string) => {
      const trimmed = icon.trim();
      if (!trimmed) return getDashboardIconUrlBySlug(name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      if (/^https?:\/\//i.test(trimmed)) return trimmed;
      return getDashboardIconUrlBySlug(trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    };

    const byKey = new Map<string, Record<string, unknown>>();
    const byName = new Map<string, Record<string, unknown>>();
    liveItems.forEach((item) => {
      const value = item as Record<string, unknown>;
      const name = String(value.name ?? '').trim().toLowerCase();
      const url = String(value.url ?? '').trim().toLowerCase();
      const key = `${name}|${url}`;
      if (name || url) byKey.set(key, value);
      if (name && !byName.has(name)) byName.set(name, value);
    });

    if (getMonitorMode(widget) === 'system') {
      const configuredNodes = getMonitorSystemNodes(widget);
      const liveSystemHosts = Array.isArray(sourceData.systemHosts)
        ? sourceData.systemHosts.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
        : [];
      const byNode = new Map<string, Record<string, unknown>>();
      liveSystemHosts.forEach((entry) => {
        const host = entry as Record<string, unknown>;
        const id = String(host.id ?? '').trim();
        if (id) byNode.set(id, host);
      });
      const sampleOffsets: Record<string, number> = {
        cpu: 0,
        memory: 8,
        activeMemory: 6,
        disk: 14,
        temperature: -12,
        network: -18,
        diskio: -8,
        load1: -16,
        load5: -10,
        load15: -4
      };
      const systemHosts = configuredNodes.map((node, index) => {
        const live = byNode.get(node.value);
        const metrics = Array.isArray(live?.metrics)
          ? (live.metrics as Array<Record<string, unknown>>).map((metric) => {
              const value = Number(metric.value ?? 0);
              const actual = Number(metric.actual ?? metric.value ?? 0);
              const max = Number(metric.max ?? 100);
              const percentRaw = Number(metric.percent);
              const percent = Number.isFinite(percentRaw)
                ? percentRaw
                : Number.isFinite(max) && max > 0
                  ? (value / max) * 100
                  : value;
              return {
                key: String(metric.key ?? ''),
                label: String(metric.label ?? ''),
                value,
                actual,
                percent,
                unit: String(metric.unit ?? '%'),
                max
              };
            })
          : [];

        const fallbackBase = index === 0 ? 42 : 57;
        const fallbackMetrics = monitorSystemMetricOptions.map((key) => ({
          key,
          label: metricLabels[key] ?? key,
          value:
            key === 'temperature'
              ? fallbackBase / 2 + 26
              : key === 'activeMemory'
                ? fallbackBase + 6
              : key === 'network'
                ? fallbackBase / 3 + 12
                  : key === 'diskio'
                    ? fallbackBase / 4 + 18
                    : key === 'load1'
                      ? fallbackBase / 10 + 1.2
                    : key === 'load5'
                      ? fallbackBase / 10 + 0.8
                      : key === 'load15'
                        ? fallbackBase / 10 + 0.6
                        : fallbackBase + (sampleOffsets[key] ?? 0),
          actual:
            key === 'temperature'
              ? fallbackBase / 2 + 26
              : key === 'activeMemory'
                ? fallbackBase + 6
              : key === 'network'
                ? fallbackBase / 3 + 12
                  : key === 'diskio'
                    ? fallbackBase / 4 + 18
                    : key === 'load1'
                      ? fallbackBase / 10 + 1.2
                    : key === 'load5'
                      ? fallbackBase / 10 + 0.8
                      : key === 'load15'
                        ? fallbackBase / 10 + 0.6
                        : fallbackBase + (sampleOffsets[key] ?? 0),
          percent:
            key === 'temperature'
              ? (fallbackBase / 2 + 26) / 1.2
              : key === 'activeMemory'
                ? fallbackBase + 6
              : key === 'network'
                ? ((fallbackBase / 3 + 12) / 125) * 100
                : key === 'diskio'
                  ? ((fallbackBase / 4 + 18) / 500) * 100
                  : key === 'load1'
                    ? ((fallbackBase / 10 + 1.2) / 8) * 100
                  : key === 'load5'
                    ? ((fallbackBase / 10 + 0.8) / 8) * 100
                      : key === 'load15'
                        ? ((fallbackBase / 10 + 0.6) / 8) * 100
                        : fallbackBase + (sampleOffsets[key] ?? 0),
          unit:
            key === 'temperature'
              ? 'C'
              : key === 'activeMemory'
                ? '%'
              : key === 'network' || key === 'diskio'
                ? 'MB/s'
                : key === 'load1' || key === 'load5' || key === 'load15'
                  ? ''
                  : '%',
          max:
            key === 'temperature'
              ? 120
              : key === 'network'
                ? 125
              : key === 'diskio'
                ? 500
                : key === 'load1' || key === 'load5' || key === 'load15'
                  ? 8
                  : 100
        }));
        const orderedMetricKeys = getMonitorSystemMetrics(widget, node.value, true);
        const metricByKey = new Map<string, Record<string, unknown>>();
        (metrics.length > 0 ? metrics : fallbackMetrics).forEach((entry) => {
          if (entry.key) metricByKey.set(String(entry.key), entry as Record<string, unknown>);
        });
        const orderedMetrics = (orderedMetricKeys.length > 0
          ? orderedMetricKeys
          : [...monitorSystemMetricOptions.slice(0, 4)]
        )
          .map((key) => metricByKey.get(key))
          .filter((entry): entry is Record<string, unknown> => Boolean(entry));
        return {
          id: node.value,
          label: node.label,
          host: node.host,
          uptimeText: String(live?.uptimeText ?? (index === 0 ? '3d 12h' : '12d 5h')),
          status: String(live?.status ?? 'ok'),
          metrics: orderedMetrics
        };
      });
      return {
        ...sourceData,
        mode: 'system',
        systemHosts
      };
    }

    const targets = getMonitorTargets(widget);
    if (targets.length === 0) {
      return sourceData;
    }

    const items = targets.map((target) => {
      const name = target.name.trim();
      const url = target.url.trim();
      const key = `${name.toLowerCase()}|${url.toLowerCase()}`;
      const fallback = byKey.get(key) ?? byName.get(name.toLowerCase());
      const status = String(fallback?.status ?? 'unknown');
      const statusText =
        typeof fallback?.statusText === 'string' && fallback.statusText.trim()
          ? fallback.statusText
          : '--';
      const latencyMs =
        typeof fallback?.latencyMs === 'number' && Number.isFinite(fallback.latencyMs)
          ? fallback.latencyMs
          : undefined;

      return {
        name,
        url: url || undefined,
        icon: normalizeMonitorIcon(target.icon, name),
        status: status === 'ok' || status === 'warn' || status === 'down' ? status : 'unknown',
        statusText,
        latencyMs
      };
    });

    return {
      ...sourceData,
      mode: 'targets',
      items
    };
  };

  const toggleWidgetMetric = (
    widget: WidgetInstance | undefined,
    metric: string,
    allowed: readonly string[],
    fallback: string[],
    max: number,
    allowEmpty = false
  ) => {
    if (!widget || !allowed.includes(metric)) return;
    const effectiveMax = widget.kind === 'stat' ? Math.max(allowed.length, max) : max;
    const current = getWidgetMetrics(widget, allowed, fallback, max, allowEmpty);
    let next: string[] = current;

    if (current.includes(metric)) {
      if (current.length <= 1 && !allowEmpty) return;
      next = current.filter((item) => item !== metric);
    } else {
      if (current.length >= effectiveMax) return;
      next = [...current, metric];
    }

    updateWidget(selectedId, { options: { metrics: next, metric: next[0] } });
  };

  const moveWidgetMetric = (
    widget: WidgetInstance | undefined,
    metric: string,
    direction: 'up' | 'down',
    allowed: readonly string[],
    fallback: string[],
    max: number,
    allowEmpty = false
  ) => {
    if (!widget) return;
    const current = getWidgetMetrics(widget, allowed, fallback, max, allowEmpty);
    const index = current.indexOf(metric);
    if (index === -1) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= current.length) return;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    updateWidget(selectedId, { options: { metrics: next, metric: next[0] } });
  };

  const getMetricLabelOverride = (widget: WidgetInstance | undefined, key: string) => {
    if (!widget || !key) return '';
    const raw = widget.options?.metricLabelOverrides;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
    const value = (raw as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
  };

  const setMetricLabelOverride = (
    widget: WidgetInstance | undefined,
    key: string,
    value: string
  ) => {
    if (!widget || !key) return;
    const current =
      widget.options?.metricLabelOverrides &&
      typeof widget.options.metricLabelOverrides === 'object' &&
      !Array.isArray(widget.options.metricLabelOverrides)
        ? { ...(widget.options.metricLabelOverrides as Record<string, string>) }
        : {};
    const trimmed = value.trim();
    if (trimmed) current[key] = trimmed;
    else delete current[key];
    updateWidget(widget.id, { options: { metricLabelOverrides: current } });
  };

  const getKomodoIconOverrides = (widget: WidgetInstance | undefined) => {
    if (!widget) return {} as Record<string, string>;
    const raw = widget.options?.iconOverrides;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).filter(
        ([name, value]) => typeof name === 'string' && typeof value === 'string'
      )
    );
  };

  const updateKomodoIconOverride = (
    widget: WidgetInstance | undefined,
    stackName: string,
    url: string
  ) => {
    if (!widget || !stackName.trim()) return;
    const current = getKomodoIconOverrides(widget);
    const trimmed = url.trim();
    if (trimmed) {
      current[stackName] = trimmed;
    } else {
      delete current[stackName];
    }
    updateWidget(selectedId, { options: { iconOverrides: current } });
  };
  const addKomodoIconOverride = (widget: WidgetInstance | undefined) => {
    if (!widget) return;
    const stackName = komodoIconDraftName.trim();
    const iconUrl = komodoIconDraftUrl.trim();
    if (!stackName || !iconUrl) return;
    updateKomodoIconOverride(widget, stackName, iconUrl);
    komodoIconDraftName = '';
    komodoIconDraftUrl = '';
  };

  const getPreviewServiceItems = (widget: WidgetInstance | undefined) => {
    if (!widget) return [] as ServicePreviewItem[];
    const source = previewWidget?.id === widget.id ? previewWidget : widget;
    const data = source?.data as { items?: ServicePreviewItem[] } | undefined;
    if (!Array.isArray(data?.items)) return [] as ServicePreviewItem[];
    return data.items.filter(
      (item): item is ServicePreviewItem => typeof item?.name === 'string'
    );
  };
  $: if (selectedId !== komodoIconDraftWidgetId) {
    komodoIconDraftWidgetId = selectedId;
    komodoIconDraftName = '';
    komodoIconDraftUrl = '';
  }

  const getMonitorTargets = (widget: WidgetInstance | undefined) =>
    getMonitorTargetsForWidget(widget);

  const getMonitorSystemNodes = (widget: WidgetInstance | undefined) =>
    getMonitorSystemNodesForWidget(widget, executionNodes);

  const addMonitorSystemNode = (widget: WidgetInstance | undefined) => {
    if (!widget) return;
    const current = getMonitorSystemNodes(widget);
    const candidate =
      executionNodes.find((node) => !current.some((entry) => entry.value === node.value)) ?? executionNodes[0];
    if (!candidate) return;
    const existingIds = new Set(current.map((entry) => entry.value));
    let nodeId = candidate.value;
    if (existingIds.has(nodeId)) {
      let suffix = 2;
      while (existingIds.has(`${candidate.value}-${suffix}`)) suffix += 1;
      nodeId = `${candidate.value}-${suffix}`;
    }
    const nextNode: MonitorSystemNode = {
      value: nodeId,
      label: candidate.label,
      host: candidate.host,
      port: 61208,
      provider: 'glances',
      username: '',
      password: '',
      baseUrl: buildMonitorSystemNodeBaseUrl(candidate.host, 61208)
    };
    updateWidget(widget.id, { options: { monitorSystemNodes: [...current, nextNode] } });
  };

  const removeMonitorSystemNode = (widget: WidgetInstance | undefined, nodeValue: string) => {
    if (!widget) return;
    const current = getMonitorSystemNodes(widget);
    const next = current.filter((entry) => entry.value !== nodeValue);
    updateWidget(widget.id, { options: { monitorSystemNodes: next } });
  };

  const updateMonitorSystemNodeField = (
    widget: WidgetInstance | undefined,
    nodeValue: string,
    field: 'label' | 'provider' | 'host' | 'port' | 'username' | 'password',
    value: string | number
  ) => {
    if (!widget) return;
    const current = getMonitorSystemNodes(widget);
    const next = current.map((entry) => {
      if (entry.value !== nodeValue) return entry;
      if (field === 'port') {
        const numeric = Number(value);
        const port = Number.isFinite(numeric) ? Math.min(65535, Math.max(1, Math.round(numeric))) : 61208;
        return { ...entry, port, baseUrl: buildMonitorSystemNodeBaseUrl(entry.host, port) };
      }
      if (field === 'host') {
        const host = String(value ?? '').trim();
        const port = Number(entry.port ?? 61208);
        return { ...entry, host, baseUrl: buildMonitorSystemNodeBaseUrl(host, port) };
      }
      if (field === 'provider') {
        return { ...entry, provider: String(value ?? '').trim().toLowerCase() || 'glances' };
      }
      return { ...entry, [field]: String(value ?? '').trim() };
    });
    updateWidget(widget.id, { options: { monitorSystemNodes: next } });
  };

  const toggleMonitorSystemNode = (
    widget: WidgetInstance | undefined,
    node: ExecutionNode,
    enabled: boolean
  ) => {
    if (!widget) return;
    const current = getMonitorSystemNodes(widget);
    const next = enabled
      ? current.some((entry) => entry.value === node.value)
        ? current
        : [
            ...current,
            {
              value: node.value,
              label: node.label,
              host: node.host,
              port: 61208,
              baseUrl: `http://${node.host}:61208`
            }
          ]
      : current.filter((entry) => entry.value !== node.value);
    updateWidget(widget.id, { options: { monitorSystemNodes: next } });
  };

  const updateMonitorSystemNodeBaseUrl = (
    widget: WidgetInstance | undefined,
    nodeValue: string,
    nextBaseUrl: string
  ) => {
    if (!widget) return;
    const normalized = nextBaseUrl.trim();
    const current = getMonitorSystemNodes(widget);
    const next = current.map((entry) =>
      entry.value === nodeValue ? { ...entry, baseUrl: normalized } : entry
    );
    updateWidget(widget.id, { options: { monitorSystemNodes: next } });
  };
  const moveMonitorSystemNode = (
    widget: WidgetInstance | undefined,
    nodeValue: string,
    direction: 'up' | 'down'
  ) => {
    if (!widget) return;
    const current = getMonitorSystemNodes(widget);
    const index = current.findIndex((entry) => entry.value === nodeValue);
    if (index < 0) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= current.length) return;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    updateWidget(widget.id, { options: { monitorSystemNodes: next } });
  };

  const persistMonitorTargets = (
    widget: WidgetInstance | undefined,
    targets: MonitorEditorTarget[]
  ) => {
    if (!widget) return;
    const cleaned = sanitizeMonitorTargets(targets);
    const targetsText = serializeMonitorTargetsText(cleaned);

    updateWidget(selectedId, {
      options: {
        targets: cleaned,
        targetsText
      }
    });
    clearMonitorTargetTestsForWidget(widget.id);
  };

  const runMonitorTargetTest = async (
    widget: WidgetInstance | undefined,
    index: number,
    target: MonitorEditorTarget
  ) => {
    if (!widget) return;
    const key = getMonitorTargetTestKey(widget.id, index);
    const url = target.url.trim();
    if (!url) {
      monitorTargetTestStates = {
        ...monitorTargetTestStates,
        [key]: { status: 'error', message: 'URL required' }
      };
      return;
    }
    monitorTargetTestStates = {
      ...monitorTargetTestStates,
      [key]: { status: 'loading', message: 'Testing...' }
    };
    try {
      const response = await fetch('/api/monitor-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: target.name,
          url,
          icon: target.icon,
          method: target.method,
          dockerServer: target.dockerServer,
          dockerContainer: target.dockerContainer
        })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };
      const ok = response.ok && payload.ok === true;
      monitorTargetTestStates = {
        ...monitorTargetTestStates,
        [key]: {
          status: ok ? 'ok' : 'error',
          message: payload.message?.trim() || (ok ? 'Reachable' : 'Failed')
        }
      };
    } catch {
      monitorTargetTestStates = {
        ...monitorTargetTestStates,
        [key]: { status: 'error', message: 'Request failed' }
      };
    }
  };

  const runWidgetHealthTest = async (widget: WidgetInstance | undefined) => {
    if (!widget) return;
    const widgetId = widget.id;
    widgetHealthTestStates = {
      ...widgetHealthTestStates,
      [widgetId]: { status: 'loading', message: 'Testing...' }
    };

    try {
      const response = await fetch('/api/health-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          healthServer: widget.options?.healthServer ?? '',
          healthContainer: widget.options?.healthContainer ?? '',
          baseUrl: widget.options?.baseUrl ?? '',
          source: widget.source ?? ''
        })
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };
      const ok = response.ok && payload.ok === true;
      widgetHealthTestStates = {
        ...widgetHealthTestStates,
        [widgetId]: {
          status: ok ? 'ok' : 'error',
          message: payload.message?.trim() || (ok ? 'Healthy' : 'Failed')
        }
      };
    } catch {
      widgetHealthTestStates = {
        ...widgetHealthTestStates,
        [widgetId]: { status: 'error', message: 'Request failed' }
      };
    }
  };

  const addMonitorTarget = (widget: WidgetInstance | undefined) => {
    const next = [
      ...getMonitorTargets(widget),
      {
        name: '',
        url: '',
        icon: '',
        method: 'GET' as const,
        dockerServer: '',
        dockerContainer: ''
      }
    ];
    persistMonitorTargets(widget, next);
  };

  const removeMonitorTarget = (widget: WidgetInstance | undefined, index: number) => {
    const next = getMonitorTargets(widget).filter((_, itemIndex) => itemIndex !== index);
    persistMonitorTargets(widget, next);
  };

  const updateMonitorTargetField = (
    widget: WidgetInstance | undefined,
    index: number,
    field: keyof MonitorEditorTarget,
    value: string
  ) => {
    const next = getMonitorTargets(widget);
    if (!next[index]) return;
    next[index] = {
      ...next[index],
      [field]: field === 'method' ? normalizeMonitorMethod(value) : value
    } as MonitorEditorTarget;
    persistMonitorTargets(widget, next);
  };

  const fetchConfig = async () => {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to load config (${res.status})`);
    }
    const payload = (await res.json()) as WidgetConfig;
    return {
      ...payload,
      widgets: (payload.widgets ?? []).map((widget) =>
        normalizeWidgetSource({
          ...widget,
          kind: widget.kind === 'history' ? 'plex' : widget.kind
        })
      )
    } as WidgetConfig;
  };

  const saveConfig = async (): Promise<boolean> => {
    if (errorTimer) {
      clearTimeout(errorTimer);
      errorTimer = null;
    }
    showError = false;
    saving = true;
    error = '';
    try {
      let saved: WidgetConfig | null = null;
      let snapshotAtSaveStart = '';
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const configToSave: WidgetConfig = {
          ...config,
          widgets: applyHomeAssistantCustomMetricDrafts(config.widgets ?? [])
        };
        snapshotAtSaveStart = toConfigSnapshot(configToSave);
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(configToSave)
        });
        if (!res.ok) {
          throw new Error(`Failed to save config (${res.status})`);
        }
        saved = (await res.json()) as WidgetConfig;
        const hasNewerLocalDraft = toConfigSnapshot(config) !== snapshotAtSaveStart;
        if (!hasNewerLocalDraft) break;
        // Save once more with the newest local draft instead of forcing the user to click again.
        if (attempt === 1) return false;
      }
      if (!saved) return false;
      const normalizedConfig = normalizeEditorTabConfig(saved);
      const widgetsWithTab = normalizedConfig.widgets.map((widget) =>
        normalizeWidgetSource(widget)
      );
      config = {
        ...saved,
        widgets: widgetsWithTab,
        settings: normalizedConfig.settings
      };
      savedSnapshot = toConfigSnapshot(config);
      hasDraftChanges = false;
      homeAssistantCustomMetricsDrafts = buildHomeAssistantCustomMetricsDrafts(widgetsWithTab);
      settings = normalizeDashboardSettings(config.settings, settings);
      error = '';
      if (config.widgets.length > 0 && !config.widgets.some((widget) => widget.id === selectedId)) {
        selectedId = config.widgets[0].id;
      }
      if (stageSavePulseTimer) clearTimeout(stageSavePulseTimer);
      stageSavePulse = true;
      stageSavePulseTimer = setTimeout(() => {
        stageSavePulse = false;
        stageSavePulseTimer = null;
      }, 700);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.toLowerCase().includes('fetch')) {
        showError = false;
        error = '';
        return false;
      }
      error = message;
      showError = true;
      errorTimer = setTimeout(() => {
        showError = false;
        errorTimer = null;
      }, 3000);
      return false;
    } finally {
      saving = false;
    }
  };

  const selectWidget = (id: string) => {
    const widget = config.widgets.find((entry) => entry.id === id);
    if (widget) {
      widgetEditorTabId = getWidgetTabId(widget);
    }
    selectedId = id;
  };

  const openAddWidgetWizard = () => {
    pendingWidgetKind = 'stat';
    pendingWidgetTitle = 'Metric Grids';
    pendingWidgetSource = '';
    pendingWidgetPresetOptions = {};
    addWidgetWizardStep = 'style';
    showAddWidgetWizard = true;
  };

  const closeAddWidgetWizard = () => {
    showAddWidgetWizard = false;
    addWidgetWizardStep = 'style';
  };

  const selectWidgetStyleForWizard = (option: WidgetStyleOption) => {
    pendingWidgetKind = option.kind;
    pendingWidgetTitle = option.title;
    pendingWidgetSource = option.source;
    pendingWidgetPresetOptions = { ...(option.presetOptions ?? {}) };
    addWidgetWizardStep = 'node';
  };

  const addWidget = (nodeId: ExecutionNodeId) => {
    // Avoid ID collisions (keyed {#each} requires unique widget IDs).
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const source = getDefaultSourceForKind(pendingWidgetKind, pendingWidgetSource);
    const suggestedBaseUrl = (() => {
      const node = executionNodes.find((entry) => entry.value === nodeId);
      const port = defaultPortBySource[source];
      if (!node || !port || !source) return '';
      return `http://${node.host}:${port}`;
    })();
    const widget: WidgetInstance = {
      id,
      kind: pendingWidgetKind,
      title: 'New Widget',
      source,
      layout: {
        span: 4,
        height:
          pendingWidgetKind === 'speedtest'
            ? 360
            : pendingWidgetKind === 'monitor' || pendingWidgetKind === 'systemMonitor'
              ? 240
              : 145
      },
      mobile: { span: 4, hide: false },
      options: {
        tabId: widgetEditorTabId || defaultDashboardTabId,
        executionNode: nodeId,
        healthServer: nodeId,
        titleAboveSpacer: false,
        ...(pendingWidgetKind === 'plex'
          ? {
              sessionMetaSize: 20,
              sessionMetaWeight: 300,
              sessionMetaColor: '#eef4ff',
              sessionLabelSize: 12,
              sessionLabelWeight: 300,
              sessionLabelColor: '#9aa8ba',
              nowPlayingAutoMetadata: true
            }
          : {}),
        ...(pendingWidgetKind === 'monitor' || pendingWidgetKind === 'systemMonitor'
          ? {
              ...(pendingWidgetKind === 'systemMonitor'
                ? {
                    monitorStyle: 'system',
                    monitorDisplay:
                      pendingWidgetPresetOptions.monitorDisplay === 'compact' ||
                      pendingWidgetPresetOptions.monitorDisplay === 'linear' ||
                      pendingWidgetPresetOptions.monitorDisplay === 'header' ||
                      pendingWidgetPresetOptions.monitorDisplay === 'spark'
                        ? pendingWidgetPresetOptions.monitorDisplay
                        : 'gauge',
                    monitorSystemOrientation:
                      pendingWidgetPresetOptions.monitorSystemOrientation === 'stacked'
                        ? 'stacked'
                        : 'side-by-side',
                    monitorRefreshSec: Math.min(
                      60,
                      Math.max(1, Number(pendingWidgetPresetOptions.monitorRefreshSec ?? 15))
                    ),
                    monitorSystemNodes: executionNodes.map((node) => ({
                      value: node.value,
                      label: node.label,
                      host: node.host,
                      port: 61208,
                      baseUrl: `http://${node.host}:61208`
                    }))
                  }
                : {
                    monitorStyle: 'list'
                  })
            }
          : {}),
        ...(pendingWidgetKind !== 'monitor' && pendingWidgetKind !== 'systemMonitor'
          ? pendingWidgetPresetOptions
          : {}),
        ...(suggestedBaseUrl ? { baseUrl: suggestedBaseUrl } : {})
      }
    };
    config = { ...config, widgets: [...config.widgets, widget] };
    selectedId = id;
    closeAddWidgetWizard();
  };

	  const removeWidget = (id: string) => {
	    config = { ...config, widgets: config.widgets.filter((widget) => widget.id !== id) };
	    if (selectedId === id) {
	      selectedId = config.widgets[0]?.id ?? '';
	    }
	  };

	  const duplicateWidget = (id: string) => {
	    const index = config.widgets.findIndex((widget) => widget.id === id);
	    if (index === -1) return;
	    const original = config.widgets[index];
      // Avoid ID collisions (keyed {#each} requires unique widget IDs).
      const duplicateId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	    const clone = (typeof structuredClone === 'function'
	      ? structuredClone(original)
	      : JSON.parse(JSON.stringify(original))) as WidgetInstance;
	    clone.id = duplicateId;
	    const title = String(original.title ?? '').trim() || getWidgetProviderLabel(original);
	    clone.title = `${title} (Copy)`;
	    clone.data = null;
      // Make the cloned widget's tab explicit so it doesn't "jump" tabs after save/normalize.
      clone.options = {
        ...(clone.options ?? {}),
        tabId: getWidgetTabId(original)
      };
	    // Duplicates should be visible on mobile by default; otherwise copying a desktop-only
	    // widget to a mobile tab looks "buggy" even though it's just inheriting hide=true.
	    clone.mobile = {
	      ...(clone.mobile ?? { span: 4 }),
	      hide: false
	    };
	    const nextWidgets = [...config.widgets];
	    nextWidgets.splice(index + 1, 0, clone);
	    config = { ...config, widgets: nextWidgets };
	    widgetEditorTabId = getWidgetTabId(clone);
	    selectedId = duplicateId;
	  };

  const moveWidget = (id: string, direction: 'up' | 'down') => {
    const index = config.widgets.findIndex((widget) => widget.id === id);
    if (index === -1) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= config.widgets.length) return;
    const updated = [...config.widgets];
    const [item] = updated.splice(index, 1);
    updated.splice(target, 0, item);
    config = { ...config, widgets: updated };
  };

  const moveWidgetTo = (fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) return;
    const fromIndex = config.widgets.findIndex((widget) => widget.id === fromId);
    const toIndex = config.widgets.findIndex((widget) => widget.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;
    const updated = [...config.widgets];
    const [item] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, item);
    config = { ...config, widgets: updated };
  };

  const handleDragStart = (id: string, event: DragEvent) => {
    dragId = id;
    dragOverId = id;
    event.dataTransfer?.setData('text/plain', id);
    event.dataTransfer?.setDragImage(event.currentTarget as Element, 20, 20);
  };

  const handleDragOver = (id: string, event: DragEvent) => {
    event.preventDefault();
    dragOverId = id;
  };

  const handleDrop = (id: string, event: DragEvent) => {
    event.preventDefault();
    const sourceId = dragId || event.dataTransfer?.getData('text/plain');
    if (sourceId) {
      moveWidgetTo(sourceId, id);
    }
    dragId = '';
    dragOverId = '';
  };

  const handleDragEnd = () => {
    dragId = '';
    dragOverId = '';
  };

  const startResize = (event: PointerEvent) => {
    if (!selectedId) return;
    resizeStartX = event.clientX;
    resizeStartY = event.clientY;
    const widget = selectedWidgetItem;
    if (!widget) return;
    resizeStartSpan = widget?.layout?.span ?? 4;
    resizeStartHeight =
      (widget?.layout?.height ?? 0) > 0
        ? Number(widget?.layout?.height ?? 0)
        : widget?.kind === 'service'
          ? 280
        : widget?.kind === 'prowlarr'
            ? 320
          : widget?.kind === 'sabnzbd'
            ? 420
          : widget?.kind === 'speedtest'
            ? 360
          : widget?.kind === 'chart'
          ? 240
          : widget?.kind === 'grafana'
            ? 320
          : (widget?.kind as string) === 'stat'
            ? 145
            : widget?.kind === 'monitor' || widget?.kind === 'systemMonitor'
              ? 240
                : widget?.kind === 'requests'
                  ? 460
                : widget?.kind === 'plex' || widget?.kind === 'history'
                  ? 360
                  : widget?.kind === 'calendar'
                    ? 240
                    : widget?.kind === 'clock'
                      ? 92
                      : 0;
    const minHeight =
      widget.source === 'technitium'
        ? 180
        : (widget.kind === 'plex' || widget.kind === 'history') &&
            widget.options?.subtype === 'now-playing'
          ? 280
          : 0;

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - resizeStartX;
      const deltaY = moveEvent.clientY - resizeStartY;
      const spanDelta = Math.round(deltaX / 20) * 0.5;
      const nextSpan = Math.min(12, Math.max(1, Math.round((resizeStartSpan + spanDelta) * 2) / 2));
      const nextHeight = Math.max(minHeight, resizeStartHeight + Math.round(deltaY / 10) * 10);
      updateWidget(selectedId, {
        layout: {
          span: nextSpan,
          height: nextHeight,
          columnStart: widget?.layout?.columnStart
        }
      });
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const updateWidget = (id: string, patch: Partial<WidgetInstance>) => {
    config = {
      ...config,
      widgets: config.widgets.map((widget) =>
        widget.id === id
          ? {
              ...widget,
              ...patch,
              layout: {
                span: patch.layout?.span ?? widget.layout?.span ?? 4,
                height: patch.layout?.height ?? widget.layout?.height,
                columnStart: patch.layout?.columnStart ?? widget.layout?.columnStart
              },
              mobile: {
                span: patch.mobile?.span ?? widget.mobile?.span ?? 4,
                hide: patch.mobile?.hide ?? widget.mobile?.hide ?? false,
                order: patch.mobile?.order ?? widget.mobile?.order
              },
              options: {
                ...(widget.options ?? {}),
                ...(patch.options ?? {})
              }
            }
          : widget
      )
    };
  };

  const updateStageWidgetFootprint = () => {
    if (!previewFrameEl) {
      stageWidgetFootprint = { width: 0, height: 0 };
      return;
    }
    const shell = previewFrameEl.querySelector('.widget-shell') as HTMLElement | null;
    if (!shell) {
      stageWidgetFootprint = { width: 0, height: 0 };
      return;
    }
    const rect = shell.getBoundingClientRect();
    stageWidgetFootprint = {
      width: Math.max(0, Math.round(rect.width)),
      height: Math.max(0, Math.round(rect.height))
    };
  };

  $: {
    const tabState = resolveEditorTabState(settings.tabs, settings);
    dashboardTabs = tabState.tabs;
    defaultDashboardTabId = tabState.defaultTabId;
    defaultDashboardTabIdWeb = tabState.defaultTabIdWeb;
    defaultDashboardTabIdMobile = tabState.defaultTabIdMobile;
  }
  $: if (!dashboardTabs.some((tab) => tab.id === widgetEditorTabId)) {
    widgetEditorTabId = defaultDashboardTabId;
  }
  $: editableWidgets = config.widgets.filter((widget) => getWidgetTabId(widget) === widgetEditorTabId);
  $: sortedEditableWidgets = [...editableWidgets].sort((a, b) => {
    const keyA = getWidgetSidebarSortKey(a);
    const keyB = getWidgetSidebarSortKey(b);
    if (keyA === keyB) return a.id.localeCompare(b.id);
    return keyA.localeCompare(keyB);
  });
  $: {
    const needle = sidebarWidgetQuery.trim().toLowerCase();
    filteredSidebarWidgets = !needle
      ? sortedEditableWidgets
      : sortedEditableWidgets.filter((widget) => {
          const title = getWidgetSidebarTitle(widget).toLowerCase();
          const provider = getWidgetProviderLabel(widget).toLowerCase();
          const source = String(widget.source ?? '').toLowerCase();
          return title.includes(needle) || provider.includes(needle) || source.includes(needle);
        });
  }
  $: if (editableWidgets.length === 0) {
    if (selectedId) selectedId = '';
  } else if (!editableWidgets.some((widget) => widget.id === selectedId)) {
    selectedId = editableWidgets[0].id;
  }
  $: selectedWidgetItem = editableWidgets.find((widget) => widget.id === selectedId);
  $: if (selectedId !== lastWidgetSelection) {
    lastWidgetSelection = selectedId;
  }
  $: homeAssistantCustomMetricsForSelected =
    selectedWidgetItem?.source === 'home-assistant' && selectedWidgetItem.id
      ? homeAssistantCustomMetricsDrafts[selectedWidgetItem.id] ??
        extractHomeAssistantCustomMetricsFromWidget(selectedWidgetItem)
      : [];

  $: liveWidgetMap = new Map(liveWidgets.map((widget) => [widget.id, widget]));
  const coerceMediaPreviewData = (widget: WidgetInstance, data: unknown) => {
    const subtype = widget.options?.subtype === 'now-playing' ? 'now-playing' : 'history';
    if (!data || typeof data !== 'object') return data;
    const payload = data as Record<string, unknown>;
    if (subtype === 'history') {
      if (Array.isArray(payload.items)) return data;
      if (Array.isArray(payload.fallbackHistory)) {
        return { provider: widget.options?.provider === 'jellyfin' ? 'jellyfin' : 'plex', items: payload.fallbackHistory };
      }
      if (Array.isArray(payload.sessions)) {
        const items = payload.sessions.map((session, index) => {
          const row = session as Record<string, unknown>;
          return {
            id: String(row.id ?? `session-${index}`),
            title: String(row.title ?? `Session ${index + 1}`),
            subtitle: '',
            user: String(row.user ?? ''),
            playedAt: String(row.elapsed ?? ''),
            thumbnailUrl: row.posterUrl,
            type: 'session'
          };
        });
        return { provider: widget.options?.provider === 'jellyfin' ? 'jellyfin' : 'plex', items };
      }
      return data;
    }
    if (Array.isArray(payload.sessions)) return data;
    if (Array.isArray(payload.items)) {
      return { sessions: [], fallbackHistory: payload.items };
    }
    return data;
  };
  $: previewWidget = selectedWidgetItem
    ? (() => {
        const live = liveWidgetMap.get(selectedWidgetItem.id);
        const selectedHomeAssistantDrafts =
          selectedWidgetItem.source === 'home-assistant'
            ? homeAssistantCustomMetricsForSelected
            : undefined;
        const mergedData =
          selectedWidgetItem.source === 'home-assistant'
            ? deriveHomeAssistantPreviewData(
                selectedWidgetItem,
                live?.data ?? selectedWidgetItem.data,
                selectedHomeAssistantDrafts
              )
            : selectedWidgetItem.kind === 'monitor' || selectedWidgetItem.kind === 'systemMonitor'
              ? deriveMonitorPreviewData(selectedWidgetItem, live?.data ?? selectedWidgetItem.data)
            : selectedWidgetItem.kind === 'plex' || selectedWidgetItem.kind === 'history' || selectedWidgetItem.source === 'media-history'
              ? coerceMediaPreviewData(selectedWidgetItem, live?.data ?? selectedWidgetItem.data)
            : live?.data ?? selectedWidgetItem.data;
        return {
          ...selectedWidgetItem,
          data: mergedData,
          health: live?.health ?? selectedWidgetItem.health,
          link: selectedWidgetItem.link ?? live?.link
        };
      })()
    : undefined;
  const getPreviewHeight = (widget: WidgetInstance) => {
    const configured = Number(widget.layout?.height ?? 0);
    if (configured > 0) return configured;
    if (widget.kind === 'calendar') return 300;
    if (widget.kind === 'prowlarr') return 320;
    if (widget.kind === 'sabnzbd') return 420;
    if (widget.kind === 'speedtest') return 360;
    if (widget.kind === 'grafana') return 320;
    return widget.layout?.height;
  };
  const clampPreviewZoom = (value: number) =>
    Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, value));
  const handlePreviewZoomInputChange = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement | null;
    if (!input) return;
    const raw = input.value.trim().replace('%', '');
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
      previewZoom = clampPreviewZoom(numeric / 100);
    }
    input.value = `${Math.round(previewZoom * 100)}%`;
  };
  const getDesktopPreviewWidth = (widget: WidgetInstance) => {
    const gap = Math.max(0, Number(settings.gridGap ?? 16));
    const span = Math.min(
      PREVIEW_DESKTOP_GRID_COLUMNS,
      Math.max(1, Number(widget.layout?.span ?? PREVIEW_DESKTOP_GRID_COLUMNS))
    );
    const trackWidth = Math.max(
      1,
      (PREVIEW_DESKTOP_GRID_WIDTH - gap * (PREVIEW_DESKTOP_GRID_COLUMNS - 1)) /
        PREVIEW_DESKTOP_GRID_COLUMNS
    );
    const naturalWidth = trackWidth * span + gap * (span - 1);
    return Math.max(
      1,
      Math.round(
        Math.min(PREVIEW_DESKTOP_GRID_WIDTH, naturalWidth * PREVIEW_DESKTOP_MAGNIFICATION)
      )
    );
  };

  $: previewItems = previewWidget
    ? [{
        ...previewWidget,
        layout: {
          span:
            previewViewport === 'mobile'
              ? Math.min(4, Math.max(1, Number(previewWidget.mobile?.span ?? 4)))
              : Math.min(25, Math.max(1, Number(previewWidget.layout?.span ?? 25))),
          height: getPreviewHeight(previewWidget)
        },
        mobile: {
          span: Math.min(4, Math.max(1, Number(previewWidget.mobile?.span ?? 4))),
          hide: false
        }
      }]
    : [];
  $: previewDesktopWidth =
    previewViewport === 'desktop' && previewWidget
      ? getDesktopPreviewWidth(previewWidget)
      : PREVIEW_DESKTOP_GRID_WIDTH;
  $: {
    previewItems;
    settings.scale;
    if (previewItems.length > 0 && typeof window !== 'undefined') {
      requestAnimationFrame(() => updateStageWidgetFootprint());
    } else {
      stageWidgetFootprint = { width: 0, height: 0 };
    }
  }
  $: hasDraftChanges = Boolean(savedSnapshot) && toConfigSnapshot(config) !== savedSnapshot;
  // Autosave is disabled while editing; returning to the dashboard attempts a save first.

  onMount(() => {
    mounted = true;
    const source = new EventSource('/api/stream');
    const params = new URLSearchParams(window.location.search);
    requestedEditorTabId = params.get('tab')?.trim() ?? '';
    requestedWidgetId = params.get('widget')?.trim() ?? '';
    returnDashboardTabId = params.get('returnTab')?.trim() ?? requestedEditorTabId;
    returnWithEditMode = params.get('edit') === '1';

    source.addEventListener('widgets', (event) => {
      try {
        const payload = JSON.parse(event.data) as { widgets?: WidgetInstance[] };
        if (Array.isArray(payload.widgets)) {
          liveWidgets = payload.widgets;
        }
      } catch {
        // Ignore malformed stream payloads.
      }
    });

    source.addEventListener('error', () => {
      source.close();
    });

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (showControlCenter && !target?.closest('.control-center-wrap')) {
        showControlCenter = false;
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        showControlCenter = false;
      }
    };
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleEscape);

    const load = async () => {
      try {
        const [nextConfig, liveRes] = await Promise.all([
          fetchConfig(),
          fetch('/api/widgets', { cache: 'no-store' })
        ]);
        if (!mounted) return;

        const normalizedConfig = normalizeEditorTabConfig(nextConfig);
        const { tabState } = normalizedConfig;
        config = {
          ...nextConfig,
          widgets: normalizedConfig.widgets,
          settings: normalizedConfig.settings
        };
        savedSnapshot = toConfigSnapshot(config);
        hasDraftChanges = false;
        homeAssistantCustomMetricsDrafts = buildHomeAssistantCustomMetricsDrafts(config.widgets ?? []);
        settings = normalizeDashboardSettings(config.settings, settings);
        const requestedWidget = requestedWidgetId
          ? config.widgets.find((widget) => widget.id === requestedWidgetId)
          : undefined;
        const requestedWidgetTabId = requestedWidget
          ? resolveEditorWidgetTabId(
              requestedWidget,
              tabState.tabs,
              tabState.defaultTabId
            )
          : '';
        const initialEditorTabId = requestedWidgetTabId
          ? requestedWidgetTabId
          : requestedEditorTabId && tabState.tabs.some((tab) => tab.id === requestedEditorTabId)
            ? requestedEditorTabId
            : tabState.defaultTabId;
        widgetEditorTabId = initialEditorTabId;

        const firstWidgetInTab = config.widgets.find((widget) => {
          return (
            resolveEditorWidgetTabId(widget, tabState.tabs, tabState.defaultTabId) ===
            initialEditorTabId
          );
        });
        selectedId = requestedWidget?.id ?? firstWidgetInTab?.id ?? '';

        if (liveRes.ok) {
          const livePayload = (await liveRes.json()) as { widgets?: WidgetInstance[] };
          if (Array.isArray(livePayload.widgets)) {
            liveWidgets = livePayload.widgets;
          }
        }

        error = '';
        showError = false;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (message.toLowerCase().includes('fetch')) {
          showError = false;
          error = '';
          return;
        }
        error = message;
        showError = true;
        errorTimer = setTimeout(() => {
          showError = false;
          errorTimer = null;
        }, 3000);
      }
    };

    void load();

	    return () => {
	      mounted = false;
	      source.close();
	      document.removeEventListener('click', handleDocumentClick);
	      document.removeEventListener('keydown', handleEscape);
	    };
	  });

	  const updateSettings = (next: Partial<DashboardSettings>) => {
	    const nextSettings = { ...settings, ...next };
	    settings = nextSettings;
	    config = { ...config, settings: nextSettings };
	  };

  const discardDraft = async () => {
    try {
      const nextConfig = await fetchConfig();
      const normalizedConfig = normalizeEditorTabConfig(nextConfig);
      config = {
        ...nextConfig,
        widgets: normalizedConfig.widgets,
        settings: normalizedConfig.settings
      };
      settings = normalizeDashboardSettings(config.settings, settings);
      homeAssistantCustomMetricsDrafts = buildHomeAssistantCustomMetricsDrafts(config.widgets ?? []);
      savedSnapshot = toConfigSnapshot(config);
      hasDraftChanges = false;
      const firstInEditorTab = config.widgets.find((widget) => getWidgetTabId(widget) === widgetEditorTabId);
      if (!firstInEditorTab || firstInEditorTab.id !== selectedId) {
        selectedId = firstInEditorTab?.id ?? '';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to discard draft';
      showError = true;
    }
  };

  const goBackToDashboard = async () => {
    if (hasDraftChanges) {
      const saved = await saveConfig();
      if (!saved) {
        error = error || 'Could not save changes. Fix errors or discard draft before leaving.';
        showError = true;
        return;
      }
    }
    const fallbackTabId = widgetEditorTabId || defaultDashboardTabId;
    const tabId =
      (returnDashboardTabId && dashboardTabs.some((tab) => tab.id === returnDashboardTabId)
        ? returnDashboardTabId
        : fallbackTabId) || 'main';
    void goto(`/?tab=${encodeURIComponent(tabId)}${returnWithEditMode ? '&edit=1' : ''}`);
  };

	  const resolveTabIconKey = (tab: DashboardTab): TabIconKey =>
	    normalizeTabIconKey(tab.icon) ?? tabIconFallbackForName(tab.name);
</script>

<main
  class="page"
  style={`--settings-bg-color: ${normalizeHexColor(settings.settingsBackgroundColor, '#0a1018')}; --settings-bg-strong: color-mix(in srgb, var(--settings-bg-color) 82%, transparent); --settings-bg-surface: color-mix(in srgb, var(--settings-bg-color) 72%, transparent); --settings-bg-soft: color-mix(in srgb, var(--settings-bg-color) 58%, transparent);`}
>
  <header class="page-header">
    <div>
      <p class="eyebrow">Layout Editor</p>
      <h1>Edit Lantern</h1>
      <p class="subhead">Customize widgets, data sources, and mobile layout.</p>
    </div>
    <div class="header-actions">
      <button class="ghost" on:click={goBackToDashboard}>Back</button>
      <button class="ghost" on:click={discardDraft} disabled={!hasDraftChanges}>Discard Draft</button>
      <button class="primary" on:click={saveConfig} disabled={saving}>
        {saving ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  </header>

  {#if error && showError}
    <div class="editor-error">{error}</div>
  {/if}

  <div class="focus-toolbar">
    <div class="focus-tabs-pane">
      <div
        class="tab-scroll scrollbar-hide"
        role="region"
        aria-label="Scrollable lantern tabs"
        bind:this={tabLaneEl}
        on:wheel={handleTabLaneWheel}
        on:pointerdown={handleTabLanePointerDown}
        on:pointermove={handleTabLanePointerMove}
        on:pointerup={handleTabLanePointerUp}
        on:pointercancel={handleTabLanePointerUp}
      >
        <div class="focus-tabbar" role="tablist" aria-label="Lantern tabs">
	          {#each dashboardTabs as tab (tab.id)}
	            <button
	              class={`focus-tab tab-action-host ${widgetEditorTabId === tab.id ? 'active' : ''} ${deletingTabId === tab.id ? 'deleting' : ''} ${dragOverTabId === tab.id ? `tab-drop-${dragOverTabPosition}` : ''}`}
	              role="tab"
	              aria-selected={widgetEditorTabId === tab.id}
	              use:tabRef={tab.id}
	              draggable="true"
              on:click={() => {
                widgetEditorTabId = tab.id;
                selectedId = config.widgets.find((widget) => getWidgetTabId(widget) === tab.id)?.id ?? '';
              }}
              on:dragstart={(event) => handleTabDragStart(tab.id, event)}
              on:dragover={(event) => handleTabDragOver(tab.id, event)}
	              on:drop={(event) => handleTabDrop(tab.id, event)}
	              on:dragend={resetTabDragState}
	            >
		              <span class={`tab-action-strip ${widgetEditorTabId === tab.id ? 'persist' : ''}`}>
		                <span
		                  class="tab-action-btn"
		                  role="button"
		                  tabindex="0"
		                  aria-label={`Rename ${tab.name} tab`}
		                  title="Rename"
		                  on:click|stopPropagation={() => openTabIdentityModal(tab.id)}
		                  on:keydown|stopPropagation={(event) => {
		                    if (event.key === 'Enter' || event.key === ' ') {
		                      event.preventDefault();
			                      openTabIdentityModal(tab.id);
		                    }
		                  }}
		                >
		                  <svg viewBox="0 0 24 24" aria-hidden="true">
		                    <path d="M12 20h9" />
		                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
		                  </svg>
		                </span>
		                <span
		                  class="tab-action-btn"
		                  role="button"
		                  tabindex="0"
		                  aria-label={`Duplicate ${tab.name} tab`}
		                  title="Duplicate"
		                  on:click|stopPropagation={() => duplicateDashboardTab(tab.id)}
		                  on:keydown|stopPropagation={(event) => {
		                    if (event.key === 'Enter' || event.key === ' ') {
		                      event.preventDefault();
		                      duplicateDashboardTab(tab.id);
		                    }
		                  }}
		                >
		                  <svg viewBox="0 0 24 24" aria-hidden="true">
		                    <rect x="9" y="9" width="10" height="10" rx="2" />
		                    <rect x="5" y="5" width="10" height="10" rx="2" />
		                  </svg>
		                </span>
		                {#if dashboardTabs.length > 1}
		                  <span
		                    class="tab-action-btn danger"
		                    role="button"
		                    tabindex="0"
		                    aria-label={`Delete ${tab.name} tab`}
		                    title="Delete"
		                    on:click|stopPropagation={() => requestDeleteTab(tab.id)}
		                    on:keydown|stopPropagation={(event) => {
		                      if (event.key === 'Enter' || event.key === ' ') {
		                        event.preventDefault();
		                        requestDeleteTab(tab.id);
		                      }
		                    }}
		                  >
		                    <svg viewBox="0 0 24 24" aria-hidden="true">
		                      <path d="M6 6l12 12M18 6L6 18" />
		                    </svg>
		                  </span>
		                {/if}
		              </span>
		              <svg viewBox="0 0 24 24" aria-hidden="true">
		                {#each getTabIconPaths(resolveTabIconKey(tab)) as d (d)}
		                  <path d={d} />
		                {/each}
		              </svg>
		              {tab.name}
		            </button>
	          {/each}
          <button
            class="focus-tab tab-add-inline"
            type="button"
            aria-label="Add tab"
            bind:this={addTabButtonRef}
            on:click={addDashboardTab}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>
    </div>

	    <div class="focus-actions-pane">
	      <button
	        class={`hud-activity-toggle ${(settings.showHealthCircles ?? true) ? 'active' : ''}`}
	        type="button"
	        on:click={() => updateSettings({ showHealthCircles: !(settings.showHealthCircles ?? true) })}
	        aria-pressed={settings.showHealthCircles ?? true}
	        aria-label="Toggle health circles"
	        title="Toggle health circles"
	      >
	        <svg viewBox="0 0 24 24" aria-hidden="true">
	          <path d="M3 12h3l2.5-5 4 10 2.5-5H21" />
	        </svg>
	      </button>

	      <div class="control-center-wrap">
	        <button
	          class={`hud-design-toggle ${showControlCenter ? 'active' : ''}`}
	          type="button"
	          on:click|stopPropagation={() => (showControlCenter = !showControlCenter)}
	          aria-pressed={showControlCenter}
	          aria-label="Settings"
	          title="Settings"
	        >
	          <svg viewBox="0 0 24 24" aria-hidden="true">
	            <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM19.4 15a1 1 0 0 0 .2 1.1l.1.1a1 1 0 0 1 0 1.4l-1.2 1.2a1 1 0 0 1-1.4 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1 1 0 0 1-1 1h-1.7a1 1 0 0 1-1-1v-.2a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1 1 0 0 1-1.4 0l-1.2-1.2a1 1 0 0 1 0-1.4l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1 1 0 0 1-1-1v-1.7a1 1 0 0 1 1-1h.2a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1 1 0 0 1 0-1.4l1.2-1.2a1 1 0 0 1 1.4 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1 1 0 0 1 1-1h1.7a1 1 0 0 1 1 1v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1 1 0 0 1 1.4 0l1.2 1.2a1 1 0 0 1 0 1.4l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1 1 0 0 1 1 1v1.7a1 1 0 0 1-1 1h-.2a1 1 0 0 0-.9.6z" />
	          </svg>
	        </button>

		        {#if showControlCenter}
		          <div
		            class="control-center-panel"
		            role="dialog"
		            aria-label="Control center"
		            tabindex="-1"
		            on:click|stopPropagation
		            on:keydown|stopPropagation={() => {}}
		          >
		            <div class="cc-section-title">STARTUP VIEWS</div>
		            <div class="cc-stack">
		              <label class="cc-field">
	                <span class="cc-label">Default Desktop Tab</span>
	                <select
	                  value={defaultDashboardTabIdWeb}
	                  on:change={(e) => setDefaultDashboardTabWeb((e.target as HTMLSelectElement).value)}
	                >
	                  {#each dashboardTabs as tab (tab.id)}
	                    <option value={tab.id}>{tab.name}</option>
	                  {/each}
	                </select>
	              </label>
	              <label class="cc-field">
	                <span class="cc-label">Default Mobile Tab</span>
	                <select
	                  value={defaultDashboardTabIdMobile}
	                  on:change={(e) => setDefaultDashboardTabMobile((e.target as HTMLSelectElement).value)}
	                >
	                  {#each dashboardTabs as tab (tab.id)}
	                    <option value={tab.id}>{tab.name}</option>
	                  {/each}
	                </select>
	              </label>
	            </div>

	            <div class="cc-divider"></div>

	            <div class="cc-section-title">TAB BAR APPEARANCE</div>
	            <div class="cc-grid-2">
	              <label class="cc-field">
	                <span class="cc-label-small">Indicator Style</span>
	                <select
	                  value={settings.tabIndicatorStyle ?? 'underline'}
	                  on:change={(e) =>
	                    updateSettings({
	                      tabIndicatorStyle:
	                        (e.target as HTMLSelectElement).value === 'box' ||
	                        (e.target as HTMLSelectElement).value === 'neon' ||
	                        (e.target as HTMLSelectElement).value === 'dot'
	                          ? ((e.target as HTMLSelectElement).value as 'box' | 'neon' | 'dot')
	                          : 'underline'
	                    })}
	                >
	                  <option value="underline">Underline</option>
	                  <option value="box">Glow Capsule</option>
	                  <option value="neon">Neon</option>
	                  <option value="dot">Dot</option>
	                </select>
	              </label>
	              <div class="cc-field">
	                <span class="cc-label-small">Tab Position</span>
	                <div class="cc-segment">
	                  <button
	                    type="button"
	                    class={settings.tabPosition === 'left' ? 'active' : ''}
	                    on:click={() => updateSettings({ tabPosition: 'left' })}
	                  >Left</button>
	                  <button
	                    type="button"
	                    class={settings.tabPosition === 'center' ? 'active' : ''}
	                    on:click={() => updateSettings({ tabPosition: 'center' })}
	                  >Center</button>
	                </div>
	              </div>
	            </div>
	            <div class="cc-grid-2 cc-mt">
	              <label class="cc-field">
	                <span class="cc-label-small">Accent</span>
	                <div class="cc-color-row">
	                  <input
	                    type="color"
	                    value={normalizeHexColor(settings.tabIndicatorColor, '#21e6da')}
	                    on:input={(e) =>
	                      updateSettings({
	                        tabIndicatorColor: normalizeHexColor(
	                          (e.target as HTMLInputElement).value,
	                          '#21e6da'
	                        )
	                      })}
	                  />
	                  <input
	                    type="text"
	                    maxlength="7"
	                    value={normalizeHexColor(settings.tabIndicatorColor, '#21e6da')}
	                    on:change={(e) =>
	                      updateSettings({
	                        tabIndicatorColor: normalizeHexColor(
	                          (e.target as HTMLInputElement).value,
	                          '#21e6da'
	                        )
	                      })}
	                  />
	                </div>
	              </label>
	            </div>

	            <div class="cc-divider"></div>

	            <div class="cc-section-title">DASHBOARD LAYOUT</div>
	            <div class="cc-grid-2">
	              <div class="cc-field">
	                <span class="cc-label-small">Layout Mode</span>
	                <div class="cc-segment">
	                  <button
	                    type="button"
	                    class={settings.layoutMode === 'masonry' ? 'active' : ''}
	                    on:click={() => updateSettings({ layoutMode: 'masonry' })}
	                  >Masonry</button>
	                  <button
	                    type="button"
	                    class={settings.layoutMode === 'grid' ? 'active' : ''}
	                    on:click={() => updateSettings({ layoutMode: 'grid' })}
	                  >Grid</button>
	                </div>
	              </div>
	              <label class="cc-field">
	                <span class="cc-label-small">
	                  Gap Size <span class="cc-value">{Math.round(settings.gridGap ?? 16)}px</span>
	                </span>
	                <input
	                  class="cc-range"
	                  type="range"
	                  min="0"
	                  max="40"
	                  step="1"
	                  value={settings.gridGap ?? 16}
	                  on:input={(e) => updateSettings({ gridGap: Number((e.target as HTMLInputElement).value) })}
	                />
	              </label>
	            </div>
	            <label class="cc-field cc-mt">
	              <span class="cc-label-small">
	                Global Scale <span class="cc-value">{(settings.scale ?? 1).toFixed(2)}x</span>
	              </span>
	              <input
	                class="cc-range"
	                type="range"
	                min="0.5"
	                max="1.5"
	                step="0.01"
	                value={settings.scale ?? 1}
	                on:input={(e) => updateSettings({ scale: Number((e.target as HTMLInputElement).value) })}
	              />
	            </label>
	            <div class="cc-grid-2 cc-mt">
	              <label class="cc-field">
	                <span class="cc-label-small">
	                  Widget Blur <span class="cc-value">{Math.round(settings.widgetBlur ?? 8)}px</span>
	                </span>
	                <input
	                  class="cc-range"
	                  type="range"
	                  min="0"
	                  max="24"
	                  step="1"
	                  value={settings.widgetBlur ?? 8}
	                  on:input={(e) =>
	                    updateSettings({
	                      widgetBlur: Number((e.target as HTMLInputElement).value),
	                      widgetBlurEnabled: true
	                    })}
	                />
	              </label>
	              <label class="cc-field">
	                <span class="cc-label-small">
	                  Widget Alpha <span class="cc-value">{Math.round((settings.widgetOpacity ?? 0.95) * 100)}%</span>
	                </span>
	                <input
	                  class="cc-range"
	                  type="range"
	                  min="0"
	                  max="1"
	                  step="0.01"
	                  value={settings.widgetOpacity ?? 0.95}
	                  on:input={(e) =>
	                    updateSettings({ widgetOpacity: Number((e.target as HTMLInputElement).value) })}
	                />
	              </label>
	            </div>
	            <div class="cc-grid-2 cc-mt">
	              <label class="cc-field">
	                <span class="cc-label-small">Widget Background</span>
	                <div class="cc-color-row">
	                  <input
	                    type="color"
	                    value={normalizeHexColor(settings.widgetBackgroundColor, '#141b23')}
	                    on:input={(e) =>
	                      updateSettings({
	                        widgetBackgroundColor: normalizeHexColor(
	                          (e.target as HTMLInputElement).value,
	                          '#141b23'
	                        )
	                      })}
	                  />
	                  <input
	                    type="text"
	                    maxlength="7"
	                    value={normalizeHexColor(settings.widgetBackgroundColor, '#141b23')}
	                    on:change={(e) =>
	                      updateSettings({
	                        widgetBackgroundColor: normalizeHexColor(
	                          (e.target as HTMLInputElement).value,
	                          '#141b23'
	                        )
	                      })}
	                  />
	                </div>
	              </label>
	            </div>

	            <div class="cc-divider"></div>

	            <div class="cc-section-title">THEME &amp; WALLPAPER</div>
	            <div class="cc-grid-2 cc-mt">
	              <label class="cc-field">
	                <span class="cc-label-small">Editor Background</span>
	                <div class="cc-color-row">
	                  <input
	                    type="color"
	                    value={normalizeHexColor(settings.settingsBackgroundColor, '#0a1018')}
	                    on:input={(e) =>
	                      updateSettings({
	                        settingsBackgroundColor: normalizeHexColor(
	                          (e.target as HTMLInputElement).value,
	                          '#0a1018'
	                        )
	                      })}
	                  />
	                  <input
	                    type="text"
	                    maxlength="7"
	                    value={normalizeHexColor(settings.settingsBackgroundColor, '#0a1018')}
	                    on:change={(e) =>
	                      updateSettings({
	                        settingsBackgroundColor: normalizeHexColor(
	                          (e.target as HTMLInputElement).value,
	                          '#0a1018'
	                        )
	                      })}
	                  />
	                </div>
	              </label>
	              <label class="cc-field">
	                <span class="cc-label-small">Global Font</span>
	                <select
	                  value={settings.fontBody ?? 'Space Grotesk, Sora, Manrope, sans-serif'}
	                  on:change={(e) =>
	                    updateSettings({
	                      fontBody: (e.target as HTMLSelectElement).value,
	                      fontHeading: (e.target as HTMLSelectElement).value
	                    })}
	                >
	                  <option value="Space Grotesk, Sora, Manrope, sans-serif">Space Grotesk</option>
	                  <option value="Sora, Space Grotesk, sans-serif">Sora</option>
	                  <option value="Manrope, Space Grotesk, sans-serif">Manrope</option>
	                  <option value="Inter, sans-serif">Inter</option>
	                  <option value="system-ui, sans-serif">System</option>
	                </select>
	              </label>
	            </div>
	            <label class="cc-field cc-mt">
	              <span class="cc-label">Background Image URL</span>
	              <input
	                type="text"
	                value={settings.backgroundImage ?? ''}
	                placeholder="https://..."
	                on:input={(e) =>
	                  updateSettings({ backgroundImage: (e.target as HTMLInputElement).value })}
	              />
	            </label>
	            <label class="cc-field cc-mt">
	              <span class="cc-label">Upload Background Image</span>
	              <input
	                type="file"
	                accept="image/*"
	                on:change={async (event) => {
	                  const file = (event.target as HTMLInputElement).files?.[0];
	                  if (!file) return;
	                  const form = new FormData();
	                  form.append('file', file);
	                  const res = await fetch('/api/background', { method: 'POST', body: form });
	                  if (!res.ok) return;
	                  const payload = await res.json();
	                  updateSettings({ backgroundImage: payload.path });
	                }}
	              />
	            </label>
	            <div class="cc-actions">
	              <button class="ghost" type="button" on:click={() => updateSettings({ backgroundImage: '' })}>
	                Clear Background
	              </button>
	            </div>
	          </div>
	        {/if}
	      </div>
	    </div>
  </div>

  {#if activeTab === 'dashboard'}
    <section class="panel-section settings-section dashboard-settings">
      <h2>Lantern Settings</h2>
      <div class="dashboard-settings-tabs" role="tablist" aria-label="Lantern settings groups">
        <button
          class={`widget-tab-button ${dashboardSettingsTab === 'layout' ? 'active' : ''}`}
          role="tab"
          aria-selected={dashboardSettingsTab === 'layout'}
          on:click={() => (dashboardSettingsTab = 'layout')}
        >
          Layout
        </button>
        <button
          class={`widget-tab-button ${dashboardSettingsTab === 'appearance' ? 'active' : ''}`}
          role="tab"
          aria-selected={dashboardSettingsTab === 'appearance'}
          on:click={() => (dashboardSettingsTab = 'appearance')}
        >
          Appearance
        </button>
        <button
          class={`widget-tab-button ${dashboardSettingsTab === 'background' ? 'active' : ''}`}
          role="tab"
          aria-selected={dashboardSettingsTab === 'background'}
          on:click={() => (dashboardSettingsTab = 'background')}
        >
          Background
        </button>
        <button
          class={`widget-tab-button ${dashboardSettingsTab === 'typography' ? 'active' : ''}`}
          role="tab"
          aria-selected={dashboardSettingsTab === 'typography'}
          on:click={() => (dashboardSettingsTab = 'typography')}
        >
          Typography
        </button>
        <button
          class={`widget-tab-button ${dashboardSettingsTab === 'tabs' ? 'active' : ''}`}
          role="tab"
          aria-selected={dashboardSettingsTab === 'tabs'}
          on:click={() => (dashboardSettingsTab = 'tabs')}
        >Lantern Tabs</button>
      </div>

      {#if dashboardSettingsTab === 'layout'}
        <div class="settings-panel">
          <label>
            Layout Mode
            <select
              value={settings.layoutMode ?? 'masonry'}
              on:change={(e) =>
                updateSettings({ layoutMode: (e.target as HTMLSelectElement).value as 'grid' | 'masonry' })}
            >
              <option value="masonry">Masonry</option>
              <option value="grid">Grid</option>
            </select>
          </label>
          <label>
            Scale ({settings.scale?.toFixed(2) ?? '1.00'}x)
            <input
              type="range"
              min="0.6"
              max="1"
              step="0.02"
              value={settings.scale ?? 1}
              on:input={(e) => updateSettings({ scale: Number((e.target as HTMLInputElement).value) })}
            />
          </label>
          <label>
            Widget Gap ({Math.round(settings.gridGap ?? 16)}px)
            <input
              type="range"
              min="6"
              max="32"
              step="2"
              value={settings.gridGap ?? 16}
              on:input={(e) => updateSettings({ gridGap: Number((e.target as HTMLInputElement).value) })}
            />
          </label>
        </div>
      {/if}

      {#if dashboardSettingsTab === 'appearance'}
        <div class="settings-panel">
          <label>
            Widget Transparency ({Math.round(((settings.widgetOpacity ?? 0.95) * 100))}%)
            <input
              type="range"
              min="0.5"
              max="1"
              step="0.02"
              value={settings.widgetOpacity ?? 0.95}
              on:input={(e) => updateSettings({ widgetOpacity: Number((e.target as HTMLInputElement).value) })}
            />
          </label>
          <label>
            Widget Background Color
            <input
              type="color"
              value={normalizeHexColor(settings.widgetBackgroundColor, '#141b23')}
              on:input={(e) =>
                updateSettings({
                  widgetBackgroundColor: normalizeHexColor(
                    (e.target as HTMLInputElement).value,
                    '#141b23'
                  )
                })}
            />
          </label>
          <label class="checkbox">
            <input
              type="checkbox"
              checked={settings.widgetBlurEnabled ?? true}
              on:change={(e) =>
                updateSettings({ widgetBlurEnabled: (e.target as HTMLInputElement).checked })}
            />
            Enable Widget Blur
          </label>
          <label>
            Widget Blur ({Math.round(settings.widgetBlur ?? 8)}px)
            <input
              type="range"
              min="0"
              max="24"
              step="1"
              value={settings.widgetBlur ?? 8}
              disabled={!(settings.widgetBlurEnabled ?? true)}
              on:input={(e) => updateSettings({ widgetBlur: Number((e.target as HTMLInputElement).value) })}
            />
          </label>
        </div>
      {/if}

      {#if dashboardSettingsTab === 'background'}
        <div class="settings-panel">
          <label>
            Background Image URL
            <input
              type="text"
              value={settings.backgroundImage ?? ''}
              placeholder="https://..."
              on:input={(e) => updateSettings({ backgroundImage: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label>
            Upload Background Image
            <input
              type="file"
              accept="image/*"
              on:change={async (event) => {
                const file = (event.target as HTMLInputElement).files?.[0];
                if (!file) return;
                const form = new FormData();
                form.append('file', file);
                const res = await fetch('/api/background', { method: 'POST', body: form });
                if (!res.ok) return;
                const payload = await res.json();
                updateSettings({ backgroundImage: payload.path });
              }}
            />
          </label>
          <div class="settings-actions">
            <button class="ghost" on:click={() => updateSettings({ backgroundImage: '' })}>
              Clear Background
            </button>
          </div>
        </div>
      {/if}

      {#if dashboardSettingsTab === 'typography'}
        <div class="settings-panel">
          <label>
            Body Font Family
            <input
              type="text"
              value={settings.fontBody ?? ''}
              placeholder="Space Grotesk, Sora, sans-serif"
              on:input={(e) => updateSettings({ fontBody: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label>
            Heading Font Family
            <input
              type="text"
              value={settings.fontHeading ?? ''}
              placeholder="Space Grotesk, Sora, sans-serif"
              on:input={(e) => updateSettings({ fontHeading: (e.target as HTMLInputElement).value })}
            />
          </label>
          <label>
            Card Title Size ({Math.round(settings.cardTitleSize ?? 17.6)}px)
            <input
              type="range"
              min="10"
              max="48"
              step="1"
              value={settings.cardTitleSize ?? 17.6}
              on:input={(e) =>
                updateSettings({ cardTitleSize: Number((e.target as HTMLInputElement).value) })}
            />
          </label>
          <label>
            Header Size ({Math.round(settings.cardTitleAboveSize ?? 12)}px)
            <input
              type="range"
              min="8"
              max="36"
              step="1"
              value={settings.cardTitleAboveSize ?? 12}
              on:input={(e) =>
                updateSettings({ cardTitleAboveSize: Number((e.target as HTMLInputElement).value) })}
            />
          </label>
        </div>
      {/if}

      {#if dashboardSettingsTab === 'tabs'}
        <div class="settings-panel dashboard-tabs-panel">
          <label>
            Active Tab Style
	            <select
	              value={settings.tabIndicatorStyle ?? 'underline'}
	              on:change={(e) =>
	                updateSettings({
	                  tabIndicatorStyle: ((e.target as HTMLSelectElement).value === 'box' ||
	                  (e.target as HTMLSelectElement).value === 'neon' ||
	                  (e.target as HTMLSelectElement).value === 'dot')
	                    ? ((e.target as HTMLSelectElement).value as 'box' | 'neon' | 'dot')
	                    : 'underline'
	                })}
	            >
	              <option value="underline">Underline</option>
	              <option value="box">Glow Capsule</option>
	              <option value="neon">Neon</option>
	              <option value="dot">Dot</option>
	            </select>
	          </label>
          <label>
            Tab Accent Color
            <input
              type="color"
              value={normalizeHexColor(settings.tabIndicatorColor, '#21e6da')}
              on:input={(e) =>
                updateSettings({
                  tabIndicatorColor: normalizeHexColor(
                    (e.target as HTMLInputElement).value,
                    '#21e6da'
                  )
                })}
            />
          </label>
          <label>
            Default Tab (Web)
            <select
              value={defaultDashboardTabIdWeb}
              on:change={(e) => setDefaultDashboardTabWeb((e.target as HTMLSelectElement).value)}
            >
              {#each dashboardTabs as tab (tab.id)}
                <option value={tab.id}>{tab.name}</option>
              {/each}
            </select>
          </label>
          <label>
            Default Tab (Mobile)
            <select
              value={defaultDashboardTabIdMobile}
              on:change={(e) => setDefaultDashboardTabMobile((e.target as HTMLSelectElement).value)}
            >
              {#each dashboardTabs as tab (tab.id)}
                <option value={tab.id}>{tab.name}</option>
              {/each}
            </select>
          </label>
          <div class="settings-actions">
            <button class="ghost" type="button" on:click={addDashboardTab}>Add Tab</button>
          </div>
          <div class="dashboard-tab-list">
            {#each dashboardTabs as tab, index (tab.id)}
              <div class="dashboard-tab-row">
                <label>
                  Tab Name
                  <input
                    type="text"
                    value={tab.name}
                    on:input={(e) => renameDashboardTab(tab.id, (e.target as HTMLInputElement).value)}
                  />
                </label>
                <button
                  class="mini danger"
                  type="button"
                  disabled={dashboardTabs.length <= 1}
                  on:click={() => removeDashboardTab(tab.id)}
                >
                  Remove
                </button>
                <div class="dashboard-tab-meta">Tab {index + 1} · {tab.id}</div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  {:else}
    <div class="editor-grid">
    <aside class="editor-list">
      <button class="primary add-widget-button" type="button" on:click={openAddWidgetWizard}>+ Add Widget</button>
      <input
        class="editor-search-input"
        type="text"
        bind:value={sidebarWidgetQuery}
        placeholder="Search widgets"
        aria-label="Search widgets"
      />
      {#if config.widgets.length === 0}
        <div class="editor-empty">No widgets in this tab yet. Add one to get started.</div>
      {:else if filteredSidebarWidgets.length === 0}
        <div class="editor-empty">No widgets match your search.</div>
      {/if}
      {#each filteredSidebarWidgets as widget (widget.id)}
        <div
          class={`editor-item ${widget.id === selectedId ? 'active' : ''} group`}
          role="button"
          tabindex="0"
          on:click={() => selectWidget(widget.id)}
          on:keydown={(event) => event.key === 'Enter' && selectWidget(widget.id)}
          draggable="true"
          on:dragstart={(event) => handleDragStart(widget.id, event)}
          on:dragover={(event) => handleDragOver(widget.id, event)}
          on:drop={(event) => handleDrop(widget.id, event)}
          on:dragend={handleDragEnd}
          class:drag-target={dragOverId === widget.id && dragId !== widget.id}
        >
          {#if getWidgetSidebarIconUrl(widget)}
            <img class="editor-item-icon" src={getWidgetSidebarIconUrl(widget)} alt="" loading="lazy" />
          {:else}
            <span class="editor-item-icon-fallback" aria-hidden="true">
              {getWidgetProviderLabel(widget).slice(0, 1).toUpperCase()}
            </span>
          {/if}
          <div class="editor-item-content">
            <div class="editor-item-title">{getWidgetSidebarTitle(widget)}</div>
            <div class="editor-item-provider">{getWidgetProviderLabel(widget)}</div>
            <div class="editor-item-node-badge">{getWidgetNodeBadge(widget)}</div>
          </div>
          <div class="editor-item-actions">
            <button
              class="editor-item-action-btn duplicate"
              aria-label="Duplicate widget"
              title="Duplicate widget"
              on:click|stopPropagation={() => duplicateWidget(widget.id)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="9" y="9" width="10" height="10" rx="2"></rect>
                <rect x="5" y="5" width="10" height="10" rx="2"></rect>
              </svg>
            </button>
            <button
              class="editor-item-action-btn danger"
              aria-label="Delete widget"
              title="Delete widget"
              on:click|stopPropagation={() => removeWidget(widget.id)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18"></path>
              </svg>
            </button>
          </div>
        </div>
      {/each}
    </aside>

    <div class="widget-editor-layout">
      <section class="panel-section preview-section">
        {#if selectedWidgetItem && previewWidget}
          <div class={`preview-stage ${stageSavePulse ? 'save-pulse' : ''}`}>
            <div class="preview-stage-toolbar">
              <div class="preview-stage-title">Live Preview</div>
              <div class="preview-view-toggle" role="group" aria-label="Preview viewport">
                <button
                  type="button"
                  class={`preview-view-btn ${previewViewport === 'desktop' ? 'active' : ''}`}
                  on:click={() => (previewViewport = 'desktop')}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3.5" y="4.5" width="17" height="12" rx="2"></rect>
                    <path d="M8 19.5h8"></path>
                  </svg>
                  <span>Desktop</span>
                </button>
                <button
                  type="button"
                  class={`preview-view-btn ${previewViewport === 'mobile' ? 'active' : ''}`}
                  on:click={() => (previewViewport = 'mobile')}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="8" y="3.5" width="8" height="17" rx="2"></rect>
                    <path d="M11.5 17h1"></path>
                  </svg>
                  <span>Mobile</span>
                </button>
              </div>
              <div class="preview-stage-actions">
                <input
                  class="preview-zoom-input"
                  type="text"
                  inputmode="numeric"
                  aria-label="Preview zoom percent"
                  value={`${Math.round(previewZoom * 100)}%`}
                  on:change={handlePreviewZoomInputChange}
                  on:blur={handlePreviewZoomInputChange}
                />
                <button
                  type="button"
                  class="preview-zoom-reset group"
                  aria-label="Reset zoom to 100%"
                  title="Reset zoom"
                  on:click={() => (previewZoom = 1)}
                >↺</button>
              </div>
            </div>
            <div class="preview-zoom-stage">
              <div
                class={`preview-device-shell ${previewViewport}`}
                style={`--preview-zoom: ${previewZoom}; --preview-desktop-width: ${previewDesktopWidth}px;`}
              >
                <div
                  bind:this={previewFrameEl}
                  class={`preview-frame ${previewViewport} ${previewWidget?.link ? 'is-clickable' : ''}`}
                  style={`--ui-scale: ${Math.min(Math.max(settings.scale ?? 1, 0.5), 1.5)}; --grid-columns: ${previewViewport === 'mobile' ? 4 : 25}; --mobile-span: ${Math.min(4, Math.max(1, Number(previewWidget?.mobile?.span ?? 4)))}; --widget-opacity: ${settings.widgetOpacity ?? 0.95}; --widget-blur: ${(settings.widgetBlurEnabled ?? true) ? Math.min(24, Math.max(0, Number(settings.widgetBlur ?? 8))) : 0}px; --widget-blue-tint: ${(settings.widgetBlurEnabled ?? true) ? Math.min(0.4, Math.max(0, Number(settings.widgetBlur ?? 8) / 36)) : 0}; --widget-bg-rgb: ${toWidgetBackgroundRgb(settings.widgetBackgroundColor)}; --grid-gap: ${settings.gridGap ?? 16}px; --card-title-size: ${Math.min(48, Math.max(10, Number(settings.cardTitleSize ?? 17.6)))}px; --card-title-above-size: ${Math.min(36, Math.max(8, Number(settings.cardTitleAboveSize ?? 12)))}px; --card-title-font-family: ${settings.globalTitleFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif'}; --card-title-font-weight: ${Math.min(900, Math.max(300, Number(settings.globalTitleFontWeight ?? 600)))}; --card-title-color: ${normalizeHexColor(settings.globalTitleColor, '#eef4ff')}; --card-header-font-family: ${settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif'}; --card-header-font-weight: ${Math.min(900, Math.max(300, Number(settings.globalHeaderFontWeight ?? 600)))}; --card-header-color: ${normalizeHexColor(settings.globalHeaderColor, '#eef4ff')};`}
                >
                  <WidgetGrid
                    items={previewItems}
                    editMode={false}
                    layoutMode={settings.layoutMode ?? 'masonry'}
                    gridGap={settings.gridGap ?? 16}
                    showHealthCircles={settings.showHealthCircles ?? true}
                  />
                  {#if previewWidget?.link}
                    <button
                      type="button"
                      class="preview-click-layer"
                      aria-label="Open widget click URL"
                      on:click={() => handlePreviewWidgetClick(previewWidget)}
                    ></button>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        {:else}
          <div class="editor-empty">Select a widget to preview.</div>
        {/if}
      </section>

      <section class="editor-panel">
      {#if selectedWidgetItem}
        {#key selectedWidgetItem.id}
          {@const widget = selectedWidgetItem}
          <div class="inspector-scroll">
          <SettingsDrawer className="widget-settings-drawer">
          <details class="inspector-accordion identity" open>
            <summary>General & Layout</summary>
            <div class="panel-section settings-table general-layout-pro">
            <div class="identity-well">
              <div class="identity-grid-two">
                <label class="pro-field">
                  Widget Type
                  <select
                    class="pro-select"
                    value={widget?.kind}
                    on:change={(e) => {
                      const nextKind = (e.target as HTMLSelectElement).value as WidgetKind;
                      updateWidget(selectedId, {
                        kind: nextKind,
                        source: getDefaultSourceForKind(nextKind, widget?.source ?? '')
                      });
                    }}
                  >
                    {#each kinds as kind}
                      <option value={kind}>{kindLabels[kind]}</option>
                    {/each}
                  </select>
                </label>
                {#if widget?.kind !== 'monitor' && widget?.kind !== 'requests'}
                  <label class="pro-field">
                    Service Provider
                    <select
                      class="pro-select"
                      value={widget?.kind === 'plex' || widget?.kind === 'history'
                        ? ((widget?.options?.provider as string) === 'jellyfin' ? 'jellyfin' : 'plex')
                        : (hasSourceOptionForKind(widget?.kind as WidgetKind, (widget?.source ?? '').trim())
                          ? ((widget?.source ?? '').trim() as string)
                          : '')}
                      on:change={(e) => {
                        const nextValue = (e.target as HTMLSelectElement).value;
                        if (widget?.kind === 'plex' || widget?.kind === 'history') {
                          updateWidget(selectedId, { source: nextValue, options: { provider: nextValue } });
                          return;
                        }
                        updateWidget(selectedId, { source: nextValue });
                      }}
                    >
                      {#if widget?.kind === 'plex' || widget?.kind === 'history'}
                        <option value="plex">plex</option>
                        <option value="jellyfin">jellyfin</option>
                      {:else}
                        {#if widget?.source && !hasSourceOptionForKind(widget?.kind as WidgetKind, widget.source)}
                          <option value={widget.source}>{widget.source}</option>
                        {/if}
                        {#each getSourceOptionsForKind(widget?.kind as WidgetKind) as option}
                          <option value={option.value}>{option.label}</option>
                        {/each}
                      {/if}
                    </select>
                  </label>
                {/if}
              </div>
              <label class="pro-field">
                Lantern Tab
                <select
                  class="pro-select"
                  value={
                    (typeof widget?.options?.tabId === 'string' &&
                    dashboardTabs.some((tab) => tab.id === widget.options.tabId)
                      ? widget.options.tabId
                      : defaultDashboardTabId) as string
                  }
                  on:change={(e) =>
                    updateWidget(selectedId, {
                      options: {
                        tabId: (e.target as HTMLSelectElement).value
                      }
                    })}
                >
                  {#each dashboardTabs as tab (tab.id)}
                    <option value={tab.id}>{tab.name}</option>
                  {/each}
                </select>
              </label>
              <label class="pro-field">
                Card Title
                <input
                  type="text"
                  value={widget?.title}
                  on:input={(e) =>
                    updateWidget(selectedId, { title: (e.target as HTMLInputElement).value })
                  }
                />
              </label>
              <label class="pro-field">
                Card Title Font
                <select
                  class="pro-select"
                  value={isTypographyInherited(widget, 'cardTitle', 'font') ? '' : String(getTypographyRaw(widget, 'cardTitle', 'font') ?? '')}
                  on:change={(e) => setTypographyField(widget, 'cardTitle', 'font', (e.target as HTMLSelectElement).value)}
                >
                  <option value="">Global Default</option>
                  {#each typographyFontOptions as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>
              <div class="identity-grid-two header-identity-row">
                <label class="pro-field">
                  Header Text
                  <input
                    type="text"
                    value={
                      ((widget?.options?.titleAboveText as string) ??
                        ((widget?.options?.titleAbove as boolean) ? widget?.title : '')) as string
                    }
                    placeholder="Leave blank to hide"
                    on:input={(e) =>
                      updateWidget(selectedId, {
                        options: {
                          titleAboveText: (e.target as HTMLInputElement).value,
                          titleAbove: false
                        }
                      })}
                  />
                </label>
                <label class="pro-field">
                  Header Font
                  <select
                    class="pro-select"
                    value={isTypographyInherited(widget, 'cardHeader', 'font') ? '' : String(getTypographyRaw(widget, 'cardHeader', 'font') ?? '')}
                    on:change={(e) => setTypographyField(widget, 'cardHeader', 'font', (e.target as HTMLSelectElement).value)}
                  >
                    <option value="">Global Default</option>
                    {#each typographyFontOptions as option}
                      <option value={option.value}>{option.label}</option>
                    {/each}
                  </select>
                </label>
              </div>
              <label class="pro-field">
                Widget Click URL (Optional)
                <div class="identity-input-wrap">
                  <span class="identity-input-prefix" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 3h7v7"></path>
                      <path d="M10 14L21 3"></path>
                      <path d="M21 14v7h-7"></path>
                      <path d="M3 10V3h7"></path>
                    </svg>
                  </span>
                  <input
                    class="identity-icon-input"
                    type="text"
                    value={(widget?.link as string) ?? ''}
                    placeholder="https://example.com"
                    on:input={(e) =>
                      updateWidget(selectedId, { link: (e.target as HTMLInputElement).value })
                    }
                  />
                </div>
              </label>
              <label class="pro-field">
                Icon Override URL (Optional)
                <div class="identity-input-wrap">
                  <span class="identity-input-prefix" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L10 5"></path>
                      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L14 19"></path>
                    </svg>
                  </span>
                  <input
                    class="identity-icon-input"
                    type="text"
                    value={(widget?.options?.titleIconUrl as string) ?? ''}
                    placeholder="https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/svg/<icon>.svg"
                    on:input={(e) =>
                      updateWidget(selectedId, {
                        options: { titleIconUrl: (e.target as HTMLInputElement).value }
                      })}
                  />
                </div>
              </label>
              <div class="identity-visibility-grid">
                <label class="identity-visibility-item">
                  <span>Hide Icon</span>
                  <button
                    type="button"
                    class={`hyper-glass-toggle ${((widget?.options?.hideTitleIcon as boolean) ?? false) ? 'on' : ''}`}
                    role="switch"
                    aria-checked={((widget?.options?.hideTitleIcon as boolean) ?? false)}
                    aria-label="Toggle hide icon"
                    on:click={() =>
                      updateWidget(selectedId, {
                        options: { hideTitleIcon: !((widget?.options?.hideTitleIcon as boolean) ?? false) }
                      })}
                  >
                    <span class="hyper-glass-knob"></span>
                  </button>
                </label>
                <label class="identity-visibility-item">
                  <span>Hide Card Title</span>
                  <button
                    type="button"
                    class={`hyper-glass-toggle ${((widget?.options?.hideTitle as boolean) ?? false) ? 'on' : ''}`}
                    role="switch"
                    aria-checked={((widget?.options?.hideTitle as boolean) ?? false)}
                    aria-label="Toggle hide card title"
                    on:click={() =>
                      updateWidget(selectedId, {
                        options: { hideTitle: !((widget?.options?.hideTitle as boolean) ?? false) }
                      })}
                  >
                    <span class="hyper-glass-knob"></span>
                  </button>
                </label>
                <label class="identity-visibility-item">
                  <span>Show Health Status</span>
                  <button
                    type="button"
                    class={`hyper-glass-toggle ${((widget?.options?.showHealth as boolean) ?? true) ? 'on' : ''}`}
                    role="switch"
                    aria-checked={((widget?.options?.showHealth as boolean) ?? true)}
                    aria-label="Toggle health status indicator"
                    on:click={() =>
                      updateWidget(selectedId, {
                        options: { showHealth: !(((widget?.options?.showHealth as boolean) ?? true)) }
                      })}
                  >
                    <span class="hyper-glass-knob"></span>
                  </button>
                </label>
                <label class="identity-visibility-item">
                  <span>Show Empty Header</span>
                  <button
                    type="button"
                    class={`hyper-glass-toggle ${((widget?.options?.titleAboveSpacer as boolean) ?? false) ? 'on' : ''}`}
                    role="switch"
                    aria-checked={((widget?.options?.titleAboveSpacer as boolean) ?? false)}
                    aria-label="Toggle empty header spacer"
                    on:click={() =>
                      updateWidget(selectedId, {
                        options: { titleAboveSpacer: !((widget?.options?.titleAboveSpacer as boolean) ?? false) }
                      })}
                  >
                    <span class="hyper-glass-knob"></span>
                  </button>
                </label>
              </div>
            </div>
            <div class="layout-control-bar">
              <div class="layout-control-segment">
                <span class="layout-control-label">SPAN</span>
                <input
                  class="layout-control-input"
                  type="number"
                  min="1"
                  max="12"
                  step="0.5"
                  value={widget?.layout?.span ?? 4}
                  on:input={(e) =>
                    updateWidget(selectedId, { layout: { span: Number((e.target as HTMLInputElement).value) } })
                  }
                />
              </div>
              <div class="layout-control-segment">
                <span class="layout-control-label">MOBILE</span>
                <input
                  class="layout-control-input"
                  type="number"
                  min="1"
                  max="12"
                  value={widget?.mobile?.span ?? 4}
                  on:input={(e) =>
                    updateWidget(selectedId, { mobile: { ...widget?.mobile, span: Number((e.target as HTMLInputElement).value) } })
                  }
                />
              </div>
              <div class="layout-control-segment">
                <span class="layout-control-label">H (PX)</span>
                <input
                  class="layout-control-input"
                  type="number"
                  min={widget?.source === 'technitium' ? 180 : 0}
                  max="800"
                  value={widget?.layout?.height ?? 0}
                  on:input={(e) =>
                    updateWidget(selectedId, {
                      layout: { span: widget?.layout?.span ?? 4, height: Number((e.target as HTMLInputElement).value) }
                    })
                  }
                />
              </div>
              <div class="layout-control-segment visibility-segment">
                <span class="layout-control-label">VISIBLE?</span>
                <button
                  type="button"
                  class={`hyper-glass-toggle ${!(widget?.mobile?.hide ?? false) ? 'on' : ''}`}
                  on:click={() =>
                    updateWidget(selectedId, { mobile: { ...widget?.mobile, hide: !((widget?.mobile?.hide ?? false)) } })
                  }
                  aria-pressed={!(widget?.mobile?.hide ?? false)}
                  aria-label="Toggle mobile visibility"
                >
                  <span class="hyper-glass-knob"></span>
                </button>
                <span class="visibility-icon" aria-hidden="true">
                  {#if !(widget?.mobile?.hide ?? false)}
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  {:else}
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M17.94 17.94A10.87 10.87 0 0 1 12 19c-7 0-11-7-11-7a21.77 21.77 0 0 1 5.08-5.94"></path>
                      <path d="M9.9 4.24A10.88 10.88 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-3.02 4.32"></path>
                      <path d="M1 1l22 22"></path>
                    </svg>
                  {/if}
                </span>
              </div>
            </div>
            {#if widget?.source === 'seerr-requests'}
              <label>
                List Height (px)
                <input
                  type="number"
                  min="220"
                  max="1200"
                  value={Number((widget?.options?.height as number) ?? 450)}
                  on:input={(e) =>
                    updateWidget(selectedId, { options: { height: Number((e.target as HTMLInputElement).value) } })
                  }
                />
              </label>
            {/if}
            </div>
          </details>

          <details class="inspector-accordion source data-connection" open>
            <summary>Data & Connection</summary>
          <div class="panel-section settings-table data-connection-pro">
            <div class="connection-well">
              <label class="pro-field">
                Execution Node
                <select
                  class="pro-select"
                  value={getSelectedExecutionNode(widget)}
                  on:change={(e) =>
                    applyExecutionNodeToWidget(widget, (e.target as HTMLSelectElement).value as ExecutionNodeId)}
                >
                  {#each executionNodes as node (node.value)}
                    <option value={node.value}>{node.label}</option>
                  {/each}
                </select>
              </label>

              <label class="pro-field">
                Base URL
                <div class="icon-input-wrap">
                  <span class="icon-input-prefix" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L10 5"></path>
                      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L14 19"></path>
                    </svg>
                  </span>
                  <input
                    class="icon-input"
                    type="text"
                    value={(widget?.options?.baseUrl as string) ?? ''}
                    placeholder="http://host:port"
                    on:input={(e) =>
                      updateWidget(selectedId, { options: { baseUrl: (e.target as HTMLInputElement).value } })
                    }
                  />
                </div>
                {#if getNodeSuggestedBaseUrl(widget)}
                  <button class="suggested-link-btn" type="button" on:click={() => applySuggestedBaseUrl(widget)}>
                    Use Suggested: {getNodeSuggestedBaseUrl(widget)}
                  </button>
                {/if}
              </label>

              <label class="pro-field">
                API Key / Token
                <div class="icon-input-wrap">
                  <input
                    class="icon-input with-suffix"
                    type={showConnectionSecret ? 'text' : 'password'}
                    value={(widget?.options?.apiKey as string) ?? ''}
                    placeholder="leave blank for .env"
                    on:input={(e) =>
                      updateWidget(selectedId, { options: { apiKey: (e.target as HTMLInputElement).value } })
                    }
                  />
                  <button
                    type="button"
                    class="icon-input-suffix"
                    on:click={() => (showConnectionSecret = !showConnectionSecret)}
                    aria-label={showConnectionSecret ? 'Hide key' : 'Show key'}
                  >
                    {#if showConnectionSecret}
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1l22 22"></path><path d="M17.94 17.94A10.87 10.87 0 0 1 12 19c-7 0-11-7-11-7a21.77 21.77 0 0 1 5.08-5.94"></path><path d="M9.9 4.24A10.88 10.88 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-3.02 4.32"></path></svg>
                    {:else}
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    {/if}
                  </button>
                </div>
              </label>

              {#if !isMonitorWidget(widget)}
                <button
                  class="connection-test-btn"
                  type="button"
                  disabled={widgetHealthTestStates[widget.id]?.status === 'loading'}
                  on:click={() => runWidgetHealthTest(widget)}
                >
                  {#if widgetHealthTestStates[widget.id]?.status === 'loading'}
                    <span class="btn-spinner" aria-hidden="true"></span>
                    Testing Connection...
                  {:else}
                    Test Connection
                  {/if}
                </button>
              {/if}
              {#if !isMonitorWidget(widget)}
                <div class="connection-divider"></div>
                <div class="connection-row-grid">
                  <label class="pro-field">
                    Health Server
                    <input
                      type="text"
                      value={(widget?.options?.healthServer as string) ?? ''}
                      placeholder="node-1 / node-2"
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { healthServer: (e.target as HTMLInputElement).value } })
                      }
                    />
                  </label>
                  <label class="pro-field">
                    Health Container Name
                    <input
                      type="text"
                      value={(widget?.options?.healthContainer as string) ?? ''}
                      placeholder={widget?.source ? `default: ${widget.source}` : 'radarr'}
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { healthContainer: (e.target as HTMLInputElement).value } })
                      }
                    />
                  </label>
                </div>
              {/if}
            </div>
          </div>
          </details>

          <details class="inspector-accordion visuals">
          <summary>Appearance</summary>
          <div class="panel-section settings-table">
            {#if widget?.kind === 'plex' || widget?.kind === 'history' || widget?.source === 'media-history'}
              <details class="content-subaccordion">
                <summary>Active Stream Style</summary>
                <div class="settings-group">
                  <label>
                    Metadata Horizontal Offset ({Number((widget?.options?.nowPlayingPosterTextGap as number) ?? 2)}px)
                    <input
                      type="range"
                      min="-40"
                      max="40"
                      step="1"
                      value={Number((widget?.options?.nowPlayingPosterTextGap as number) ?? 2)}
                      on:input={(e) =>
                        updateWidget(selectedId, {
                          options: { nowPlayingPosterTextGap: Number((e.target as HTMLInputElement).value) }
                        })}
                    />
                  </label>
                  <label>
                    Metadata Vertical Offset ({Number((widget?.options?.nowPlayingMetadataVerticalOffset as number) ?? 0)}px)
                    <input
                      type="range"
                      min="-40"
                      max="40"
                      step="1"
                      value={Number((widget?.options?.nowPlayingMetadataVerticalOffset as number) ?? 0)}
                      on:input={(e) =>
                        updateWidget(selectedId, {
                          options: { nowPlayingMetadataVerticalOffset: Number((e.target as HTMLInputElement).value) }
                        })}
                    />
                  </label>
                </div>
                <TypographyControl
                  label="Title Font"
                  summary={getTypographyDisplay(widget, 'nowPlayingTitleText', 'size')}
                  fontValue={isTypographyInherited(widget, 'nowPlayingTitleText', 'font') ? '' : String(getTypographyRaw(widget, 'nowPlayingTitleText', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'nowPlayingTitleText', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'nowPlayingTitleText', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'nowPlayingTitleText', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'nowPlayingTitleText', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'nowPlayingTitleText', 'size')}
                  sizeMin={8}
                  sizeMax={42}
                  colorValue={getTypographyColor(widget, 'nowPlayingTitleText')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'nowPlayingTitleText', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'nowPlayingTitleText', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'nowPlayingTitleText', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'nowPlayingTitleText', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'nowPlayingTitleText', 'color', '')}
                />
                <TypographyControl
                  label="User Font"
                  summary={getTypographyDisplay(widget, 'nowPlayingUserText', 'size')}
                  fontValue={isTypographyInherited(widget, 'nowPlayingUserText', 'font') ? '' : String(getTypographyRaw(widget, 'nowPlayingUserText', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'nowPlayingUserText', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'nowPlayingUserText', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'nowPlayingUserText', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'nowPlayingUserText', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'nowPlayingUserText', 'size')}
                  sizeMin={8}
                  sizeMax={36}
                  colorValue={getTypographyColor(widget, 'nowPlayingUserText')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'nowPlayingUserText', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'nowPlayingUserText', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'nowPlayingUserText', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'nowPlayingUserText', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'nowPlayingUserText', 'color', '')}
                />
                <TypographyControl
                  label="Status Font"
                  summary={getTypographyDisplay(widget, 'playbackStatus', 'size')}
                  fontValue={isTypographyInherited(widget, 'playbackStatus', 'font') ? '' : String(getTypographyRaw(widget, 'playbackStatus', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'playbackStatus', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'playbackStatus', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'playbackStatus', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'playbackStatus', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'playbackStatus', 'size')}
                  sizeMin={8}
                  sizeMax={36}
                  colorValue={getTypographyColor(widget, 'playbackStatus')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'playbackStatus', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'playbackStatus', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'playbackStatus', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'playbackStatus', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'playbackStatus', 'color', '')}
                />
                <TypographyControl
                  label="Metadata Font"
                  summary={getTypographyDisplay(widget, 'sessionMeta', 'size')}
                  fontValue={isTypographyInherited(widget, 'sessionMeta', 'font') ? '' : String(getTypographyRaw(widget, 'sessionMeta', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'sessionMeta', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'sessionMeta', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'sessionMeta', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'sessionMeta', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'sessionMeta', 'size')}
                  sizeMin={8}
                  sizeMax={36}
                  colorValue={getTypographyColor(widget, 'sessionMeta')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'sessionMeta', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'sessionMeta', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'sessionMeta', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'sessionMeta', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'sessionMeta', 'color', '')}
                />
              </details>

              <details class="content-subaccordion">
                <summary>History List Style</summary>
                <div class="settings-group">
                  <label>
                    List Height (px)
                    <input
                      type="number"
                      min="180"
                      max="900"
                      value={Number((widget?.options?.height as number) ?? 360)}
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { height: Number((e.target as HTMLInputElement).value) } })
                      }
                    />
                  </label>
                </div>
                <TypographyControl
                  label="History Title Font"
                  summary={getTypographyDisplay(widget, 'sessionMeta', 'size')}
                  fontValue={isTypographyInherited(widget, 'sessionMeta', 'font') ? '' : String(getTypographyRaw(widget, 'sessionMeta', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'sessionMeta', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'sessionMeta', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'sessionMeta', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'sessionMeta', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'sessionMeta', 'size')}
                  sizeMin={8}
                  sizeMax={36}
                  colorValue={getTypographyColor(widget, 'sessionMeta')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'sessionMeta', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'sessionMeta', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'sessionMeta', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'sessionMeta', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'sessionMeta', 'color', '')}
                />
                <TypographyControl
                  label="History Subtext Font"
                  summary={getTypographyDisplay(widget, 'sessionLabels', 'size')}
                  fontValue={isTypographyInherited(widget, 'sessionLabels', 'font') ? '' : String(getTypographyRaw(widget, 'sessionLabels', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'sessionLabels', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'sessionLabels', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'sessionLabels', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'sessionLabels', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'sessionLabels', 'size')}
                  sizeMin={8}
                  sizeMax={36}
                  colorValue={getTypographyColor(widget, 'sessionLabels')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'sessionLabels', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'sessionLabels', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'sessionLabels', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'sessionLabels', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'sessionLabels', 'color', '')}
                />
              </details>

              {@const showMetricBoxes = (widget?.options?.metricBoxes as boolean) ?? true}
              {@const showMetricBorders = (widget?.options?.metricBoxBorder as boolean) ?? true}
              <details class="content-subaccordion">
                <summary>Metric Box Style</summary>
                <div class="settings-group">
                  <div class="metric-grid-border-row">
                    <label class="pro-field compact item-toggle-field">
                      <span class="micro-label">Show Boxes</span>
                      <button
                        type="button"
                        class={`hyper-glass-toggle ${showMetricBoxes ? 'on' : ''}`}
                        role="switch"
                        aria-checked={showMetricBoxes}
                        aria-label="Show metric boxes"
                        on:click={() => updateWidget(selectedId, { options: { metricBoxes: !showMetricBoxes } })}
                      >
                        <span class="hyper-glass-knob"></span>
                      </button>
                    </label>
                    <label class="pro-field compact item-toggle-field">
                      <span class="micro-label">Show Borders</span>
                      <button
                        type="button"
                        class={`hyper-glass-toggle ${showMetricBorders ? 'on' : ''}`}
                        role="switch"
                        aria-checked={showMetricBorders}
                        aria-label="Show metric box borders"
                        on:click={() => updateWidget(selectedId, { options: { metricBoxBorder: !showMetricBorders } })}
                      >
                        <span class="hyper-glass-knob"></span>
                      </button>
                    </label>
                  </div>
                  <div class="appearance-two-col color-row">
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Box Background</span>
                      <div class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor(widget?.options?.metricBoxBackgroundColor, '#0a1018')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { metricBoxBackgroundColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor(widget?.options?.metricBoxBackgroundColor, '#0a1018')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { metricBoxBackgroundColor: (e.target as HTMLInputElement).value } })}
                        />
                      </div>
                    </label>
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Border Color</span>
                      <div class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor(widget?.options?.metricBoxBorderColor, '#6aa8ff')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { metricBoxBorderColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor(widget?.options?.metricBoxBorderColor, '#6aa8ff')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { metricBoxBorderColor: (e.target as HTMLInputElement).value } })}
                        />
                      </div>
                    </label>
                  </div>
                  <div class="metric-grid-geometry-bar">
                    <div class="metric-grid-geometry-segment metric-grid-geometry-segment-width group">
                      <span class="metric-grid-geometry-label">W</span>
                      <input
                        class="metric-grid-geometry-input"
                        type="number"
                        min="0"
                        max="600"
                        value={Number((widget?.options?.metricBoxWidth as number) ?? 0)}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { metricBoxWidth: Number((e.target as HTMLInputElement).value) } })}
                      />
                    </div>
                    <div class="metric-grid-geometry-segment group">
                      <span class="metric-grid-geometry-label">H</span>
                      <input
                        class="metric-grid-geometry-input"
                        type="number"
                        min="24"
                        max="220"
                        value={Number((widget?.options?.metricBoxHeight as number) ?? 52)}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { metricBoxHeight: Number((e.target as HTMLInputElement).value) } })}
                      />
                    </div>
                  </div>
                </div>
                <TypographyControl
                  label="Metric Value"
                  summary={getTypographyDisplay(widget, 'metricValue', 'size')}
                  fontValue={isTypographyInherited(widget, 'metricValue', 'font') ? '' : String(getTypographyRaw(widget, 'metricValue', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'metricValue', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'metricValue', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'metricValue', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'metricValue', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'metricValue', 'size')}
                  sizeMin={8}
                  sizeMax={48}
                  colorValue={getTypographyColor(widget, 'metricValue')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'metricValue', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'metricValue', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'metricValue', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'metricValue', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'metricValue', 'color', '')}
                />
                <TypographyControl
                  label="Metric Label"
                  summary={getTypographyDisplay(widget, 'metricLabel', 'size')}
                  fontValue={isTypographyInherited(widget, 'metricLabel', 'font') ? '' : String(getTypographyRaw(widget, 'metricLabel', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'metricLabel', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'metricLabel', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'metricLabel', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'metricLabel', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'metricLabel', 'size')}
                  sizeMin={8}
                  sizeMax={48}
                  colorValue={getTypographyColor(widget, 'metricLabel')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'metricLabel', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'metricLabel', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'metricLabel', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'metricLabel', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'metricLabel', 'color', '')}
                />
              </details>
            {/if}

            {#if supportsMetricBoxes(widget) && widget?.kind !== 'plex' && widget?.kind !== 'history' && widget?.source !== 'media-history' && (widget?.kind as string) !== 'stat' && widget?.source !== 'seerr-requests' && widget?.source !== 'technitium'}
              <div class="settings-group">
                <p class="field-title">Metric Boxes</p>
                <label class="checkbox">
                  <input
                    type="checkbox"
                    checked={(widget?.options?.metricBoxes as boolean) ?? true}
                    on:change={(e) =>
                      updateWidget(selectedId, { options: { metricBoxes: (e.target as HTMLInputElement).checked } })
                    }
                  />
                  Show boxes
                </label>
                {#if (widget?.options?.metricBoxes as boolean) ?? true}
                  <label>
                    Box background
                    <input
                      type="color"
                      value={normalizeHexColor(widget?.options?.metricBoxBackgroundColor, '#0a1018')}
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { metricBoxBackgroundColor: (e.target as HTMLInputElement).value } })
                      }
                    />
                  </label>
                {/if}
                <label class="checkbox">
                  <input
                    type="checkbox"
                    checked={(widget?.options?.metricBoxBorder as boolean) ?? true}
                    on:change={(e) =>
                      updateWidget(selectedId, { options: { metricBoxBorder: (e.target as HTMLInputElement).checked } })
                    }
                  />
                  Show box borders
                </label>
                {#if ((widget?.options?.metricBoxBorder as boolean) ?? true)}
                  <label>
                    Border Color
                    <input
                      type="color"
                      value={normalizeHexColor(widget?.options?.metricBoxBorderColor, '#ffffff')}
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { metricBoxBorderColor: (e.target as HTMLInputElement).value } })
                      }
                    />
                  </label>
                  <label>
                    Border Style
                    <select
                      value={(widget?.options?.metricBoxBorderStyle as string) ?? 'solid'}
                      on:change={(e) =>
                        updateWidget(selectedId, { options: { metricBoxBorderStyle: (e.target as HTMLSelectElement).value } })
                      }
                    >
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="glow">Glow</option>
                    </select>
                  </label>
                {/if}
                <label>
                  Metric Box Width (px, 0 = auto)
                  <input
                    type="number"
                    min="0"
                    max="600"
                    value={Number((widget?.options?.metricBoxWidth as number) ?? 0)}
                    on:input={(e) =>
                      updateWidget(selectedId, { options: { metricBoxWidth: Number((e.target as HTMLInputElement).value) } })
                    }
                  />
                </label>
                <label>
                  Metric Box Height (px)
                  <input
                    type="number"
                    min="24"
                    max="220"
                    value={Number((widget?.options?.metricBoxHeight as number) ?? 52)}
                    on:input={(e) =>
                      updateWidget(selectedId, { options: { metricBoxHeight: Number((e.target as HTMLInputElement).value) } })
                    }
                  />
                </label>
              </div>

              <TypographyControl
                label="Metric Value Typography"
                summary={getTypographyDisplay(widget, 'metricValue', 'size')}
                fontValue={isTypographyInherited(widget, 'metricValue', 'font') ? '' : String(getTypographyRaw(widget, 'metricValue', 'font') ?? '')}
                fontInherited={isTypographyInherited(widget, 'metricValue', 'font')}
                fontDisplay={getTypographyDisplay(widget, 'metricValue', 'font')}
                fontOptions={typographyFontOptions}
                weightValue={getTypographyNumeric(widget, 'metricValue', 'weight')}
                weightInherited={isTypographyInherited(widget, 'metricValue', 'weight')}
                sizeValue={getTypographyNumeric(widget, 'metricValue', 'size')}
                sizeMin={8}
                sizeMax={48}
                colorValue={getTypographyColor(widget, 'metricValue')}
                on:font={(e) => setTypographyField(widget, 'metricValue', 'font', e.detail)}
                on:weight={(e) => setTypographyField(widget, 'metricValue', 'weight', e.detail)}
                on:size={(e) => setTypographyField(widget, 'metricValue', 'size', e.detail)}
                on:color={(e) => setTypographyField(widget, 'metricValue', 'color', e.detail)}
                on:colorReset={() => setTypographyField(widget, 'metricValue', 'color', '')}
              />

              <TypographyControl
                label="Metric Label Typography"
                summary={getTypographyDisplay(widget, 'metricLabel', 'size')}
                fontValue={isTypographyInherited(widget, 'metricLabel', 'font') ? '' : String(getTypographyRaw(widget, 'metricLabel', 'font') ?? '')}
                fontInherited={isTypographyInherited(widget, 'metricLabel', 'font')}
                fontDisplay={getTypographyDisplay(widget, 'metricLabel', 'font')}
                fontOptions={typographyFontOptions}
                weightValue={getTypographyNumeric(widget, 'metricLabel', 'weight')}
                weightInherited={isTypographyInherited(widget, 'metricLabel', 'weight')}
                sizeValue={getTypographyNumeric(widget, 'metricLabel', 'size')}
                sizeMin={8}
                sizeMax={48}
                colorValue={getTypographyColor(widget, 'metricLabel')}
                on:font={(e) => setTypographyField(widget, 'metricLabel', 'font', e.detail)}
                on:weight={(e) => setTypographyField(widget, 'metricLabel', 'weight', e.detail)}
                on:size={(e) => setTypographyField(widget, 'metricLabel', 'size', e.detail)}
                on:color={(e) => setTypographyField(widget, 'metricLabel', 'color', e.detail)}
                on:colorReset={() => setTypographyField(widget, 'metricLabel', 'color', '')}
              />
            {/if}

            {#if widget?.kind === 'grafana' || widget?.source === 'grafana'}
              <div class="settings-group">
                <p class="field-title">Grafana Graph</p>
                <label>
                  Display Mode
                  <select
                    value={(widget?.options?.grafanaMode as string) === 'image' ? 'image' : 'interactive'}
                    on:change={(e) =>
                      updateWidget(selectedId, { options: { grafanaMode: (e.target as HTMLSelectElement).value } })
                    }
                  >
                    <option value="interactive">Interactive (iframe)</option>
                    <option value="image">Rendered Image (faster)</option>
                  </select>
                </label>
                <label>
                  Refresh Interval (seconds)
                  <input
                    type="number"
                    min="5"
                    max="3600"
                    value={Number((widget?.options?.grafanaRefreshSec as number) ?? 60)}
                    on:input={(e) =>
                      updateWidget(selectedId, { options: { grafanaRefreshSec: Number((e.target as HTMLInputElement).value) } })
                    }
                  />
                </label>
                <label>
                  Timeframe
                  <select
                    value={(widget?.options?.grafanaTimeframe as string) ?? '24h'}
                    on:change={(e) =>
                      updateWidget(selectedId, { options: { grafanaTimeframe: (e.target as HTMLSelectElement).value } })
                    }
                  >
                    <option value="1h">Last 1 hour</option>
                    <option value="6h">Last 6 hours</option>
                    <option value="12h">Last 12 hours</option>
                    <option value="24h">Last 24 hours</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                {#if ((widget?.options?.grafanaTimeframe as string) ?? '24h') === 'custom'}
                  <label>
                    Custom From
                    <input
                      type="text"
                      value={(widget?.options?.grafanaFrom as string) ?? 'now-24h'}
                      placeholder="now-24h"
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { grafanaFrom: (e.target as HTMLInputElement).value } })
                      }
                    />
                  </label>
                  <label>
                    Custom To
                    <input
                      type="text"
                      value={(widget?.options?.grafanaTo as string) ?? 'now'}
                      placeholder="now"
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { grafanaTo: (e.target as HTMLInputElement).value } })
                      }
                    />
                  </label>
                {/if}
                <label>
                  Theme
                  <select
                    value={(widget?.options?.grafanaTheme as string) ?? 'dark'}
                    on:change={(e) =>
                      updateWidget(selectedId, { options: { grafanaTheme: (e.target as HTMLSelectElement).value } })
                    }
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="current">Current</option>
                  </select>
                </label>
              </div>
            {/if}

            {#if widget?.kind === 'speedtest'}
              <details class="appearance-collapsible" open>
                <summary>Graph Style</summary>
                <div class="appearance-collapsible-body">
                  <div class="speedtest-toggle-grid">
                    <label class="pro-field compact item-toggle-field">
                      <span>Smooth Curves</span>
                      <button
                        type="button"
                        class={`hyper-glass-toggle ${((widget?.options?.speedtestSmoothCurves as boolean) ?? true) ? 'on' : ''}`}
                        role="switch"
                        aria-checked={((widget?.options?.speedtestSmoothCurves as boolean) ?? true)}
                        aria-label="Smooth curves"
                        on:click={() =>
                          updateWidget(selectedId, { options: { speedtestSmoothCurves: !((widget?.options?.speedtestSmoothCurves as boolean) ?? true) } })}
                      >
                        <span class="hyper-glass-knob"></span>
                      </button>
                    </label>
                    <label class="pro-field compact item-toggle-field">
                      <span>Show Data Points</span>
                      <button
                        type="button"
                        class={`hyper-glass-toggle ${((widget?.options?.speedtestShowPoints as boolean) ?? true) ? 'on' : ''}`}
                        role="switch"
                        aria-checked={((widget?.options?.speedtestShowPoints as boolean) ?? true)}
                        aria-label="Show data points"
                        on:click={() =>
                          updateWidget(selectedId, { options: { speedtestShowPoints: !((widget?.options?.speedtestShowPoints as boolean) ?? true) } })}
                      >
                        <span class="hyper-glass-knob"></span>
                      </button>
                    </label>
                    <label class="pro-field compact item-toggle-field">
                      <span>Show Grid</span>
                      <button
                        type="button"
                        class={`hyper-glass-toggle ${((widget?.options?.speedtestShowGrid as boolean) ?? true) ? 'on' : ''}`}
                        role="switch"
                        aria-checked={((widget?.options?.speedtestShowGrid as boolean) ?? true)}
                        aria-label="Show grid"
                        on:click={() =>
                          updateWidget(selectedId, { options: { speedtestShowGrid: !((widget?.options?.speedtestShowGrid as boolean) ?? true) } })}
                      >
                        <span class="hyper-glass-knob"></span>
                      </button>
                    </label>
                    <label class="pro-field compact item-toggle-field">
                      <span>Auto Y-Axis</span>
                      <button
                        type="button"
                        class={`hyper-glass-toggle ${((widget?.options?.speedtestAutoYAxis as boolean) ?? true) ? 'on' : ''}`}
                        role="switch"
                        aria-checked={((widget?.options?.speedtestAutoYAxis as boolean) ?? true)}
                        aria-label="Auto y-axis"
                        on:click={() =>
                          updateWidget(selectedId, { options: { speedtestAutoYAxis: !((widget?.options?.speedtestAutoYAxis as boolean) ?? true) } })}
                      >
                        <span class="hyper-glass-knob"></span>
                      </button>
                    </label>
                  </div>
                  <div class="appearance-two-col color-row">
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Download Color</span>
                      <div class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor(widget?.options?.speedtestDownloadColor, '#1f82ff')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { speedtestDownloadColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor(widget?.options?.speedtestDownloadColor, '#1f82ff')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { speedtestDownloadColor: (e.target as HTMLInputElement).value } })}
                        />
                      </div>
                    </label>
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Upload Color</span>
                      <div class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor(widget?.options?.speedtestUploadColor, '#9c4dff')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { speedtestUploadColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor(widget?.options?.speedtestUploadColor, '#9c4dff')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { speedtestUploadColor: (e.target as HTMLInputElement).value } })}
                        />
                      </div>
                    </label>
                  </div>
                  <div class="speedtest-slider-stack">
                    <label>
                      Curve Thickness ({Number((widget?.options?.speedtestCurveThickness as number) ?? 2.2).toFixed(1)})
                      <input
                        type="range"
                        min="1"
                        max="8"
                        step="0.1"
                        value={Number((widget?.options?.speedtestCurveThickness as number) ?? 2.2)}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { speedtestCurveThickness: Number((e.target as HTMLInputElement).value) } })}
                      />
                    </label>
                    <label>
                      Point Size ({Number((widget?.options?.speedtestPointSize as number) ?? 3.2).toFixed(1)})
                      <input
                        type="range"
                        min="0.5"
                        max="10"
                        step="0.1"
                        value={Number((widget?.options?.speedtestPointSize as number) ?? 3.2)}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { speedtestPointSize: Number((e.target as HTMLInputElement).value) } })}
                      />
                    </label>
                  </div>
                </div>
              </details>

              <details class="appearance-collapsible">
                <summary>Axis Configuration</summary>
                <div class="appearance-collapsible-body">
                  <div class="appearance-two-col">
                    <label class="pro-field compact">
                      <span class="micro-label">X-Axis Ticks</span>
                      <input
                        type="number"
                        min="2"
                        max="8"
                        value={Number((widget?.options?.speedtestXTicks as number) ?? 3)}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { speedtestXTicks: Number((e.target as HTMLInputElement).value) } })}
                      />
                    </label>
                    <label class="pro-field compact">
                      <span class="micro-label">Y-Axis Ticks</span>
                      <input
                        type="number"
                        min="3"
                        max="10"
                        value={Number((widget?.options?.speedtestYTicks as number) ?? 6)}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { speedtestYTicks: Number((e.target as HTMLInputElement).value) } })}
                      />
                    </label>
                  </div>
                  <div class="appearance-two-col">
                    <label class="pro-field compact">
                      <span class="micro-label">Label Frequency</span>
                      <select
                        value={String((widget?.options?.speedtestXTickEvery as number) ?? 1)}
                        on:change={(e) =>
                          updateWidget(selectedId, { options: { speedtestXTickEvery: Number((e.target as HTMLSelectElement).value) } })}
                      >
                        <option value="1">Every point</option>
                        <option value="2">Every other</option>
                        <option value="3">Every 3rd</option>
                        <option value="4">Every 4th</option>
                        <option value="6">Every 6th</option>
                      </select>
                    </label>
                    <label class="pro-field compact">
                      <span class="micro-label">Tick Labels</span>
                      <select
                        value={(widget?.options?.speedtestXTickFormat as string) ?? 'date-time'}
                        on:change={(e) =>
                          updateWidget(selectedId, { options: { speedtestXTickFormat: (e.target as HTMLSelectElement).value } })}
                      >
                        <option value="date-time">Date + Time</option>
                        <option value="date">Date only</option>
                        <option value="time">Time only</option>
                      </select>
                    </label>
                  </div>
                  {#if ((widget?.options?.speedtestAutoYAxis as boolean) ?? true) === false}
                    <div class="appearance-two-col">
                      <label class="pro-field compact">
                        <span class="micro-label">Y Min</span>
                        <input
                          type="number"
                          value={Number((widget?.options?.speedtestYAxisMin as number) ?? 0)}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { speedtestYAxisMin: Number((e.target as HTMLInputElement).value) } })}
                        />
                      </label>
                      <label class="pro-field compact">
                        <span class="micro-label">Y Max</span>
                        <input
                          type="number"
                          value={Number((widget?.options?.speedtestYAxisMax as number) ?? 1000)}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { speedtestYAxisMax: Number((e.target as HTMLInputElement).value) } })}
                        />
                      </label>
                    </div>
                  {/if}
                  <TypographyControl
                    label="Axis Label Font"
                    summary={`${Number((widget?.options?.speedtestAxisSize as number) ?? 11)}px`}
                    fontValue={(widget?.options?.speedtestAxisFont as string) ?? ''}
                    fontInherited={false}
                    fontDisplay={(widget?.options?.speedtestAxisFont as string) || 'Global Default'}
                    fontOptions={typographyFontOptions}
                    weightValue={Number((widget?.options?.speedtestAxisWeight as number) ?? 500)}
                    weightInherited={false}
                    sizeValue={Number((widget?.options?.speedtestAxisSize as number) ?? 11)}
                    sizeMin={8}
                    sizeMax={24}
                    colorValue={normalizeHexColor(widget?.options?.speedtestAxisColor, '#b3c7e4')}
                    open={false}
                    on:font={(e) => updateWidget(selectedId, { options: { speedtestAxisFont: e.detail } })}
                    on:weight={(e) => updateWidget(selectedId, { options: { speedtestAxisWeight: e.detail } })}
                    on:size={(e) => updateWidget(selectedId, { options: { speedtestAxisSize: e.detail } })}
                    on:color={(e) => updateWidget(selectedId, { options: { speedtestAxisColor: e.detail } })}
                    on:colorReset={() => updateWidget(selectedId, { options: { speedtestAxisColor: '' } })}
                  />
                </div>
              </details>

              <details class="appearance-collapsible">
                <summary>Table Styling</summary>
                <div class="appearance-collapsible-body">
                  {#if ((widget?.options?.speedtestShowTable as boolean) ?? true)}
                    <div class="appearance-two-col color-row">
                      <label class="pro-field compact color-field">
                        <span class="micro-label">Header Color</span>
                        <div class="metric-grid-color-well">
                          <input
                            class="metric-grid-color-swatch"
                            type="color"
                            value={normalizeHexColor(widget?.options?.speedtestTableHeaderColor, '#6fa9ff')}
                            on:input={(e) =>
                              updateWidget(selectedId, { options: { speedtestTableHeaderColor: (e.target as HTMLInputElement).value } })}
                          />
                          <input
                            class="metric-grid-color-text"
                            type="text"
                            value={normalizeHexColor(widget?.options?.speedtestTableHeaderColor, '#6fa9ff')}
                            maxlength="7"
                            on:input={(e) =>
                              updateWidget(selectedId, { options: { speedtestTableHeaderColor: (e.target as HTMLInputElement).value } })}
                          />
                        </div>
                      </label>
                      <label class="pro-field compact color-field">
                        <span class="micro-label">Body Color</span>
                        <div class="metric-grid-color-well">
                          <input
                            class="metric-grid-color-swatch"
                            type="color"
                            value={normalizeHexColor(widget?.options?.speedtestTableBodyColor, '#d9e6fb')}
                            on:input={(e) =>
                              updateWidget(selectedId, { options: { speedtestTableBodyColor: (e.target as HTMLInputElement).value } })}
                          />
                          <input
                            class="metric-grid-color-text"
                            type="text"
                            value={normalizeHexColor(widget?.options?.speedtestTableBodyColor, '#d9e6fb')}
                            maxlength="7"
                            on:input={(e) =>
                              updateWidget(selectedId, { options: { speedtestTableBodyColor: (e.target as HTMLInputElement).value } })}
                          />
                        </div>
                      </label>
                    </div>
                    <div class="appearance-two-col">
                      <TypographyControl
                        label="Header Font"
                        summary={`${Number((widget?.options?.speedtestTableHeaderSize as number) ?? 15)}px`}
                        fontValue={(widget?.options?.speedtestTableHeaderFont as string) ?? ''}
                        fontInherited={false}
                        fontDisplay={(widget?.options?.speedtestTableHeaderFont as string) || 'Global Default'}
                        fontOptions={typographyFontOptions}
                        weightValue={Number((widget?.options?.speedtestTableHeaderWeight as number) ?? 600)}
                        weightInherited={false}
                        sizeValue={Number((widget?.options?.speedtestTableHeaderSize as number) ?? 15)}
                        sizeMin={9}
                        sizeMax={28}
                        colorValue={normalizeHexColor(widget?.options?.speedtestTableHeaderColor, '#6fa9ff')}
                        open={false}
                        on:font={(e) => updateWidget(selectedId, { options: { speedtestTableHeaderFont: e.detail } })}
                        on:weight={(e) => updateWidget(selectedId, { options: { speedtestTableHeaderWeight: e.detail } })}
                        on:size={(e) => updateWidget(selectedId, { options: { speedtestTableHeaderSize: e.detail } })}
                        on:color={(e) => updateWidget(selectedId, { options: { speedtestTableHeaderColor: e.detail } })}
                        on:colorReset={() => updateWidget(selectedId, { options: { speedtestTableHeaderColor: '' } })}
                      />
                      <TypographyControl
                        label="Body Font"
                        summary={`${Number((widget?.options?.speedtestTableBodySize as number) ?? 15)}px`}
                        fontValue={(widget?.options?.speedtestTableBodyFont as string) ?? ''}
                        fontInherited={false}
                        fontDisplay={(widget?.options?.speedtestTableBodyFont as string) || 'Global Default'}
                        fontOptions={typographyFontOptions}
                        weightValue={Number((widget?.options?.speedtestTableBodyWeight as number) ?? 500)}
                        weightInherited={false}
                        sizeValue={Number((widget?.options?.speedtestTableBodySize as number) ?? 15)}
                        sizeMin={9}
                        sizeMax={28}
                        colorValue={normalizeHexColor(widget?.options?.speedtestTableBodyColor, '#d9e6fb')}
                        open={false}
                        on:font={(e) => updateWidget(selectedId, { options: { speedtestTableBodyFont: e.detail } })}
                        on:weight={(e) => updateWidget(selectedId, { options: { speedtestTableBodyWeight: e.detail } })}
                        on:size={(e) => updateWidget(selectedId, { options: { speedtestTableBodySize: e.detail } })}
                        on:color={(e) => updateWidget(selectedId, { options: { speedtestTableBodyColor: e.detail } })}
                        on:colorReset={() => updateWidget(selectedId, { options: { speedtestTableBodyColor: '' } })}
                      />
                    </div>
                  {:else}
                    <div class="editor-empty seerr-style-empty">Enable table in Content to style table typography.</div>
                  {/if}
                </div>
              </details>
            {/if}

            {#if widget?.source === 'prowlarr' || widget?.kind === 'prowlarr'}
              <div class="settings-group">
                <p class="field-title">Prowlarr List</p>
                <label>
                  Sort
                  <select
                    value={(widget?.options?.prowlarrSort as string) === 'enabled' ? 'enabled' : 'alphabetical'}
                    on:change={(e) =>
                      updateWidget(selectedId, { options: { prowlarrSort: (e.target as HTMLSelectElement).value } })
                    }
                  >
                    <option value="alphabetical">Alphabetical</option>
                    <option value="enabled">Enabled First</option>
                  </select>
                </label>
                <label>
                  Collapse After
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={Number((widget?.options?.collapseAfter as number) ?? 5)}
                    on:input={(e) =>
                      updateWidget(selectedId, { options: { collapseAfter: Number((e.target as HTMLInputElement).value) } })
                    }
                  />
                </label>
                <label class="checkbox">
                  <input
                    type="checkbox"
                    checked={(widget?.options?.showHealthColumn as boolean) ?? true}
                    on:change={(e) =>
                      updateWidget(selectedId, { options: { showHealthColumn: (e.target as HTMLInputElement).checked } })
                    }
                  />
                  Show health status column
                </label>
              </div>
            {/if}

            {#if widget?.kind === 'sabnzbd'}
              <div class="settings-group">
                <p class="field-title">Downloaders View</p>
                <label class="checkbox">
                  <input
                    type="checkbox"
                    checked={(widget?.options?.showHistory as boolean) ?? true}
                    on:change={(e) =>
                      updateWidget(selectedId, { options: { showHistory: (e.target as HTMLInputElement).checked } })
                    }
                  />
                  Show recent history
                </label>
                <label>
                  Queue Items
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={Number((widget?.options?.queueLimit as number) ?? 8)}
                    on:input={(e) =>
                      updateWidget(selectedId, { options: { queueLimit: Number((e.target as HTMLInputElement).value) } })
                    }
                  />
                </label>
                <label>
                  History Items
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={Number((widget?.options?.historyLimit as number) ?? 8)}
                    on:input={(e) =>
                      updateWidget(selectedId, { options: { historyLimit: Number((e.target as HTMLInputElement).value) } })
                    }
                  />
                </label>
              </div>
            {/if}

            {#if widget?.kind === 'systemMonitor'}
              {@const systemLayoutMode = getSystemMonitorDisplay(widget) === 'compact' ? 'grid' : 'linear'}
              <details class="content-subaccordion" open>
                <summary>Layout & Geometry</summary>
                <div class="settings-group">
                  <div class="dns-chart-layout-grid">
                    <label class="pro-field compact dns-chart-layout-field">
                      <span class="micro-label">Layout Style</span>
                      <select
                        value={systemLayoutMode}
                        on:change={(e) =>
                          updateWidget(selectedId, {
                            options: {
                              monitorDisplay: (e.target as HTMLSelectElement).value === 'grid' ? 'compact' : 'linear'
                            }
                          })}
                      >
                        <option value="linear">Linear</option>
                        <option value="grid">Grid</option>
                      </select>
                    </label>
                    <label class="pro-field compact dns-chart-layout-field">
                      <span class="micro-label">Orientation</span>
                      <select
                        value={(widget?.options?.monitorSystemOrientation as string) === 'stacked' ? 'stacked' : 'side-by-side'}
                        on:change={(e) =>
                          updateWidget(selectedId, {
                            options: { monitorSystemOrientation: (e.target as HTMLSelectElement).value }
                          })}
                      >
                        <option value="stacked">Stacked</option>
                        <option value="side-by-side">Split</option>
                      </select>
                    </label>
                  </div>
                  <div class="appearance-two-col item-styling-grid">
                    <label class="pro-field compact item-toggle-field">
                      <span class="micro-label">Show Node IP</span>
                      <button
                        type="button"
                        class={`hyper-glass-toggle ${((widget?.options?.monitorShowNodeIp as boolean) !== false) ? 'on' : ''}`}
                        role="switch"
                        aria-checked={((widget?.options?.monitorShowNodeIp as boolean) !== false)}
                        aria-label="Show node IP"
                        on:click={() =>
                          updateWidget(selectedId, {
                            options: { monitorShowNodeIp: !((widget?.options?.monitorShowNodeIp as boolean) !== false) }
                          })}
                      >
                        <span class="hyper-glass-knob"></span>
                      </button>
                    </label>
                    <label class="pro-field compact item-toggle-field">
                      <span class="micro-label">Show Container ID</span>
                      <button
                        type="button"
                        class={`hyper-glass-toggle ${((widget?.options?.monitorHideUptime as boolean) === false) ? 'on' : ''}`}
                        role="switch"
                        aria-checked={((widget?.options?.monitorHideUptime as boolean) === false)}
                        aria-label="Show container id"
                        on:click={() =>
                          updateWidget(selectedId, {
                            options: { monitorHideUptime: !((widget?.options?.monitorHideUptime as boolean) === false) }
                          })}
                      >
                        <span class="hyper-glass-knob"></span>
                      </button>
                    </label>
                    <label class="pro-field compact item-toggle-field">
                      <span class="micro-label">Show Icons</span>
                      <button
                        type="button"
                        class={`hyper-glass-toggle ${((widget?.options?.monitorShowMetricIcons as boolean) !== false) ? 'on' : ''}`}
                        role="switch"
                        aria-checked={((widget?.options?.monitorShowMetricIcons as boolean) !== false)}
                        aria-label="Show icons"
                        on:click={() =>
                          updateWidget(selectedId, {
                            options: { monitorShowMetricIcons: !((widget?.options?.monitorShowMetricIcons as boolean) !== false) }
                          })}
                      >
                        <span class="hyper-glass-knob"></span>
                      </button>
                    </label>
                    <label class="pro-field compact item-toggle-field">
                      <span class="micro-label">Elastic Auto-Height</span>
                      <button
                        type="button"
                        class={`hyper-glass-toggle ${((widget?.options?.monitorAutoHeight as boolean) !== false) ? 'on' : ''}`}
                        role="switch"
                        aria-checked={((widget?.options?.monitorAutoHeight as boolean) !== false)}
                        aria-label="Elastic auto-height"
                        on:click={() =>
                          updateWidget(selectedId, {
                            options: { monitorAutoHeight: !((widget?.options?.monitorAutoHeight as boolean) !== false) }
                          })}
                      >
                        <span class="hyper-glass-knob"></span>
                      </button>
                    </label>
                  </div>
                  <label>
                    Bar Height ({Number((widget?.options?.monitorLinearBarHeight as number) ?? 12)}px)
                    <input
                      type="range"
                      min="4"
                      max="32"
                      step="1"
                      value={Number((widget?.options?.monitorLinearBarHeight as number) ?? 12)}
                      on:input={(e) =>
                        updateWidget(selectedId, {
                          options: { monitorLinearBarHeight: Number((e.target as HTMLInputElement).value) }
                        })}
                    />
                  </label>
                  <label>
                    Node Gap ({Number((widget?.options?.monitorLinearNodeGap as number) ?? 0)}px)
                    <input
                      type="range"
                      min="0"
                      max="80"
                      step="1"
                      value={Number((widget?.options?.monitorLinearNodeGap as number) ?? 0)}
                      on:input={(e) =>
                        updateWidget(selectedId, {
                          options: { monitorLinearNodeGap: Number((e.target as HTMLInputElement).value) }
                        })}
                    />
                  </label>
                  <label>
                    Vertical Offset ({Number((widget?.options?.monitorVitalsOffsetY as number) ?? 0)}px)
                    <input
                      type="range"
                      min="-120"
                      max="120"
                      step="1"
                      value={Number((widget?.options?.monitorVitalsOffsetY as number) ?? 0)}
                      on:input={(e) =>
                        updateWidget(selectedId, {
                          options: { monitorVitalsOffsetY: Number((e.target as HTMLInputElement).value) }
                        })}
                    />
                  </label>
                </div>
              </details>

              <details class="content-subaccordion">
                <summary>Bar Styling</summary>
                <div class="settings-group">
                  <p class="appearance-subheader">Gradient & Colors</p>
                  <div class="appearance-two-col color-row">
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Track Color</span>
                      <div class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor((widget?.options?.monitorLinearTrackColor as string) ?? '#243041', '#243041')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { monitorLinearTrackColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor((widget?.options?.monitorLinearTrackColor as string) ?? '#243041', '#243041')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { monitorLinearTrackColor: (e.target as HTMLInputElement).value } })}
                        />
                      </div>
                    </label>
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Stripe Color</span>
                      <div class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor((widget?.options?.monitorLinearStripeColor as string) ?? '#ffffff', '#ffffff')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { monitorLinearStripeColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor((widget?.options?.monitorLinearStripeColor as string) ?? '#ffffff', '#ffffff')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { monitorLinearStripeColor: (e.target as HTMLInputElement).value } })}
                        />
                      </div>
                    </label>
                  </div>
                  <div class="appearance-three-col color-row">
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Fill Start</span>
                      <div class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor((widget?.options?.monitorLinearFillStartColor as string) ?? '#43b9ff', '#43b9ff')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { monitorLinearFillStartColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor((widget?.options?.monitorLinearFillStartColor as string) ?? '#43b9ff', '#43b9ff')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { monitorLinearFillStartColor: (e.target as HTMLInputElement).value } })}
                        />
                      </div>
                    </label>
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Fill Mid</span>
                      <div class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor((widget?.options?.monitorLinearFillMidColor as string) ?? '#7d75ff', '#7d75ff')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { monitorLinearFillMidColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor((widget?.options?.monitorLinearFillMidColor as string) ?? '#7d75ff', '#7d75ff')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { monitorLinearFillMidColor: (e.target as HTMLInputElement).value } })}
                        />
                      </div>
                    </label>
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Fill End</span>
                      <div class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor((widget?.options?.monitorLinearFillEndColor as string) ?? '#ff6778', '#ff6778')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { monitorLinearFillEndColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor((widget?.options?.monitorLinearFillEndColor as string) ?? '#ff6778', '#ff6778')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { monitorLinearFillEndColor: (e.target as HTMLInputElement).value } })}
                        />
                      </div>
                    </label>
                  </div>
                  <div class="appearance-two-col color-row">
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Icon Background</span>
                      <div class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor((widget?.options?.monitorLinearIconBgColor as string) ?? '#182332', '#182332')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { monitorLinearIconBgColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor((widget?.options?.monitorLinearIconBgColor as string) ?? '#182332', '#182332')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { monitorLinearIconBgColor: (e.target as HTMLInputElement).value } })}
                        />
                      </div>
                    </label>
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Icon Border</span>
                      <div class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor((widget?.options?.monitorLinearIconBorderColor as string) ?? '#54657a', '#54657a')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { monitorLinearIconBorderColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor((widget?.options?.monitorLinearIconBorderColor as string) ?? '#54657a', '#54657a')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { monitorLinearIconBorderColor: (e.target as HTMLInputElement).value } })}
                        />
                      </div>
                    </label>
                  </div>
                  <label>
                    Warning Threshold ({Number((widget?.options?.monitorWarnThreshold as number) ?? 75)}%)
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={Number((widget?.options?.monitorWarnThreshold as number) ?? 75)}
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { monitorWarnThreshold: Number((e.target as HTMLInputElement).value) } })}
                    />
                  </label>
                  <label>
                    Critical Threshold ({Number((widget?.options?.monitorCriticalThreshold as number) ?? 90)}%)
                    <input
                      type="range"
                      min={Number((widget?.options?.monitorWarnThreshold as number) ?? 75)}
                      max="100"
                      step="1"
                      value={Number((widget?.options?.monitorCriticalThreshold as number) ?? 90)}
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { monitorCriticalThreshold: Number((e.target as HTMLInputElement).value) } })}
                    />
                  </label>
                  <label class="pro-field compact item-toggle-field">
                    <span class="micro-label">Neon Pulse on Critical</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle ${((widget?.options?.monitorCriticalPulse as boolean) !== false) ? 'on' : ''}`}
                      role="switch"
                      aria-checked={((widget?.options?.monitorCriticalPulse as boolean) !== false)}
                      aria-label="Neon pulse on critical"
                      on:click={() =>
                        updateWidget(selectedId, {
                          options: { monitorCriticalPulse: !((widget?.options?.monitorCriticalPulse as boolean) !== false) }
                        })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </label>
                </div>
              </details>

              <details class="content-subaccordion">
                <summary>Typography</summary>
                <TypographyControl
                  label="Host Label"
                  summary={getTypographyDisplay(widget, 'monitorName', 'size')}
                  fontValue={isTypographyInherited(widget, 'monitorName', 'font') ? '' : String(getTypographyRaw(widget, 'monitorName', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'monitorName', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'monitorName', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'monitorName', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'monitorName', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'monitorName', 'size')}
                  sizeMin={8}
                  sizeMax={42}
                  colorValue={getTypographyColor(widget, 'monitorName')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'monitorName', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'monitorName', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'monitorName', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'monitorName', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'monitorName', 'color', '')}
                />
                <TypographyControl
                  label="Metric Label"
                  summary={getTypographyDisplay(widget, 'monitorLatency', 'size')}
                  fontValue={isTypographyInherited(widget, 'monitorLatency', 'font') ? '' : String(getTypographyRaw(widget, 'monitorLatency', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'monitorLatency', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'monitorLatency', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'monitorLatency', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'monitorLatency', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'monitorLatency', 'size')}
                  sizeMin={8}
                  sizeMax={36}
                  colorValue={getTypographyColor(widget, 'monitorLatency')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'monitorLatency', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'monitorLatency', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'monitorLatency', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'monitorLatency', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'monitorLatency', 'color', '')}
                />
                <TypographyControl
                  label="Metric Value"
                  summary={getTypographyDisplay(widget, 'monitorPrimary', 'size')}
                  fontValue={isTypographyInherited(widget, 'monitorPrimary', 'font') ? '' : String(getTypographyRaw(widget, 'monitorPrimary', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'monitorPrimary', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'monitorPrimary', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'monitorPrimary', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'monitorPrimary', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'monitorPrimary', 'size')}
                  sizeMin={10}
                  sizeMax={80}
                  colorValue={getTypographyColor(widget, 'monitorPrimary')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'monitorPrimary', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'monitorPrimary', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'monitorPrimary', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'monitorPrimary', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'monitorPrimary', 'color', '')}
                />
                <TypographyControl
                  label="Unit Label"
                  summary={getTypographyDisplay(widget, 'monitorUnit', 'size')}
                  fontValue={isTypographyInherited(widget, 'monitorUnit', 'font') ? '' : String(getTypographyRaw(widget, 'monitorUnit', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'monitorUnit', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'monitorUnit', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'monitorUnit', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'monitorUnit', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'monitorUnit', 'size')}
                  sizeMin={8}
                  sizeMax={48}
                  colorValue={getTypographyColor(widget, 'monitorUnit')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'monitorUnit', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'monitorUnit', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'monitorUnit', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'monitorUnit', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'monitorUnit', 'color', '')}
                />
              </details>
            {/if}

            {#if widget?.kind === 'monitor'}
              <p class="field-title">Layout & Geometry</p>
              <div class="settings-group monitor-appearance-geometry">
                <label>
                  Grid Columns
                  <input
                    type="number"
                    min="1"
                    max="6"
                    step="1"
                    value={Number((widget?.options?.columns as number) ?? 3)}
                    on:input={(e) =>
                      updateWidget(selectedId, { options: { columns: Number((e.target as HTMLInputElement).value) } })}
                  />
                </label>
                <label>
                  Icon Size ({Number((widget?.options?.iconSize as number) ?? 38)}px)
                  <div class="monitor-slider-input-row">
                    <input
                      type="range"
                      min="16"
                      max="96"
                      step="1"
                      value={Number((widget?.options?.iconSize as number) ?? 38)}
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { iconSize: Number((e.target as HTMLInputElement).value) } })}
                    />
                    <input
                      type="number"
                      min="16"
                      max="96"
                      value={Number((widget?.options?.iconSize as number) ?? 38)}
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { iconSize: Number((e.target as HTMLInputElement).value) } })}
                    />
                  </div>
                </label>
                <div class="monitor-offset-grid">
                  <label>
                    Horizontal Offset ({Number((widget?.options?.monitorContentOffsetX as number) ?? 0)}px)
                    <input
                      type="range"
                      min="-120"
                      max="120"
                      step="1"
                      value={Number((widget?.options?.monitorContentOffsetX as number) ?? 0)}
                      on:input={(e) =>
                        updateWidget(selectedId, {
                          options: { monitorContentOffsetX: Number((e.target as HTMLInputElement).value) }
                        })}
                    />
                  </label>
                  <label>
                    Vertical Offset ({Number((widget?.options?.monitorContentOffsetY as number) ?? 0)}px)
                    <input
                      type="range"
                      min="-120"
                      max="120"
                      step="1"
                      value={Number((widget?.options?.monitorContentOffsetY as number) ?? 0)}
                      on:input={(e) =>
                        updateWidget(selectedId, {
                          options: { monitorContentOffsetY: Number((e.target as HTMLInputElement).value) }
                        })}
                    />
                  </label>
                </div>
              </div>

              <p class="field-title">Display Toggles</p>
              <div class="settings-group monitor-toggle-grid">
                <label class="identity-visibility-item">
                  <span>Show Status Circle</span>
                  <button
                    type="button"
                    class={`hyper-glass-toggle ${((widget?.options?.showStatusDot as boolean) ?? true) ? 'on' : ''}`}
                    role="switch"
                    aria-checked={((widget?.options?.showStatusDot as boolean) ?? true)}
                    aria-label="Toggle show status circle"
                    on:click={() =>
                      updateWidget(selectedId, {
                        options: { showStatusDot: !(((widget?.options?.showStatusDot as boolean) ?? true)) }
                      })}
                  >
                    <span class="hyper-glass-knob"></span>
                  </button>
                </label>
                <label class="identity-visibility-item">
                  <span>Show Status Text</span>
                  <button
                    type="button"
                    class={`hyper-glass-toggle ${((widget?.options?.showStatusText as boolean) ?? true) ? 'on' : ''}`}
                    role="switch"
                    aria-checked={((widget?.options?.showStatusText as boolean) ?? true)}
                    aria-label="Toggle show status text"
                    on:click={() =>
                      updateWidget(selectedId, {
                        options: { showStatusText: !(((widget?.options?.showStatusText as boolean) ?? true)) }
                      })}
                  >
                    <span class="hyper-glass-knob"></span>
                  </button>
                </label>
                <label class="identity-visibility-item">
                  <span>Show Response Time</span>
                  <button
                    type="button"
                    class={`hyper-glass-toggle ${((widget?.options?.showLatency as boolean) ?? true) ? 'on' : ''}`}
                    role="switch"
                    aria-checked={((widget?.options?.showLatency as boolean) ?? true)}
                    aria-label="Toggle show response time"
                    on:click={() =>
                      updateWidget(selectedId, {
                        options: { showLatency: !(((widget?.options?.showLatency as boolean) ?? true)) }
                      })}
                  >
                    <span class="hyper-glass-knob"></span>
                  </button>
                </label>
                <label class="identity-visibility-item">
                  <span>Show Dividers</span>
                  <button
                    type="button"
                    class={`hyper-glass-toggle ${((widget?.options?.showDividers as boolean) ?? true) ? 'on' : ''}`}
                    role="switch"
                    aria-checked={((widget?.options?.showDividers as boolean) ?? true)}
                    aria-label="Toggle show dividers"
                    on:click={() =>
                      updateWidget(selectedId, {
                        options: { showDividers: !(((widget?.options?.showDividers as boolean) ?? true)) }
                      })}
                  >
                    <span class="hyper-glass-knob"></span>
                  </button>
                </label>
              </div>

              <p class="field-title">Typography</p>
              <div class="settings-group">
                <TypographyControl
                  label="Container Name"
                  summary={getTypographyDisplay(widget, 'monitorName', 'size')}
                  fontValue={isTypographyInherited(widget, 'monitorName', 'font') ? '' : String(getTypographyRaw(widget, 'monitorName', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'monitorName', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'monitorName', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'monitorName', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'monitorName', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'monitorName', 'size')}
                  sizeMin={8}
                  sizeMax={42}
                  colorValue={getTypographyColor(widget, 'monitorName')}
                  on:font={(e) => setTypographyField(widget, 'monitorName', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'monitorName', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'monitorName', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'monitorName', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'monitorName', 'color', '')}
                />
                <TypographyControl
                  label="Status Text"
                  summary={getTypographyDisplay(widget, 'monitorStatus', 'size')}
                  fontValue={isTypographyInherited(widget, 'monitorStatus', 'font') ? '' : String(getTypographyRaw(widget, 'monitorStatus', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'monitorStatus', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'monitorStatus', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'monitorStatus', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'monitorStatus', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'monitorStatus', 'size')}
                  sizeMin={8}
                  sizeMax={36}
                  colorValue={getTypographyColor(widget, 'monitorStatus')}
                  on:font={(e) => setTypographyField(widget, 'monitorStatus', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'monitorStatus', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'monitorStatus', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'monitorStatus', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'monitorStatus', 'color', '')}
                />
                <TypographyControl
                  label="Latency / Time"
                  summary={getTypographyDisplay(widget, 'monitorLatency', 'size')}
                  fontValue={isTypographyInherited(widget, 'monitorLatency', 'font') ? '' : String(getTypographyRaw(widget, 'monitorLatency', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'monitorLatency', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'monitorLatency', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'monitorLatency', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'monitorLatency', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'monitorLatency', 'size')}
                  sizeMin={8}
                  sizeMax={36}
                  colorValue={getTypographyColor(widget, 'monitorLatency')}
                  on:font={(e) => setTypographyField(widget, 'monitorLatency', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'monitorLatency', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'monitorLatency', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'monitorLatency', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'monitorLatency', 'color', '')}
                />
              </div>
            {/if}

            {#if widget?.kind === 'clock'}
              <p class="field-title">Date (month/day)</p>
              <label>
                Font Family
                <input
                  type="text"
                  value={(widget?.options?.clockDateFont as string) ?? ''}
                  placeholder="inherit"
                  on:input={(e) =>
                    updateWidget(selectedId, { options: { clockDateFont: (e.target as HTMLInputElement).value } })
                  }
                />
              </label>
              <label>
                Font Size (px)
                <input
                  type="number"
                  min="10"
                  max="64"
                  value={Number((widget?.options?.clockDateSize as number) ?? 17)}
                  on:input={(e) =>
                    updateWidget(selectedId, { options: { clockDateSize: Number((e.target as HTMLInputElement).value) } })
                  }
                />
              </label>
              <label>
                Font Color
                <input
                  type="color"
                  value={normalizeHexColor(widget?.options?.clockDateColor, '#eef4ff')}
                  on:input={(e) =>
                    updateWidget(selectedId, { options: { clockDateColor: (e.target as HTMLInputElement).value } })
                  }
                />
              </label>

              <p class="field-title">Weekday / Year</p>
              <label>
                Font Family
                <input
                  type="text"
                  value={(widget?.options?.clockYearFont as string) ?? ''}
                  placeholder="inherit"
                  on:input={(e) =>
                    updateWidget(selectedId, { options: { clockYearFont: (e.target as HTMLInputElement).value } })
                  }
                />
              </label>
              <label>
                Font Size (px)
                <input
                  type="number"
                  min="9"
                  max="48"
                  value={Number((widget?.options?.clockYearSize as number) ?? 13)}
                  on:input={(e) =>
                    updateWidget(selectedId, { options: { clockYearSize: Number((e.target as HTMLInputElement).value) } })
                  }
                />
              </label>
              <label>
                Font Color
                <input
                  type="color"
                  value={normalizeHexColor(widget?.options?.clockYearColor, '#9aa8ba')}
                  on:input={(e) =>
                    updateWidget(selectedId, { options: { clockYearColor: (e.target as HTMLInputElement).value } })
                  }
                />
              </label>

              <p class="field-title">Time</p>
              <label>
                Font Family
                <input
                  type="text"
                  value={(widget?.options?.clockTimeFont as string) ?? ''}
                  placeholder="inherit"
                  on:input={(e) =>
                    updateWidget(selectedId, { options: { clockTimeFont: (e.target as HTMLInputElement).value } })
                  }
                />
              </label>
              <label>
                Font Size (px)
                <input
                  type="number"
                  min="12"
                  max="84"
                  value={Number((widget?.options?.clockTimeSize as number) ?? 26)}
                  on:input={(e) =>
                    updateWidget(selectedId, { options: { clockTimeSize: Number((e.target as HTMLInputElement).value) } })
                  }
                />
              </label>
              <label>
                Font Color
                <input
                  type="color"
                  value={normalizeHexColor(widget?.options?.clockTimeColor, '#eef4ff')}
                  on:input={(e) =>
                    updateWidget(selectedId, { options: { clockTimeColor: (e.target as HTMLInputElement).value } })
                  }
                />
              </label>
            {/if}

            {#if (widget?.kind as string) === 'stat'}
              {@const showMetricBoxes = (widget?.options?.metricBoxes as boolean) ?? true}
              {@const showMetricBorders = (widget?.options?.metricBoxBorder as boolean) ?? true}
              <details class="inspector-subaccordion metric-grid-style-section" open>
                <summary class="appearance-subheader">
                  <span>Container Style</span>
                  <span class="subaccordion-chevron" aria-hidden="true">▾</span>
                </summary>
                <div class="appearance-two-col metric-grid-bg-row">
                  <label class="pro-field compact item-toggle-field">
                    <span class="micro-label">Show Boxes</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle ${showMetricBoxes ? 'on' : ''}`}
                      role="switch"
                      aria-checked={showMetricBoxes}
                      aria-label="Show metric boxes"
                      on:click={() => updateWidget(selectedId, { options: { metricBoxes: !showMetricBoxes } })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </label>
                  {#if showMetricBoxes}
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Box Background</span>
                      <span class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor(widget?.options?.metricBoxBackgroundColor, '#0a1018')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { metricBoxBackgroundColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          maxlength="7"
                          value={normalizeHexColor(widget?.options?.metricBoxBackgroundColor, '#0a1018').toUpperCase()}
                          on:change={(e) => {
                            const value = (e.target as HTMLInputElement).value.trim().toUpperCase();
                            if (/^#(?:[0-9A-F]{3}){1,2}$/.test(value)) {
                              updateWidget(selectedId, { options: { metricBoxBackgroundColor: value } });
                            } else {
                              (e.target as HTMLInputElement).value = normalizeHexColor(widget?.options?.metricBoxBackgroundColor, '#0a1018').toUpperCase();
                            }
                          }}
                        />
                      </span>
                    </label>
                  {/if}
                </div>

                <div class="metric-grid-border-row">
                  <label class="pro-field compact item-toggle-field">
                    <span class="micro-label">Show Borders</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle ${showMetricBorders ? 'on' : ''}`}
                      role="switch"
                      aria-checked={showMetricBorders}
                      aria-label="Show metric box borders"
                      on:click={() => updateWidget(selectedId, { options: { metricBoxBorder: !showMetricBorders } })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </label>
                  <label class="pro-field compact color-field">
                    <span class="micro-label">Border Color</span>
                    <span class="metric-grid-color-well">
                      <input
                        class="metric-grid-color-swatch"
                        type="color"
                        value={normalizeHexColor(widget?.options?.metricBoxBorderColor, '#ffffff')}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { metricBoxBorderColor: (e.target as HTMLInputElement).value } })}
                      />
                      <input
                        class="metric-grid-color-text"
                        type="text"
                        maxlength="7"
                        value={normalizeHexColor(widget?.options?.metricBoxBorderColor, '#ffffff').toUpperCase()}
                        on:change={(e) => {
                          const value = (e.target as HTMLInputElement).value.trim().toUpperCase();
                          if (/^#(?:[0-9A-F]{3}){1,2}$/.test(value)) {
                            updateWidget(selectedId, { options: { metricBoxBorderColor: value } });
                          } else {
                            (e.target as HTMLInputElement).value = normalizeHexColor(widget?.options?.metricBoxBorderColor, '#ffffff').toUpperCase();
                          }
                        }}
                      />
                    </span>
                  </label>
                </div>
                <label class="pro-field compact metric-grid-border-style">
                  <span class="micro-label">Border Style</span>
                  <select
                    class="pro-select metric-grid-full-select"
                    value={(widget?.options?.metricBoxBorderStyle as string) ?? 'solid'}
                    on:change={(e) =>
                      updateWidget(selectedId, { options: { metricBoxBorderStyle: (e.target as HTMLSelectElement).value } })}
                  >
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="glow">Glow</option>
                  </select>
                </label>

                <div class="metric-grid-geometry-bar">
                  <div class="metric-grid-geometry-segment metric-grid-geometry-segment-width group">
                    <span class="metric-grid-geometry-label">W</span>
                    <input
                      class="metric-grid-geometry-input"
                      type="number"
                      min="0"
                      max="600"
                      value={Number((widget?.options?.metricBoxWidth as number) ?? 0)}
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { metricBoxWidth: Number((e.target as HTMLInputElement).value) } })}
                    />
                  </div>
                  <div class="metric-grid-geometry-segment group">
                    <span class="metric-grid-geometry-label">H</span>
                    <input
                      class="metric-grid-geometry-input"
                      type="number"
                      min="24"
                      max="220"
                      value={Number((widget?.options?.metricBoxHeight as number) ?? 52)}
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { metricBoxHeight: Number((e.target as HTMLInputElement).value) } })}
                    />
                  </div>
                </div>
              </details>

              <p class="appearance-subheader">Typography</p>
              <TypographyControl
                label="Metric Value Typography"
                summary={getTypographyDisplay(widget, 'metricValue', 'size')}
                fontValue={isTypographyInherited(widget, 'metricValue', 'font') ? '' : String(getTypographyRaw(widget, 'metricValue', 'font') ?? '')}
                fontInherited={isTypographyInherited(widget, 'metricValue', 'font')}
                fontDisplay={getTypographyDisplay(widget, 'metricValue', 'font')}
                fontOptions={typographyFontOptions}
                weightValue={getTypographyNumeric(widget, 'metricValue', 'weight')}
                weightInherited={isTypographyInherited(widget, 'metricValue', 'weight')}
                sizeValue={getTypographyNumeric(widget, 'metricValue', 'size')}
                sizeMin={8}
                sizeMax={48}
                colorValue={getTypographyColor(widget, 'metricValue')}
                open={false}
                on:font={(e) => setTypographyField(widget, 'metricValue', 'font', e.detail)}
                on:weight={(e) => setTypographyField(widget, 'metricValue', 'weight', e.detail)}
                on:size={(e) => setTypographyField(widget, 'metricValue', 'size', e.detail)}
                on:color={(e) => setTypographyField(widget, 'metricValue', 'color', e.detail)}
                on:colorReset={() => setTypographyField(widget, 'metricValue', 'color', '')}
              />
              <TypographyControl
                label="Metric Label Typography"
                summary={getTypographyDisplay(widget, 'metricLabel', 'size')}
                fontValue={isTypographyInherited(widget, 'metricLabel', 'font') ? '' : String(getTypographyRaw(widget, 'metricLabel', 'font') ?? '')}
                fontInherited={isTypographyInherited(widget, 'metricLabel', 'font')}
                fontDisplay={getTypographyDisplay(widget, 'metricLabel', 'font')}
                fontOptions={typographyFontOptions}
                weightValue={getTypographyNumeric(widget, 'metricLabel', 'weight')}
                weightInherited={isTypographyInherited(widget, 'metricLabel', 'weight')}
                sizeValue={getTypographyNumeric(widget, 'metricLabel', 'size')}
                sizeMin={8}
                sizeMax={48}
                colorValue={getTypographyColor(widget, 'metricLabel')}
                open={false}
                on:font={(e) => setTypographyField(widget, 'metricLabel', 'font', e.detail)}
                on:weight={(e) => setTypographyField(widget, 'metricLabel', 'weight', e.detail)}
                on:size={(e) => setTypographyField(widget, 'metricLabel', 'size', e.detail)}
                on:color={(e) => setTypographyField(widget, 'metricLabel', 'color', e.detail)}
                on:colorReset={() => setTypographyField(widget, 'metricLabel', 'color', '')}
              />
            {:else}
            {#if widget?.source === 'technitium'}
              <details class="appearance-collapsible">
                <summary>Metric Box Style</summary>
                <div class="appearance-collapsible-body">
                  <div class="metric-grid-border-row">
                    <label class="pro-field compact item-toggle-field">
                      <span class="micro-label">Show Boxes</span>
                      <button
                        type="button"
                        class={`hyper-glass-toggle ${((widget?.options?.metricBoxes as boolean) ?? true) ? 'on' : ''}`}
                        role="switch"
                        aria-checked={((widget?.options?.metricBoxes as boolean) ?? true)}
                        aria-label="Show metric boxes"
                        on:click={() =>
                          updateWidget(selectedId, { options: { metricBoxes: !((widget?.options?.metricBoxes as boolean) ?? true) } })}
                      >
                        <span class="hyper-glass-knob"></span>
                      </button>
                    </label>
                    <label class="pro-field compact item-toggle-field">
                      <span class="micro-label">Show Borders</span>
                      <button
                        type="button"
                        class={`hyper-glass-toggle ${((widget?.options?.metricBoxBorder as boolean) ?? true) ? 'on' : ''}`}
                        role="switch"
                        aria-checked={((widget?.options?.metricBoxBorder as boolean) ?? true)}
                        aria-label="Show metric box borders"
                        on:click={() =>
                          updateWidget(selectedId, { options: { metricBoxBorder: !((widget?.options?.metricBoxBorder as boolean) ?? true) } })}
                      >
                        <span class="hyper-glass-knob"></span>
                      </button>
                    </label>
                  </div>

                  <div class="appearance-two-col color-row">
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Box Background</span>
                      <div class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor(widget?.options?.metricBoxBackgroundColor, '#0a1018')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { metricBoxBackgroundColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor(widget?.options?.metricBoxBackgroundColor, '#0a1018')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { metricBoxBackgroundColor: (e.target as HTMLInputElement).value } })}
                        />
                      </div>
                    </label>
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Border Color</span>
                      <div class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor(widget?.options?.metricBoxBorderColor, '#ffffff')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { metricBoxBorderColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor(widget?.options?.metricBoxBorderColor, '#ffffff')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { metricBoxBorderColor: (e.target as HTMLInputElement).value } })}
                        />
                      </div>
                    </label>
                  </div>

                  <div class="metric-grid-geometry-bar" role="group" aria-label="Metric box dimensions">
                    <div class="metric-grid-geometry-segment metric-grid-geometry-segment-width group">
                      <span class="metric-grid-geometry-label">W</span>
                      <input
                        class="metric-grid-geometry-input"
                        type="number"
                        min="0"
                        max="600"
                        value={Number((widget?.options?.metricBoxWidth as number) ?? 0)}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { metricBoxWidth: Number((e.target as HTMLInputElement).value) } })}
                      />
                    </div>
                    <div class="metric-grid-geometry-segment group">
                      <span class="metric-grid-geometry-label">H</span>
                      <input
                        class="metric-grid-geometry-input"
                        type="number"
                        min="24"
                        max="220"
                        value={Number((widget?.options?.metricBoxHeight as number) ?? 52)}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { metricBoxHeight: Number((e.target as HTMLInputElement).value) } })}
                      />
                    </div>
                  </div>

                  <TypographyControl
                    label="Metric Value"
                    summary={getTypographyDisplay(widget, 'metricValue', 'size')}
                    fontValue={isTypographyInherited(widget, 'metricValue', 'font') ? '' : String(getTypographyRaw(widget, 'metricValue', 'font') ?? '')}
                    fontInherited={isTypographyInherited(widget, 'metricValue', 'font')}
                    fontDisplay={getTypographyDisplay(widget, 'metricValue', 'font')}
                    fontOptions={typographyFontOptions}
                    weightValue={getTypographyNumeric(widget, 'metricValue', 'weight')}
                    weightInherited={isTypographyInherited(widget, 'metricValue', 'weight')}
                    sizeValue={getTypographyNumeric(widget, 'metricValue', 'size')}
                    sizeMin={8}
                    sizeMax={48}
                    colorValue={getTypographyColor(widget, 'metricValue')}
                    open={false}
                    on:font={(e) => setTypographyField(widget, 'metricValue', 'font', e.detail)}
                    on:weight={(e) => setTypographyField(widget, 'metricValue', 'weight', e.detail)}
                    on:size={(e) => setTypographyField(widget, 'metricValue', 'size', e.detail)}
                    on:color={(e) => setTypographyField(widget, 'metricValue', 'color', e.detail)}
                    on:colorReset={() => setTypographyField(widget, 'metricValue', 'color', '')}
                  />
                  <TypographyControl
                    label="Metric Label"
                    summary={getTypographyDisplay(widget, 'metricLabel', 'size')}
                    fontValue={isTypographyInherited(widget, 'metricLabel', 'font') ? '' : String(getTypographyRaw(widget, 'metricLabel', 'font') ?? '')}
                    fontInherited={isTypographyInherited(widget, 'metricLabel', 'font')}
                    fontDisplay={getTypographyDisplay(widget, 'metricLabel', 'font')}
                    fontOptions={typographyFontOptions}
                    weightValue={getTypographyNumeric(widget, 'metricLabel', 'weight')}
                    weightInherited={isTypographyInherited(widget, 'metricLabel', 'weight')}
                    sizeValue={getTypographyNumeric(widget, 'metricLabel', 'size')}
                    sizeMin={8}
                    sizeMax={48}
                    colorValue={getTypographyColor(widget, 'metricLabel')}
                    open={false}
                    on:font={(e) => setTypographyField(widget, 'metricLabel', 'font', e.detail)}
                    on:weight={(e) => setTypographyField(widget, 'metricLabel', 'weight', e.detail)}
                    on:size={(e) => setTypographyField(widget, 'metricLabel', 'size', e.detail)}
                    on:color={(e) => setTypographyField(widget, 'metricLabel', 'color', e.detail)}
                    on:colorReset={() => setTypographyField(widget, 'metricLabel', 'color', '')}
                  />
                </div>
              </details>

              <details class="appearance-collapsible">
                <summary>Chart Visuals</summary>
                <div class="appearance-collapsible-body">
                  <div class="dns-chart-layout-grid">
                    <div class="dns-chart-layout-field">
                      <span class="micro-label">Orientation</span>
                      <select
                        aria-label="Orientation"
                        value={(widget?.options?.orientation as string) ?? 'vertical'}
                        on:change={(e) =>
                          updateWidget(selectedId, { options: { orientation: (e.target as HTMLSelectElement).value } })}
                      >
                        <option value="vertical">Vertical</option>
                        <option value="horizontal">Horizontal</option>
                      </select>
                    </div>
                    <div class="dns-chart-layout-field">
                      <span class="micro-label">Bar Style</span>
                      <select
                        aria-label="Bar style"
                        value={((widget?.options?.stacked as boolean) ?? true) ? 'stacked' : 'classic'}
                        on:change={(e) =>
                          updateWidget(selectedId, { options: { stacked: (e.target as HTMLSelectElement).value === 'stacked' } })}
                      >
                        <option value="stacked">Stacked</option>
                        <option value="classic">Classic</option>
                      </select>
                    </div>
                  </div>

                  <div class="appearance-three-col dns-chart-color-grid">
                    <label class="pro-field compact color-field dns-chart-color-control">
                      <span class="micro-label">Bar Color</span>
                      <span class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor(widget?.options?.barColor, '#6aa8ff')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { barColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor(widget?.options?.barColor, '#6aa8ff')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { barColor: (e.target as HTMLInputElement).value } })}
                        />
                      </span>
                    </label>
                    <label class="pro-field compact color-field dns-chart-color-control">
                      <span class="micro-label">Blocked Color</span>
                      <span class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor(widget?.options?.blockedColor, '#ff6b6b')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { blockedColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor(widget?.options?.blockedColor, '#ff6b6b')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { blockedColor: (e.target as HTMLInputElement).value } })}
                        />
                      </span>
                    </label>
                    <label class="pro-field compact color-field dns-chart-color-control">
                      <span class="micro-label">Border Color</span>
                      <span class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor(widget?.options?.barBorderColor, '#d2e4f6')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { barBorderColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          value={normalizeHexColor(widget?.options?.barBorderColor, '#d2e4f6')}
                          maxlength="7"
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { barBorderColor: (e.target as HTMLInputElement).value } })}
                        />
                      </span>
                    </label>
                  </div>

                  <div class="dns-chart-slider-stack">
                    <label>
                      Bar Width ({Math.round(Number((widget?.options?.barWidth as number) ?? 18))}px)
                      <input
                        type="range"
                        min="8"
                        max="48"
                        step="1"
                        value={Number((widget?.options?.barWidth as number) ?? 18)}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { barWidth: Number((e.target as HTMLInputElement).value) } })}
                      />
                    </label>
                    <label>
                      Bar Height ({Math.round(Number(((widget?.options?.barHeightScale as number) ?? 1) * 100))}%)
                      <input
                        type="range"
                        min="40"
                        max="180"
                        step="1"
                        value={Math.round(Number(((widget?.options?.barHeightScale as number) ?? 1) * 100))}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { barHeightScale: Number((e.target as HTMLInputElement).value) / 100 } })}
                      />
                    </label>
                    <label>
                      Corner Smoothing ({Math.round(Number((widget?.options?.cornerSmoothing as number) ?? 100))}%)
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={Math.round(Number((widget?.options?.cornerSmoothing as number) ?? 100))}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { cornerSmoothing: Number((e.target as HTMLInputElement).value) } })}
                      />
                    </label>
                    <label>
                      Inter-Bar Spacing ({Math.round(Number((widget?.options?.barGap as number) ?? 8))}px)
                      <input
                        type="range"
                        min="2"
                        max="24"
                        step="1"
                        value={Number((widget?.options?.barGap as number) ?? 8)}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { barGap: Number((e.target as HTMLInputElement).value) } })}
                      />
                    </label>
                    <label>
                      Bar Border ({Math.round(Number((widget?.options?.barBorder as number) ?? 1))}px)
                      <input
                        type="range"
                        min="0"
                        max="8"
                        step="1"
                        value={Number((widget?.options?.barBorder as number) ?? 1)}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { barBorder: Number((e.target as HTMLInputElement).value) } })}
                      />
                    </label>
                  </div>

                  <TypographyControl
                    label="Axis Labels"
                    summary={getTypographyDisplay(widget, 'dnsAxis', 'size')}
                    fontValue={isTypographyInherited(widget, 'dnsAxis', 'font') ? '' : String(getTypographyRaw(widget, 'dnsAxis', 'font') ?? '')}
                    fontInherited={isTypographyInherited(widget, 'dnsAxis', 'font')}
                    fontDisplay={getTypographyDisplay(widget, 'dnsAxis', 'font')}
                    fontOptions={typographyFontOptions}
                    weightValue={getTypographyNumeric(widget, 'dnsAxis', 'weight')}
                    weightInherited={isTypographyInherited(widget, 'dnsAxis', 'weight')}
                    sizeValue={getTypographyNumeric(widget, 'dnsAxis', 'size')}
                    sizeMin={8}
                    sizeMax={30}
                    colorValue={getTypographyColor(widget, 'dnsAxis')}
                    open={false}
                    on:font={(e) => setTypographyField(widget, 'dnsAxis', 'font', e.detail)}
                    on:weight={(e) => setTypographyField(widget, 'dnsAxis', 'weight', e.detail)}
                    on:size={(e) => setTypographyField(widget, 'dnsAxis', 'size', e.detail)}
                    on:color={(e) => setTypographyField(widget, 'dnsAxis', 'color', e.detail)}
                    on:colorReset={() => setTypographyField(widget, 'dnsAxis', 'color', '')}
                  />
                  <TypographyControl
                    label="Legend Text"
                    summary={getTypographyDisplay(widget, 'dnsLegend', 'size')}
                    fontValue={isTypographyInherited(widget, 'dnsLegend', 'font') ? '' : String(getTypographyRaw(widget, 'dnsLegend', 'font') ?? '')}
                    fontInherited={isTypographyInherited(widget, 'dnsLegend', 'font')}
                    fontDisplay={getTypographyDisplay(widget, 'dnsLegend', 'font')}
                    fontOptions={typographyFontOptions}
                    weightValue={getTypographyNumeric(widget, 'dnsLegend', 'weight')}
                    weightInherited={isTypographyInherited(widget, 'dnsLegend', 'weight')}
                    sizeValue={getTypographyNumeric(widget, 'dnsLegend', 'size')}
                    sizeMin={8}
                    sizeMax={32}
                    colorValue={getTypographyColor(widget, 'dnsLegend')}
                    open={false}
                    on:font={(e) => setTypographyField(widget, 'dnsLegend', 'font', e.detail)}
                    on:weight={(e) => setTypographyField(widget, 'dnsLegend', 'weight', e.detail)}
                    on:size={(e) => setTypographyField(widget, 'dnsLegend', 'size', e.detail)}
                    on:color={(e) => setTypographyField(widget, 'dnsLegend', 'color', e.detail)}
                    on:colorReset={() => setTypographyField(widget, 'dnsLegend', 'color', '')}
                  />
                </div>
              </details>
            {/if}

            {#if (widget?.kind as string) !== 'stat' && (widget?.source === 'komodo' || widget?.source === 'docker' || (widget?.kind as string) === 'docker')}
              {@const isGridLayout = ((widget?.options?.layout as string) ?? 'list') === 'grid'}
              {@const showPagination = (widget?.options?.collapsible as boolean) ?? true}
              {@const showContainerBorder = (widget?.options?.showContainerBorder as boolean) ?? true}
              <div class="appearance-smart">
                <div class="appearance-row layout-engine-row">
                  <div class="identity-segmented-toggle" role="group" aria-label="Grid engine layout style">
                    <button
                      type="button"
                      class={`identity-toggle-btn ${isGridLayout ? 'active' : ''}`}
                      on:click={() => updateWidget(selectedId, { options: { layout: 'grid' } })}
                    >
                      Grid
                    </button>
                    <button
                      type="button"
                      class={`identity-toggle-btn ${!isGridLayout ? 'active' : ''}`}
                      on:click={() => updateWidget(selectedId, { options: { layout: 'list' } })}
                    >
                      List
                    </button>
                  </div>
                  <label class="pro-field compact cols-field">
                    COLS
                    <input
                      type="number"
                      min="1"
                      max="12"
                      disabled={!isGridLayout}
                      value={Number((widget?.options?.komodoColumns as number) ?? 3)}
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { komodoColumns: Number((e.target as HTMLInputElement).value) } })
                      }
                    />
                  </label>
                </div>

                <div class="pagination-bar">
                  <div class="pagination-toggle-wrap">
                    <span class="pagination-label">Pagination</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle ${showPagination ? 'on' : ''}`}
                      role="switch"
                      aria-checked={showPagination}
                      aria-label="Enable show more"
                      on:click={() =>
                        updateWidget(selectedId, { options: { collapsible: !showPagination } })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </div>
                  <label class={`pagination-limit ${showPagination ? '' : 'disabled'}`}>
                    <span class="pagination-limit-label">LIMIT</span>
                    <input
                      type="text"
                      inputmode="numeric"
                      disabled={!showPagination}
                      value={getKomodoRowsControlValue(widget?.options?.komodoRows)}
                      on:change={(e) =>
                        updateWidget(selectedId, {
                          options: { komodoRows: parseKomodoRowsControlValue((e.target as HTMLInputElement).value) }
                        })}
                    />
                  </label>
                </div>

                <p class="appearance-subheader">Item Styling</p>
                <div class="appearance-two-col item-styling-grid">
                  <label class="pro-field compact item-toggle-field">
                    <span class="micro-label">Show Box Borders</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle ${showContainerBorder ? 'on' : ''}`}
                      role="switch"
                      aria-checked={showContainerBorder}
                      aria-label="Show box borders"
                      on:click={() =>
                        updateWidget(selectedId, { options: { showContainerBorder: !showContainerBorder } })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </label>
                  <label class="pro-field compact">
                    <span class="micro-label">Border Style</span>
                    <select
                      class="pro-select"
                      value={(widget?.options?.containerBorderStyle as string) ?? 'solid'}
                      on:change={(e) =>
                        updateWidget(selectedId, { options: { containerBorderStyle: (e.target as HTMLSelectElement).value } })
                      }
                    >
                      <option value="solid">Solid</option>
                      <option value="dashed">Dashed</option>
                      <option value="glow">Glow</option>
                    </select>
                  </label>
                </div>

                {#if showContainerBorder}
                  <div class="appearance-two-col color-row">
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Border Color</span>
                      <span class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor(widget?.options?.containerBorderColor, '#ffffff')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { containerBorderColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          maxlength="7"
                          value={normalizeHexColor(widget?.options?.containerBorderColor, '#ffffff').toUpperCase()}
                          on:change={(e) => {
                            const value = (e.target as HTMLInputElement).value.trim().toUpperCase();
                            if (/^#(?:[0-9A-F]{3}){1,2}$/.test(value)) {
                              updateWidget(selectedId, { options: { containerBorderColor: value } });
                            } else {
                              (e.target as HTMLInputElement).value = normalizeHexColor(widget?.options?.containerBorderColor, '#ffffff').toUpperCase();
                            }
                          }}
                        />
                      </span>
                    </label>
                    <label class="pro-field compact color-field">
                      <span class="micro-label">Background Color</span>
                      <span class="metric-grid-color-well">
                        <input
                          class="metric-grid-color-swatch"
                          type="color"
                          value={normalizeHexColor(widget?.options?.containerBackgroundColor, '#0a1018')}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { containerBackgroundColor: (e.target as HTMLInputElement).value } })}
                        />
                        <input
                          class="metric-grid-color-text"
                          type="text"
                          maxlength="7"
                          value={normalizeHexColor(widget?.options?.containerBackgroundColor, '#0a1018').toUpperCase()}
                          on:change={(e) => {
                            const value = (e.target as HTMLInputElement).value.trim().toUpperCase();
                            if (/^#(?:[0-9A-F]{3}){1,2}$/.test(value)) {
                              updateWidget(selectedId, { options: { containerBackgroundColor: value } });
                            } else {
                              (e.target as HTMLInputElement).value = normalizeHexColor(widget?.options?.containerBackgroundColor, '#0a1018').toUpperCase();
                            }
                          }}
                        />
                      </span>
                    </label>
                  </div>
                {/if}

                <p class="appearance-subheader">Typography</p>
                <TypographyControl
                  label="Container Name"
                  summary={getTypographyDisplay(widget, 'komodoName', 'size')}
                  fontValue={isTypographyInherited(widget, 'komodoName', 'font') ? '' : String(getTypographyRaw(widget, 'komodoName', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'komodoName', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'komodoName', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'komodoName', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'komodoName', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'komodoName', 'size')}
                  sizeMin={10}
                  sizeMax={48}
                  colorValue={getTypographyColor(widget, 'komodoName')}
                  inherited={isTypographyInherited(widget, 'komodoName', 'font') && isTypographyInherited(widget, 'komodoName', 'weight') && isTypographyInherited(widget, 'komodoName', 'size') && isTypographyInherited(widget, 'komodoName', 'color')}
                  on:font={(e) => setTypographyField(widget, 'komodoName', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'komodoName', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'komodoName', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'komodoName', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'komodoName', 'color', '')}
                />
                <TypographyControl
                  label="Meta Data / Server"
                  summary={getTypographyDisplay(widget, 'komodoServer', 'size')}
                  fontValue={isTypographyInherited(widget, 'komodoServer', 'font') ? '' : String(getTypographyRaw(widget, 'komodoServer', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'komodoServer', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'komodoServer', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'komodoServer', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'komodoServer', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'komodoServer', 'size')}
                  sizeMin={8}
                  sizeMax={36}
                  colorValue={getTypographyColor(widget, 'komodoServer')}
                  inherited={isTypographyInherited(widget, 'komodoServer', 'font') && isTypographyInherited(widget, 'komodoServer', 'weight') && isTypographyInherited(widget, 'komodoServer', 'size') && isTypographyInherited(widget, 'komodoServer', 'color')}
                  on:font={(e) => setTypographyField(widget, 'komodoServer', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'komodoServer', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'komodoServer', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'komodoServer', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'komodoServer', 'color', '')}
                />

                <p class="appearance-subheader">Display Options</p>
                <div class="appearance-two-col item-styling-grid">
                  <label class="pro-field compact item-toggle-field">
                    <span class="micro-label">Show Status Indicators</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle ${((widget?.options?.showStatusDot as boolean) ?? true) ? 'on' : ''}`}
                      role="switch"
                      aria-checked={((widget?.options?.showStatusDot as boolean) ?? true)}
                      aria-label="Show status indicators"
                      on:click={() =>
                        updateWidget(selectedId, {
                          options: { showStatusDot: !(((widget?.options?.showStatusDot as boolean) ?? true)) }
                        })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </label>
                  <label class="pro-field compact item-toggle-field">
                    <span class="micro-label">Show Container ID</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle ${((widget?.options?.showStatusText as boolean) ?? true) ? 'on' : ''}`}
                      role="switch"
                      aria-checked={((widget?.options?.showStatusText as boolean) ?? true)}
                      aria-label="Show container id"
                      on:click={() =>
                        updateWidget(selectedId, {
                          options: { showStatusText: !(((widget?.options?.showStatusText as boolean) ?? true)) }
                        })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </label>
                </div>

                <details class="content-subaccordion icon-overrides-collapsible icon-overrides-module">
                  <summary class="appearance-subheader">
                    <span>Icon Overrides</span>
                    <span class="subaccordion-chevron" aria-hidden="true">▾</span>
                  </summary>
                  <div class="icon-manager">
                    {#if Object.keys(getKomodoIconOverrides(widget)).length === 0}
                      <div class="editor-empty">No overrides yet. Add a container name and icon URL.</div>
                    {:else}
                      <div class="icon-manager-list">
                        {#each Object.entries(getKomodoIconOverrides(widget)) as entry (entry[0])}
                          {@const stackName = entry[0]}
                          {@const stackIcon = entry[1]}
                          <div class="icon-manager-row">
                            <input type="text" value={stackName} readonly />
                            <input
                              type="text"
                              value={stackIcon}
                              placeholder="https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/svg/<icon>.svg"
                              on:input={(e) =>
                                updateKomodoIconOverride(
                                  widget,
                                  stackName,
                                  (e.target as HTMLInputElement).value
                                )}
                            />
                            <button
                              type="button"
                              class="icon-manager-delete"
                              aria-label={`Delete icon override for ${stackName}`}
                              on:click={() => updateKomodoIconOverride(widget, stackName, '')}
                            >
                              ×
                            </button>
                          </div>
                        {/each}
                      </div>
                    {/if}
                    <div class="icon-manager-row add">
                      <input
                        type="text"
                        placeholder="Container Name"
                        value={komodoIconDraftName}
                        on:input={(e) => (komodoIconDraftName = (e.target as HTMLInputElement).value)}
                      />
                      <input
                        type="text"
                        placeholder="Icon URL"
                        value={komodoIconDraftUrl}
                        on:input={(e) => (komodoIconDraftUrl = (e.target as HTMLInputElement).value)}
                      />
                      <button
                        type="button"
                        class="icon-manager-add"
                        disabled={!komodoIconDraftName.trim() || !komodoIconDraftUrl.trim()}
                        on:click={() => addKomodoIconOverride(widget)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </details>
              </div>
            {/if}

            {#if widget?.source === 'seerr-requests'}
              {@const showRequestMetrics = (widget?.options?.showMetrics as boolean) ?? false}
              {@const showRequestMetricBoxes = (widget?.options?.metricBoxes as boolean) ?? true}
              {@const showRequestMetricBorders = (widget?.options?.metricBoxBorder as boolean) ?? true}
              <details class="content-subaccordion">
                <summary>Metrics Row Style</summary>
                {#if !showRequestMetrics}
                  <div class="editor-empty seerr-style-empty">Enable metrics in Content to style this row.</div>
                {:else}
                  <div class="settings-group">
                    <div class="metric-grid-border-row">
                      <label class="pro-field compact item-toggle-field">
                        <span class="micro-label">Show Boxes</span>
                        <button
                          type="button"
                          class={`hyper-glass-toggle ${showRequestMetricBoxes ? 'on' : ''}`}
                          role="switch"
                          aria-checked={showRequestMetricBoxes}
                          aria-label="Show metric boxes"
                          on:click={() => updateWidget(selectedId, { options: { metricBoxes: !showRequestMetricBoxes } })}
                        >
                          <span class="hyper-glass-knob"></span>
                        </button>
                      </label>
                      <label class="pro-field compact item-toggle-field">
                        <span class="micro-label">Show Borders</span>
                        <button
                          type="button"
                          class={`hyper-glass-toggle ${showRequestMetricBorders ? 'on' : ''}`}
                          role="switch"
                          aria-checked={showRequestMetricBorders}
                          aria-label="Show metric borders"
                          on:click={() =>
                            updateWidget(selectedId, { options: { metricBoxBorder: !showRequestMetricBorders } })}
                        >
                          <span class="hyper-glass-knob"></span>
                        </button>
                      </label>
                    </div>
                    <div class="appearance-two-col color-row">
                      <label class="pro-field compact color-field">
                        <span class="micro-label">Box Background</span>
                        <div class="metric-grid-color-well">
                          <input
                            class="metric-grid-color-swatch"
                            type="color"
                            value={normalizeHexColor(widget?.options?.metricBoxBackgroundColor, '#0a1018')}
                            on:input={(e) =>
                              updateWidget(selectedId, { options: { metricBoxBackgroundColor: (e.target as HTMLInputElement).value } })}
                          />
                          <input
                            class="metric-grid-color-text"
                            type="text"
                            value={normalizeHexColor(widget?.options?.metricBoxBackgroundColor, '#0a1018')}
                            maxlength="7"
                            on:input={(e) =>
                              updateWidget(selectedId, { options: { metricBoxBackgroundColor: (e.target as HTMLInputElement).value } })}
                          />
                        </div>
                      </label>
                      <label class="pro-field compact color-field">
                        <span class="micro-label">Border Color</span>
                        <div class="metric-grid-color-well">
                          <input
                            class="metric-grid-color-swatch"
                            type="color"
                            value={normalizeHexColor(widget?.options?.metricBoxBorderColor, '#6aa8ff')}
                            on:input={(e) =>
                              updateWidget(selectedId, { options: { metricBoxBorderColor: (e.target as HTMLInputElement).value } })}
                          />
                          <input
                            class="metric-grid-color-text"
                            type="text"
                            value={normalizeHexColor(widget?.options?.metricBoxBorderColor, '#6aa8ff')}
                            maxlength="7"
                            on:input={(e) =>
                              updateWidget(selectedId, { options: { metricBoxBorderColor: (e.target as HTMLInputElement).value } })}
                          />
                        </div>
                      </label>
                    </div>
                    <div class="metric-grid-geometry-bar">
                      <div class="metric-grid-geometry-segment metric-grid-geometry-segment-width group">
                        <span class="metric-grid-geometry-label">W</span>
                        <input
                          class="metric-grid-geometry-input"
                          type="number"
                          min="0"
                          max="600"
                          value={Number((widget?.options?.metricBoxWidth as number) ?? 0)}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { metricBoxWidth: Number((e.target as HTMLInputElement).value) } })}
                        />
                      </div>
                      <div class="metric-grid-geometry-segment group">
                        <span class="metric-grid-geometry-label">H</span>
                        <input
                          class="metric-grid-geometry-input"
                          type="number"
                          min="24"
                          max="220"
                          value={Number((widget?.options?.metricBoxHeight as number) ?? 46)}
                          on:input={(e) =>
                            updateWidget(selectedId, { options: { metricBoxHeight: Number((e.target as HTMLInputElement).value) } })}
                        />
                      </div>
                    </div>
                  </div>
                  <TypographyControl
                    label="Metric Value"
                    summary={getTypographyDisplay(widget, 'metricValue', 'size')}
                    fontValue={isTypographyInherited(widget, 'metricValue', 'font') ? '' : String(getTypographyRaw(widget, 'metricValue', 'font') ?? '')}
                    fontInherited={isTypographyInherited(widget, 'metricValue', 'font')}
                    fontDisplay={getTypographyDisplay(widget, 'metricValue', 'font')}
                    fontOptions={typographyFontOptions}
                    weightValue={getTypographyNumeric(widget, 'metricValue', 'weight')}
                    weightInherited={isTypographyInherited(widget, 'metricValue', 'weight')}
                    sizeValue={getTypographyNumeric(widget, 'metricValue', 'size')}
                    sizeMin={8}
                    sizeMax={48}
                    colorValue={getTypographyColor(widget, 'metricValue')}
                    open={false}
                    on:font={(e) => setTypographyField(widget, 'metricValue', 'font', e.detail)}
                    on:weight={(e) => setTypographyField(widget, 'metricValue', 'weight', e.detail)}
                    on:size={(e) => setTypographyField(widget, 'metricValue', 'size', e.detail)}
                    on:color={(e) => setTypographyField(widget, 'metricValue', 'color', e.detail)}
                    on:colorReset={() => setTypographyField(widget, 'metricValue', 'color', '')}
                  />
                  <TypographyControl
                    label="Metric Label"
                    summary={getTypographyDisplay(widget, 'metricLabel', 'size')}
                    fontValue={isTypographyInherited(widget, 'metricLabel', 'font') ? '' : String(getTypographyRaw(widget, 'metricLabel', 'font') ?? '')}
                    fontInherited={isTypographyInherited(widget, 'metricLabel', 'font')}
                    fontDisplay={getTypographyDisplay(widget, 'metricLabel', 'font')}
                    fontOptions={typographyFontOptions}
                    weightValue={getTypographyNumeric(widget, 'metricLabel', 'weight')}
                    weightInherited={isTypographyInherited(widget, 'metricLabel', 'weight')}
                    sizeValue={getTypographyNumeric(widget, 'metricLabel', 'size')}
                    sizeMin={8}
                    sizeMax={48}
                    colorValue={getTypographyColor(widget, 'metricLabel')}
                    open={false}
                    on:font={(e) => setTypographyField(widget, 'metricLabel', 'font', e.detail)}
                    on:weight={(e) => setTypographyField(widget, 'metricLabel', 'weight', e.detail)}
                    on:size={(e) => setTypographyField(widget, 'metricLabel', 'size', e.detail)}
                    on:color={(e) => setTypographyField(widget, 'metricLabel', 'color', e.detail)}
                    on:colorReset={() => setTypographyField(widget, 'metricLabel', 'color', '')}
                  />
                {/if}
              </details>

              <details class="content-subaccordion">
                <summary>Request List Typography</summary>
                <TypographyControl
                  label="Movie Title"
                  summary={getTypographyDisplay(widget, 'requestTitleText', 'size')}
                  fontValue={isTypographyInherited(widget, 'requestTitleText', 'font') ? '' : String(getTypographyRaw(widget, 'requestTitleText', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'requestTitleText', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'requestTitleText', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'requestTitleText', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'requestTitleText', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'requestTitleText', 'size')}
                  sizeMin={9}
                  sizeMax={48}
                  colorValue={getTypographyColor(widget, 'requestTitleText')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'requestTitleText', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'requestTitleText', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'requestTitleText', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'requestTitleText', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'requestTitleText', 'color', '')}
                />
                <TypographyControl
                  label="Media Label"
                  summary={getTypographyDisplay(widget, 'requestMediaText', 'size')}
                  fontValue={isTypographyInherited(widget, 'requestMediaText', 'font') ? '' : String(getTypographyRaw(widget, 'requestMediaText', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'requestMediaText', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'requestMediaText', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'requestMediaText', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'requestMediaText', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'requestMediaText', 'size')}
                  sizeMin={8}
                  sizeMax={36}
                  colorValue={getTypographyColor(widget, 'requestMediaText')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'requestMediaText', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'requestMediaText', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'requestMediaText', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'requestMediaText', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'requestMediaText', 'color', '')}
                />
                <TypographyControl
                  label="Username"
                  summary={getTypographyDisplay(widget, 'requestUserText', 'size')}
                  fontValue={isTypographyInherited(widget, 'requestUserText', 'font') ? '' : String(getTypographyRaw(widget, 'requestUserText', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'requestUserText', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'requestUserText', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'requestUserText', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'requestUserText', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'requestUserText', 'size')}
                  sizeMin={9}
                  sizeMax={40}
                  colorValue={getTypographyColor(widget, 'requestUserText')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'requestUserText', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'requestUserText', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'requestUserText', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'requestUserText', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'requestUserText', 'color', '')}
                />
              </details>

              <details class="content-subaccordion">
                <summary>Status Badge Style</summary>
                <div class="settings-group">
                  <label>
                    Badge Scale ({Math.round(Number((widget?.options?.statusScale as number) ?? 1) * 100)}%)
                    <input
                      type="range"
                      min="10"
                      max="200"
                      step="5"
                      value={Math.round(Number((widget?.options?.statusScale as number) ?? 1) * 100)}
                      on:input={(e) =>
                        updateWidget(selectedId, {
                          options: { statusScale: Number((e.target as HTMLInputElement).value) / 100 }
                        })}
                    />
                  </label>
                </div>
                <TypographyControl
                  label="Badge Text"
                  summary={getTypographyDisplay(widget, 'requestBadgeText', 'size')}
                  fontValue={isTypographyInherited(widget, 'requestBadgeText', 'font') ? '' : String(getTypographyRaw(widget, 'requestBadgeText', 'font') ?? '')}
                  fontInherited={isTypographyInherited(widget, 'requestBadgeText', 'font')}
                  fontDisplay={getTypographyDisplay(widget, 'requestBadgeText', 'font')}
                  fontOptions={typographyFontOptions}
                  weightValue={getTypographyNumeric(widget, 'requestBadgeText', 'weight')}
                  weightInherited={isTypographyInherited(widget, 'requestBadgeText', 'weight')}
                  sizeValue={getTypographyNumeric(widget, 'requestBadgeText', 'size')}
                  sizeMin={8}
                  sizeMax={36}
                  colorValue={getTypographyColor(widget, 'requestBadgeText')}
                  open={false}
                  on:font={(e) => setTypographyField(widget, 'requestBadgeText', 'font', e.detail)}
                  on:weight={(e) => setTypographyField(widget, 'requestBadgeText', 'weight', e.detail)}
                  on:size={(e) => setTypographyField(widget, 'requestBadgeText', 'size', e.detail)}
                  on:color={(e) => setTypographyField(widget, 'requestBadgeText', 'color', e.detail)}
                  on:colorReset={() => setTypographyField(widget, 'requestBadgeText', 'color', '')}
                />
              </details>
            {/if}

            {#if widget?.source === 'seerr'}
              <p class="field-title">Metrics</p>
              <div class="metric-options">
                {#each seerrMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getWidgetMetrics(widget, seerrMetricOptions, ['pending', 'approved', 'processing', 'available'], seerrMetricOptions.length).includes(option)}
                      on:change={() =>
                        toggleWidgetMetric(
                          widget,
                          option,
                          seerrMetricOptions,
                          ['pending', 'approved', 'processing', 'available'],
                          seerrMetricOptions.length
                        )}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="metric-order-list">
                {#each getWidgetMetrics(widget, seerrMetricOptions, ['pending', 'approved', 'processing', 'available'], seerrMetricOptions.length) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || metricLabels[selectedMetric]) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button
                        class="mini"
                        type="button"
                        disabled={index === 0}
                        on:click={() =>
                          moveWidgetMetric(
                            widget,
                            selectedMetric,
                            'up',
                            seerrMetricOptions,
                            ['pending', 'approved', 'processing', 'available'],
                            seerrMetricOptions.length
                          )}
                      >↑</button>
                      <button
                        class="mini"
                        type="button"
                        disabled={index === getWidgetMetrics(widget, seerrMetricOptions, ['pending', 'approved', 'processing', 'available'], seerrMetricOptions.length).length - 1}
                        on:click={() =>
                          moveWidgetMetric(
                            widget,
                            selectedMetric,
                            'down',
                            seerrMetricOptions,
                            ['pending', 'approved', 'processing', 'available'],
                            seerrMetricOptions.length
                          )}
                      >↓</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if widget?.source === 'radarr'}
              <p class="field-title">Metrics</p>
              <div class="metric-options">
                {#each radarrMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getWidgetMetrics(widget, radarrMetricOptions, ['wanted', 'missing', 'queued'], 4).includes(option)}
                      on:change={() => toggleWidgetMetric(widget, option, radarrMetricOptions, ['wanted', 'missing', 'queued'], 4)}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="metric-order-list">
                {#each getWidgetMetrics(widget, radarrMetricOptions, ['wanted', 'missing', 'queued'], 4) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || metricLabels[selectedMetric]) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button class="mini" type="button" disabled={index === 0} on:click={() => moveWidgetMetric(widget, selectedMetric, 'up', radarrMetricOptions, ['wanted', 'missing', 'queued'], 4)}>↑</button>
                      <button class="mini" type="button" disabled={index === getWidgetMetrics(widget, radarrMetricOptions, ['wanted', 'missing', 'queued'], 4).length - 1} on:click={() => moveWidgetMetric(widget, selectedMetric, 'down', radarrMetricOptions, ['wanted', 'missing', 'queued'], 4)}>↓</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if widget?.source === 'readarr'}
              <p class="field-title">Metrics</p>
              <div class="metric-options">
                {#each readarrMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getWidgetMetrics(widget, readarrMetricOptions, ['wanted', 'queued', 'books'], 3).includes(option)}
                      on:change={() => toggleWidgetMetric(widget, option, readarrMetricOptions, ['wanted', 'queued', 'books'], 3)}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="metric-order-list">
                {#each getWidgetMetrics(widget, readarrMetricOptions, ['wanted', 'queued', 'books'], 3) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || metricLabels[selectedMetric]) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button class="mini" type="button" disabled={index === 0} on:click={() => moveWidgetMetric(widget, selectedMetric, 'up', readarrMetricOptions, ['wanted', 'queued', 'books'], 3)}>↑</button>
                      <button class="mini" type="button" disabled={index === getWidgetMetrics(widget, readarrMetricOptions, ['wanted', 'queued', 'books'], 3).length - 1} on:click={() => moveWidgetMetric(widget, selectedMetric, 'down', readarrMetricOptions, ['wanted', 'queued', 'books'], 3)}>↓</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if widget?.source === 'sonarr'}
              <p class="field-title">Metrics</p>
              <div class="metric-options">
                {#each sonarrMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getWidgetMetrics(widget, sonarrMetricOptions, ['wanted', 'queued', 'series'], 3).includes(option)}
                      on:change={() => toggleWidgetMetric(widget, option, sonarrMetricOptions, ['wanted', 'queued', 'series'], 3)}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="metric-order-list">
                {#each getWidgetMetrics(widget, sonarrMetricOptions, ['wanted', 'queued', 'series'], 3) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || metricLabels[selectedMetric]) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button class="mini" type="button" disabled={index === 0} on:click={() => moveWidgetMetric(widget, selectedMetric, 'up', sonarrMetricOptions, ['wanted', 'queued', 'series'], 3)}>↑</button>
                      <button class="mini" type="button" disabled={index === getWidgetMetrics(widget, sonarrMetricOptions, ['wanted', 'queued', 'series'], 3).length - 1} on:click={() => moveWidgetMetric(widget, selectedMetric, 'down', sonarrMetricOptions, ['wanted', 'queued', 'series'], 3)}>↓</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if widget?.source === 'audiobookshelf'}
              <p class="field-title">Metrics</p>
              <div class="metric-options">
                {#each audiobookshelfMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getWidgetMetrics(widget, audiobookshelfMetricOptions, ['podcasts', 'podcastsDuration', 'books', 'booksDuration'], 4).includes(option)}
                      on:change={() => toggleWidgetMetric(widget, option, audiobookshelfMetricOptions, ['podcasts', 'podcastsDuration', 'books', 'booksDuration'], 4)}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="metric-order-list">
                {#each getWidgetMetrics(widget, audiobookshelfMetricOptions, ['podcasts', 'podcastsDuration', 'books', 'booksDuration'], 4) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || metricLabels[selectedMetric]) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button class="mini" type="button" disabled={index === 0} on:click={() => moveWidgetMetric(widget, selectedMetric, 'up', audiobookshelfMetricOptions, ['podcasts', 'podcastsDuration', 'books', 'booksDuration'], 4)}>↑</button>
                      <button class="mini" type="button" disabled={index === getWidgetMetrics(widget, audiobookshelfMetricOptions, ['podcasts', 'podcastsDuration', 'books', 'booksDuration'], 4).length - 1} on:click={() => moveWidgetMetric(widget, selectedMetric, 'down', audiobookshelfMetricOptions, ['podcasts', 'podcastsDuration', 'books', 'booksDuration'], 4)}>↓</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if widget?.source === 'komodo' && (widget?.kind as string) === 'stat'}
              <p class="field-title">Metrics</p>
              <div class="metric-options">
                {#each komodoMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getWidgetMetrics(widget, komodoMetricOptions, ['summary_servers', 'summary_stacks', 'summary_containers'], komodoMetricOptions.length).includes(option)}
                      on:change={() => toggleWidgetMetric(widget, option, komodoMetricOptions, ['summary_servers', 'summary_stacks', 'summary_containers'], komodoMetricOptions.length)}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="metric-order-list">
                {#each getWidgetMetrics(widget, komodoMetricOptions, ['summary_servers', 'summary_stacks', 'summary_containers'], komodoMetricOptions.length) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || metricLabels[selectedMetric]) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button class="mini" type="button" disabled={index === 0} on:click={() => moveWidgetMetric(widget, selectedMetric, 'up', komodoMetricOptions, ['summary_servers', 'summary_stacks', 'summary_containers'], komodoMetricOptions.length)}>↑</button>
                      <button class="mini" type="button" disabled={index === getWidgetMetrics(widget, komodoMetricOptions, ['summary_servers', 'summary_stacks', 'summary_containers'], komodoMetricOptions.length).length - 1} on:click={() => moveWidgetMetric(widget, selectedMetric, 'down', komodoMetricOptions, ['summary_servers', 'summary_stacks', 'summary_containers'], komodoMetricOptions.length)}>↓</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if widget?.source === 'prowlarr' && (widget?.kind as string) === 'stat'}
              <p class="field-title">Metrics</p>
              <div class="metric-options">
                {#each prowlarrMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getWidgetMetrics(widget, prowlarrMetricOptions, ['numberOfGrabs', 'numberOfQueries', 'numberOfFailGrabs', 'numberOfFailQueries'], prowlarrMetricOptions.length).includes(option)}
                      on:change={() => toggleWidgetMetric(widget, option, prowlarrMetricOptions, ['numberOfGrabs', 'numberOfQueries', 'numberOfFailGrabs', 'numberOfFailQueries'], prowlarrMetricOptions.length)}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="metric-order-list">
                {#each getWidgetMetrics(widget, prowlarrMetricOptions, ['numberOfGrabs', 'numberOfQueries', 'numberOfFailGrabs', 'numberOfFailQueries'], prowlarrMetricOptions.length) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || metricLabels[selectedMetric]) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button class="mini" type="button" disabled={index === 0} on:click={() => moveWidgetMetric(widget, selectedMetric, 'up', prowlarrMetricOptions, ['numberOfGrabs', 'numberOfQueries', 'numberOfFailGrabs', 'numberOfFailQueries'], prowlarrMetricOptions.length)}>↑</button>
                      <button class="mini" type="button" disabled={index === getWidgetMetrics(widget, prowlarrMetricOptions, ['numberOfGrabs', 'numberOfQueries', 'numberOfFailGrabs', 'numberOfFailQueries'], prowlarrMetricOptions.length).length - 1} on:click={() => moveWidgetMetric(widget, selectedMetric, 'down', prowlarrMetricOptions, ['numberOfGrabs', 'numberOfQueries', 'numberOfFailGrabs', 'numberOfFailQueries'], prowlarrMetricOptions.length)}>↓</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if widget?.source === 'profilarr' && (widget?.kind as string) === 'stat'}
              <p class="field-title">Metrics</p>
              <div class="metric-options">
                {#each profilarrMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getWidgetMetrics(widget, profilarrMetricOptions, ['lastRepoSync', 'lastCommit', 'syncedProfiles'], profilarrMetricOptions.length).includes(option)}
                      on:change={() => toggleWidgetMetric(widget, option, profilarrMetricOptions, ['lastRepoSync', 'lastCommit', 'syncedProfiles'], profilarrMetricOptions.length)}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="metric-order-list">
                {#each getWidgetMetrics(widget, profilarrMetricOptions, ['lastRepoSync', 'lastCommit', 'syncedProfiles'], profilarrMetricOptions.length) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || metricLabels[selectedMetric]) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button class="mini" type="button" disabled={index === 0} on:click={() => moveWidgetMetric(widget, selectedMetric, 'up', profilarrMetricOptions, ['lastRepoSync', 'lastCommit', 'syncedProfiles'], profilarrMetricOptions.length)}>↑</button>
                      <button class="mini" type="button" disabled={index === getWidgetMetrics(widget, profilarrMetricOptions, ['lastRepoSync', 'lastCommit', 'syncedProfiles'], profilarrMetricOptions.length).length - 1} on:click={() => moveWidgetMetric(widget, selectedMetric, 'down', profilarrMetricOptions, ['lastRepoSync', 'lastCommit', 'syncedProfiles'], profilarrMetricOptions.length)}>↓</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if widget?.source === 'sabnzbd' && widget?.kind !== 'sabnzbd'}
              <p class="field-title">Metrics</p>
              <div class="metric-options">
                {#each sabnzbdMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getWidgetMetrics(widget, sabnzbdMetricOptions, ['rate', 'queue', 'timeleft'], 3).includes(option)}
                      on:change={() => toggleWidgetMetric(widget, option, sabnzbdMetricOptions, ['rate', 'queue', 'timeleft'], 3)}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="metric-order-list">
                {#each getWidgetMetrics(widget, sabnzbdMetricOptions, ['rate', 'queue', 'timeleft'], 3) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || metricLabels[selectedMetric]) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button class="mini" type="button" disabled={index === 0} on:click={() => moveWidgetMetric(widget, selectedMetric, 'up', sabnzbdMetricOptions, ['rate', 'queue', 'timeleft'], 3)}>↑</button>
                      <button class="mini" type="button" disabled={index === getWidgetMetrics(widget, sabnzbdMetricOptions, ['rate', 'queue', 'timeleft'], 3).length - 1} on:click={() => moveWidgetMetric(widget, selectedMetric, 'down', sabnzbdMetricOptions, ['rate', 'queue', 'timeleft'], 3)}>↓</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if widget?.source === 'qbittorrent' && widget?.kind !== 'sabnzbd'}
              <p class="field-title">Metrics</p>
              <div class="metric-options">
                {#each qbittorrentMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getWidgetMetrics(widget, qbittorrentMetricOptions, ['leech', 'download', 'seed', 'upload'], 4).includes(option)}
                      on:change={() => toggleWidgetMetric(widget, option, qbittorrentMetricOptions, ['leech', 'download', 'seed', 'upload'], 4)}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="metric-order-list">
                {#each getWidgetMetrics(widget, qbittorrentMetricOptions, ['leech', 'download', 'seed', 'upload'], 4) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || metricLabels[selectedMetric]) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button class="mini" type="button" disabled={index === 0} on:click={() => moveWidgetMetric(widget, selectedMetric, 'up', qbittorrentMetricOptions, ['leech', 'download', 'seed', 'upload'], 4)}>↑</button>
                      <button class="mini" type="button" disabled={index === getWidgetMetrics(widget, qbittorrentMetricOptions, ['leech', 'download', 'seed', 'upload'], 4).length - 1} on:click={() => moveWidgetMetric(widget, selectedMetric, 'down', qbittorrentMetricOptions, ['leech', 'download', 'seed', 'upload'], 4)}>↓</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if widget?.source === 'scrutiny'}
              <p class="field-title">Metrics</p>
              <div class="metric-options">
                {#each scrutinyMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getWidgetMetrics(widget, scrutinyMetricOptions, ['passed', 'failed', 'unknown'], 3).includes(option)}
                      on:change={() => toggleWidgetMetric(widget, option, scrutinyMetricOptions, ['passed', 'failed', 'unknown'], 3)}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="metric-order-list">
                {#each getWidgetMetrics(widget, scrutinyMetricOptions, ['passed', 'failed', 'unknown'], 3) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || metricLabels[selectedMetric]) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button class="mini" type="button" disabled={index === 0} on:click={() => moveWidgetMetric(widget, selectedMetric, 'up', scrutinyMetricOptions, ['passed', 'failed', 'unknown'], 3)}>↑</button>
                      <button class="mini" type="button" disabled={index === getWidgetMetrics(widget, scrutinyMetricOptions, ['passed', 'failed', 'unknown'], 3).length - 1} on:click={() => moveWidgetMetric(widget, selectedMetric, 'down', scrutinyMetricOptions, ['passed', 'failed', 'unknown'], 3)}>↓</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if widget?.source === 'tandoor'}
              <p class="field-title">Metrics</p>
              <div class="metric-options">
                {#each tandoorMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getWidgetMetrics(widget, tandoorMetricOptions, ['users', 'recipes', 'keywords'], 3).includes(option)}
                      on:change={() => toggleWidgetMetric(widget, option, tandoorMetricOptions, ['users', 'recipes', 'keywords'], 3)}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="metric-order-list">
                {#each getWidgetMetrics(widget, tandoorMetricOptions, ['users', 'recipes', 'keywords'], 3) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || metricLabels[selectedMetric]) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button class="mini" type="button" disabled={index === 0} on:click={() => moveWidgetMetric(widget, selectedMetric, 'up', tandoorMetricOptions, ['users', 'recipes', 'keywords'], 3)}>↑</button>
                      <button class="mini" type="button" disabled={index === getWidgetMetrics(widget, tandoorMetricOptions, ['users', 'recipes', 'keywords'], 3).length - 1} on:click={() => moveWidgetMetric(widget, selectedMetric, 'down', tandoorMetricOptions, ['users', 'recipes', 'keywords'], 3)}>↓</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if widget?.source === 'speedtest-tracker' && (widget?.kind as string) === 'stat'}
              <p class="field-title">Metrics</p>
              <div class="metric-options">
                {#each speedtestTrackerMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getWidgetMetrics(widget, speedtestTrackerMetricOptions, ['download', 'upload', 'ping'], 3).includes(option)}
                      on:change={() => toggleWidgetMetric(widget, option, speedtestTrackerMetricOptions, ['download', 'upload', 'ping'], 3)}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="metric-order-list">
                {#each getWidgetMetrics(widget, speedtestTrackerMetricOptions, ['download', 'upload', 'ping'], 3) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || metricLabels[selectedMetric]) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button class="mini" type="button" disabled={index === 0} on:click={() => moveWidgetMetric(widget, selectedMetric, 'up', speedtestTrackerMetricOptions, ['download', 'upload', 'ping'], 3)}>↑</button>
                      <button class="mini" type="button" disabled={index === getWidgetMetrics(widget, speedtestTrackerMetricOptions, ['download', 'upload', 'ping'], 3).length - 1} on:click={() => moveWidgetMetric(widget, selectedMetric, 'down', speedtestTrackerMetricOptions, ['download', 'upload', 'ping'], 3)}>↓</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if widget?.source === 'home-assistant'}
              <p class="field-title">Built-in Metrics</p>
              <div class="metric-options">
                {#each homeAssistantMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getHomeAssistantMetricOrder(widget).includes(option)}
                      on:change={() =>
                        toggleWidgetMetric(
                          widget,
                          option,
                          getHomeAssistantAllowedMetricKeys(widget),
                          getHomeAssistantMetricOrder(widget),
                          getHomeAssistantAllowedMetricKeys(widget).length,
                          true
                        )}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="monitor-targets-section">
                <div class="monitor-targets-header">
                  <p class="field-title">Custom Metrics</p>
                  <button
                    class="mini"
                    type="button"
                    disabled={homeAssistantCustomMetricsForSelected.length >= MAX_HOME_ASSISTANT_CUSTOM_METRICS}
                    on:click={() => addHomeAssistantCustomMetric(selectedId)}
                  >
                    Add Metric
                  </button>
                </div>
                <p class="source-help">
                  Use either an entity `state` or a `template`. If label/value are blank, Home Assistant defaults are used.
                </p>
                {#if homeAssistantCustomMetricsForSelected.length === 0}
                  <div class="editor-empty">No custom metrics yet.</div>
                {:else}
                  <div class="monitor-target-list">
                    {#each homeAssistantCustomMetricsForSelected as metric, index (index)}
                      <div class="monitor-target-row">
                        <label>
                          State Entity (optional)
                          <input
                            type="text"
                            value={metric.state}
                            placeholder="sensor.total_power"
                            on:input={(e) =>
                              updateHomeAssistantCustomMetricField(
                                selectedId,
                                index,
                                'state',
                                (e.target as HTMLInputElement).value
                              )}
                          />
                        </label>
                        <label>
                          Template (optional)
                          <input
                            type="text"
                            value={metric.template}
                            placeholder="Home Assistant template"
                            on:input={(e) =>
                              updateHomeAssistantCustomMetricField(
                                selectedId,
                                index,
                                'template',
                                (e.target as HTMLInputElement).value
                              )}
                          />
                        </label>
                        <label>
                          Label (optional)
                          <input
                            type="text"
                            value={metric.label}
                            placeholder={'{attributes.friendly_name}'}
                            on:input={(e) =>
                              updateHomeAssistantCustomMetricField(
                                selectedId,
                                index,
                                'label',
                                (e.target as HTMLInputElement).value
                              )}
                          />
                        </label>
                        <label>
                          Value Template (optional)
                          <input
                            type="text"
                            value={metric.value}
                            placeholder={'{state} {attributes.unit_of_measurement}'}
                            on:input={(e) =>
                              updateHomeAssistantCustomMetricField(
                                selectedId,
                                index,
                                'value',
                                (e.target as HTMLInputElement).value
                              )}
                          />
                        </label>
                        <button class="mini danger" type="button" on:click={() => removeHomeAssistantCustomMetric(selectedId, index)}>
                          Remove
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
              <p class="field-title">Metric Ordering</p>
              <div class="metric-order-list">
                {#each getHomeAssistantMetricOrder(widget) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || getHomeAssistantMetricDisplayLabel(widget, selectedMetric)) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button
                        class="mini"
                        type="button"
                        disabled={index === 0}
                        on:click={() =>
                          moveWidgetMetric(
                            widget,
                            selectedMetric,
                            'up',
                            getHomeAssistantAllowedMetricKeys(widget),
                            getHomeAssistantMetricOrder(widget),
                            getHomeAssistantAllowedMetricKeys(widget).length,
                            true
                          )}
                      >
                        ↑
                      </button>
                      <button
                        class="mini"
                        type="button"
                        disabled={index === getHomeAssistantMetricOrder(widget).length - 1}
                        on:click={() =>
                          moveWidgetMetric(
                            widget,
                            selectedMetric,
                            'down',
                            getHomeAssistantAllowedMetricKeys(widget),
                            getHomeAssistantMetricOrder(widget),
                            getHomeAssistantAllowedMetricKeys(widget).length,
                            true
                          )}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}

            {#if widget?.source === 'plex' && widget?.kind !== 'plex' && widget?.kind !== 'history'}
              <p class="field-title">Metrics</p>
              <div class="metric-options">
                {#each plexMetricOptions as option}
                  <label class="checkbox metric-option">
                    <input
                      type="checkbox"
                      checked={getWidgetMetrics(widget, plexMetricOptions, ['streams', 'albums', 'movies', 'tv'], 4).includes(option)}
                      on:change={() => toggleWidgetMetric(widget, option, plexMetricOptions, ['streams', 'albums', 'movies', 'tv'], 4)}
                    />
                    {metricLabels[option]}
                  </label>
                {/each}
              </div>
              <div class="metric-order-list">
                {#each getWidgetMetrics(widget, plexMetricOptions, ['streams', 'albums', 'movies', 'tv'], 4) as selectedMetric, index}
                  <div class="metric-order-item">
                    <div class="metric-order-main">
                      <span>{index + 1}. {(getMetricLabelOverride(widget, selectedMetric) || metricLabels[selectedMetric]) ?? selectedMetric}</span>
                      {#if (widget?.kind as string) === "stat"}
                        <input
                          class="metric-label-override"
                          type="text"
                          placeholder="Override label"
                          value={getMetricLabelOverride(widget, selectedMetric)}
                          on:input={(e) => setMetricLabelOverride(widget, selectedMetric, (e.target as HTMLInputElement).value)}
                        />
                      {/if}
                    </div>
                    <div class="metric-order-actions">
                      <button class="mini" type="button" disabled={index === 0} on:click={() => moveWidgetMetric(widget, selectedMetric, 'up', plexMetricOptions, ['streams', 'albums', 'movies', 'tv'], 4)}>↑</button>
                      <button class="mini" type="button" disabled={index === getWidgetMetrics(widget, plexMetricOptions, ['streams', 'albums', 'movies', 'tv'], 4).length - 1} on:click={() => moveWidgetMetric(widget, selectedMetric, 'down', plexMetricOptions, ['streams', 'albums', 'movies', 'tv'], 4)}>↓</button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
            {/if}

          </div>
          </details>
          {#if !(widget?.source === 'komodo' && (widget?.kind as string) !== 'stat')}
          <details class="inspector-accordion content-metrics">
            <summary>Content & Metrics</summary>
            <div class="panel-section settings-table">
              {#if (widget?.kind as string) === 'stat'}
                {@const metricGridConfig = getMetricGridMetricConfig(widget)}
                {#if metricGridConfig}
                  {@const selectedMetrics = getWidgetMetrics(
                    widget,
                    metricGridConfig.allowed,
                    metricGridConfig.fallback,
                    metricGridConfig.max,
                    metricGridConfig.allowEmpty
                  )}
                  {#if widget?.source === 'home-assistant'}
                    <p class="appearance-subheader">Custom Data Sources</p>
                    <div class="custom-entity-list">
                      {#if homeAssistantCustomMetricsForSelected.length === 0}
                        <div class="editor-empty">No custom entities yet.</div>
                      {:else}
                        {#each homeAssistantCustomMetricsForSelected as metric, index (index)}
                          {@const customTitle =
                            metric.label.trim() ||
                            metric.state.trim() ||
                            metric.template.trim() ||
                            'New Entity'}
                          <details class="custom-entity-card">
                            <summary>
                              <span class="custom-entity-title">{customTitle}</span>
                              <span class="custom-entity-actions">
                                <button
                                  class="custom-entity-delete"
                                  type="button"
                                  aria-label={`Delete custom entity ${index + 1}`}
                                  on:click|preventDefault|stopPropagation={() =>
                                    removeHomeAssistantCustomMetric(selectedId, index)}
                                >
                                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 6h18"></path>
                                    <path d="M8 6V4h8v2"></path>
                                    <path d="M19 6l-1 14H6L5 6"></path>
                                    <path d="M10 11v6"></path>
                                    <path d="M14 11v6"></path>
                                  </svg>
                                </button>
                                <span class="custom-entity-chevron" aria-hidden="true">▾</span>
                              </span>
                            </summary>
                            <div class="custom-entity-body">
                              <label class="custom-entity-field">
                                <span>Entity</span>
                                <input
                                  type="text"
                                  value={metric.state}
                                  placeholder="sensor.temp"
                                  on:input={(e) =>
                                    updateHomeAssistantCustomMetricField(
                                      selectedId,
                                      index,
                                      'state',
                                      (e.target as HTMLInputElement).value
                                    )}
                                />
                              </label>
                              <label class="custom-entity-field">
                                <span>HA Template</span>
                                <input
                                  type="text"
                                  value={metric.template}
                                  placeholder={'{{ ... }}'}
                                  on:input={(e) =>
                                    updateHomeAssistantCustomMetricField(
                                      selectedId,
                                      index,
                                      'template',
                                      (e.target as HTMLInputElement).value
                                    )}
                                />
                              </label>
                              <label class="custom-entity-field">
                                <span>Label</span>
                                <input
                                  type="text"
                                  value={metric.label}
                                  placeholder="Upstairs Temp"
                                  on:input={(e) =>
                                    updateHomeAssistantCustomMetricField(
                                      selectedId,
                                      index,
                                      'label',
                                      (e.target as HTMLInputElement).value
                                    )}
                                />
                              </label>
                              <label class="custom-entity-field">
                                <span>Value Template</span>
                                <input
                                  type="text"
                                  value={metric.value}
                                  placeholder={'{state} {attributes.unit_of_measurement}'}
                                  on:input={(e) =>
                                    updateHomeAssistantCustomMetricField(
                                      selectedId,
                                      index,
                                      'value',
                                      (e.target as HTMLInputElement).value
                                    )}
                                />
                              </label>
                            </div>
                          </details>
                        {/each}
                      {/if}
                    </div>
                    <button
                      type="button"
                      class="custom-entity-add"
                      on:click={() => addHomeAssistantCustomMetric(selectedId)}
                      disabled={homeAssistantCustomMetricsForSelected.length >= MAX_HOME_ASSISTANT_CUSTOM_METRICS}
                    >
                      + Add Custom Entity
                    </button>
                  {/if}
                  <p class="appearance-subheader">Display Order & Visibility</p>
                  <div class="metric-manager-list">
                    {#each metricGridConfig.allowed as metric}
                      {@const isVisible = selectedMetrics.includes(metric)}
                      {@const metricIndex = selectedMetrics.indexOf(metric)}
                      <div class="metric-manager-row">
                        <div class="metric-manager-reorder">
                          <button
                            class="mini"
                            type="button"
                            disabled={!isVisible || metricIndex <= 0}
                            on:click={() =>
                              moveWidgetMetric(
                                widget,
                                metric,
                                'up',
                                metricGridConfig.allowed,
                                metricGridConfig.fallback,
                                metricGridConfig.max,
                                metricGridConfig.allowEmpty
                              )}
                          >
                            ↑
                          </button>
                          <button
                            class="mini"
                            type="button"
                            disabled={!isVisible || metricIndex < 0 || metricIndex >= selectedMetrics.length - 1}
                            on:click={() =>
                              moveWidgetMetric(
                                widget,
                                metric,
                                'down',
                                metricGridConfig.allowed,
                                metricGridConfig.fallback,
                                metricGridConfig.max,
                                metricGridConfig.allowEmpty
                              )}
                          >
                            ↓
                          </button>
                        </div>
                        <span class="metric-manager-badge">{metricLabels[metric] ?? metric}</span>
                        <input
                          class="metric-manager-override"
                          type="text"
                          placeholder="Rename..."
                          value={getMetricLabelOverride(widget, metric)}
                          on:input={(e) => setMetricLabelOverride(widget, metric, (e.target as HTMLInputElement).value)}
                        />
                        <button
                          type="button"
                          class={`hyper-glass-toggle ${isVisible ? 'on' : ''}`}
                          role="switch"
                          aria-checked={isVisible}
                          aria-label={`Show ${metricLabels[metric] ?? metric}`}
                          on:click={() =>
                            toggleWidgetMetric(
                              widget,
                              metric,
                              metricGridConfig.allowed,
                              metricGridConfig.fallback,
                              metricGridConfig.max,
                              metricGridConfig.allowEmpty
                            )}
                        >
                          <span class="hyper-glass-knob"></span>
                        </button>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <div class="editor-empty">Metric controls are unavailable for this source.</div>
                {/if}
              {:else if widget?.source === 'seerr-requests'}
                {@const requestMetricFallback = ['pending', 'approved', 'processing', 'available']}
                {@const requestMetrics = getWidgetMetrics(
                  widget,
                  seerrMetricOptions,
                  requestMetricFallback,
                  seerrMetricOptions.length,
                  true
                )}
                <p class="appearance-subheader">Request Configuration</p>
                <label>
                  Request Limit
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={Number((widget?.options?.limit as number) ?? 10)}
                    on:input={(e) =>
                      updateWidget(selectedId, { options: { limit: Number((e.target as HTMLInputElement).value) } })
                    }
                  />
                </label>
                <p class="appearance-subheader">Metrics Manager</p>
                <div class="metric-manager-list">
                  {#each seerrMetricOptions as metric}
                    {@const isVisible = requestMetrics.includes(metric)}
                    {@const metricIndex = requestMetrics.indexOf(metric)}
                    <div class="metric-manager-row">
                      <div class="metric-manager-reorder">
                        <span class="metric-manager-drag" aria-hidden="true">⋮⋮</span>
                        <button
                          class="mini"
                          type="button"
                          disabled={!isVisible || metricIndex <= 0}
                          on:click={() => {
                            moveWidgetMetric(
                              widget,
                              metric,
                              'up',
                              seerrMetricOptions,
                              requestMetricFallback,
                              seerrMetricOptions.length,
                              true
                            );
                            updateWidget(selectedId, { options: { showMetrics: true } });
                          }}
                        >
                          ↑
                        </button>
                        <button
                          class="mini"
                          type="button"
                          disabled={!isVisible || metricIndex < 0 || metricIndex >= requestMetrics.length - 1}
                          on:click={() => {
                            moveWidgetMetric(
                              widget,
                              metric,
                              'down',
                              seerrMetricOptions,
                              requestMetricFallback,
                              seerrMetricOptions.length,
                              true
                            );
                            updateWidget(selectedId, { options: { showMetrics: true } });
                          }}
                        >
                          ↓
                        </button>
                      </div>
                      <span class="metric-manager-badge">{metricLabels[metric] ?? metric}</span>
                      <input
                        class="metric-manager-override"
                        type="text"
                        placeholder="Rename..."
                        value={getMetricLabelOverride(widget, metric)}
                        on:input={(e) => setMetricLabelOverride(widget, metric, (e.target as HTMLInputElement).value)}
                      />
                      <button
                        type="button"
                        class={`hyper-glass-toggle ${isVisible ? 'on' : ''}`}
                        role="switch"
                        aria-checked={isVisible}
                        aria-label={`Show ${metricLabels[metric] ?? metric}`}
                        on:click={() => {
                          toggleWidgetMetric(
                            widget,
                            metric,
                            seerrMetricOptions,
                            requestMetricFallback,
                            seerrMetricOptions.length,
                            true
                          );
                          const currentlyVisible = requestMetrics.length;
                          if (isVisible && currentlyVisible <= 1) {
                            updateWidget(selectedId, { options: { showMetrics: false } });
                          } else if (!isVisible) {
                            updateWidget(selectedId, { options: { showMetrics: true } });
                          }
                        }}
                      >
                        <span class="hyper-glass-knob"></span>
                      </button>
                    </div>
                  {/each}
                </div>
              {:else if widget?.kind === 'speedtest'}
                <p class="speedtest-content-header">Graph Data</p>
                <label>
                  Time Period
                  <select
                    value={(widget?.options?.speedtestTimeframe as string) ?? '48h'}
                    on:change={(e) =>
                      updateWidget(selectedId, { options: { speedtestTimeframe: (e.target as HTMLSelectElement).value } })
                    }
                  >
                    <option value="6h">Last 6 hours</option>
                    <option value="12h">Last 12 hours</option>
                    <option value="24h">Last 24 hours</option>
                    <option value="48h">Last 48 hours</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>
                {#if ((widget?.options?.speedtestTimeframe as string) ?? '48h') === 'custom'}
                  <div class="appearance-two-col">
                    <label>
                      Custom From
                      <input
                        type="text"
                        value={(widget?.options?.speedtestFrom as string) ?? 'now-48h'}
                        placeholder="now-48h"
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { speedtestFrom: (e.target as HTMLInputElement).value } })
                        }
                      />
                    </label>
                    <label>
                      Custom To
                      <input
                        type="text"
                        value={(widget?.options?.speedtestTo as string) ?? 'now'}
                        placeholder="now"
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { speedtestTo: (e.target as HTMLInputElement).value } })
                        }
                      />
                    </label>
                  </div>
                {/if}
                <label>
                  Data Points Limit
                  <input
                    type="number"
                    min="20"
                    max="1200"
                    value={Number((widget?.options?.speedtestPointsLimit as number) ?? 240)}
                    on:input={(e) =>
                      updateWidget(selectedId, { options: { speedtestPointsLimit: Number((e.target as HTMLInputElement).value) } })
                    }
                  />
                </label>

                <p class="speedtest-content-header">Table Columns</p>
                <div class="speedtest-table-master-row">
                  <span class="speedtest-toggle-label">Show Table</span>
                  <button
                    type="button"
                    class={`hyper-glass-toggle speedtest-compact-toggle ${((widget?.options?.speedtestShowTable as boolean) ?? true) ? 'on' : ''}`}
                    role="switch"
                    aria-checked={((widget?.options?.speedtestShowTable as boolean) ?? true)}
                    aria-label="Show table"
                    on:click={() =>
                      updateWidget(selectedId, { options: { speedtestShowTable: !((widget?.options?.speedtestShowTable as boolean) ?? true) } })}
                  >
                    <span class="hyper-glass-knob"></span>
                  </button>
                </div>
                <div class="speedtest-columns-grid">
                  <div class="speedtest-column-toggle-cell">
                    <span class="speedtest-toggle-label">Mean Column</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle speedtest-compact-toggle ${((widget?.options?.speedtestTableShowMean as boolean) ?? true) ? 'on' : ''}`}
                      role="switch"
                      aria-checked={((widget?.options?.speedtestTableShowMean as boolean) ?? true)}
                      aria-label="Show mean column"
                      on:click={() =>
                        updateWidget(selectedId, { options: { speedtestTableShowMean: !((widget?.options?.speedtestTableShowMean as boolean) ?? true) } })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </div>
                  <div class="speedtest-column-toggle-cell">
                    <span class="speedtest-toggle-label">Last Column</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle speedtest-compact-toggle ${((widget?.options?.speedtestTableShowLast as boolean) ?? true) ? 'on' : ''}`}
                      role="switch"
                      aria-checked={((widget?.options?.speedtestTableShowLast as boolean) ?? true)}
                      aria-label="Show last column"
                      on:click={() =>
                        updateWidget(selectedId, { options: { speedtestTableShowLast: !((widget?.options?.speedtestTableShowLast as boolean) ?? true) } })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </div>
                  <div class="speedtest-column-toggle-cell">
                    <span class="speedtest-toggle-label">Min Column</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle speedtest-compact-toggle ${((widget?.options?.speedtestTableShowMin as boolean) ?? false) ? 'on' : ''}`}
                      role="switch"
                      aria-checked={((widget?.options?.speedtestTableShowMin as boolean) ?? false)}
                      aria-label="Show min column"
                      on:click={() =>
                        updateWidget(selectedId, { options: { speedtestTableShowMin: !((widget?.options?.speedtestTableShowMin as boolean) ?? false) } })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </div>
                  <div class="speedtest-column-toggle-cell">
                    <span class="speedtest-toggle-label">Max Column</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle speedtest-compact-toggle ${((widget?.options?.speedtestTableShowMax as boolean) ?? false) ? 'on' : ''}`}
                      role="switch"
                      aria-checked={((widget?.options?.speedtestTableShowMax as boolean) ?? false)}
                      aria-label="Show max column"
                      on:click={() =>
                        updateWidget(selectedId, { options: { speedtestTableShowMax: !((widget?.options?.speedtestTableShowMax as boolean) ?? false) } })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </div>
                </div>

                <details class="content-subaccordion">
                  <summary>Label Overrides</summary>
                  <div class="speedtest-label-grid">
                    <label class="speedtest-label-field">
                      <span>Download Label</span>
                      <input
                        type="text"
                        value={(widget?.options?.speedtestDownloadLabel as string) ?? 'Download'}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { speedtestDownloadLabel: (e.target as HTMLInputElement).value } })
                        }
                      />
                    </label>
                    <label class="speedtest-label-field">
                      <span>Upload Label</span>
                      <input
                        type="text"
                        value={(widget?.options?.speedtestUploadLabel as string) ?? 'Upload'}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { speedtestUploadLabel: (e.target as HTMLInputElement).value } })
                        }
                      />
                    </label>
                    <label class="speedtest-label-field">
                      <span>Name Header</span>
                      <input
                        type="text"
                        value={(widget?.options?.speedtestTableNameHeader as string) ?? 'Name'}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { speedtestTableNameHeader: (e.target as HTMLInputElement).value } })
                        }
                      />
                    </label>
                    <label class="speedtest-label-field">
                      <span>Mean Header</span>
                      <input
                        type="text"
                        value={(widget?.options?.speedtestTableMeanHeader as string) ?? 'Mean'}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { speedtestTableMeanHeader: (e.target as HTMLInputElement).value } })
                        }
                      />
                    </label>
                    <label class="speedtest-label-field">
                      <span>Last Header</span>
                      <input
                        type="text"
                        value={(widget?.options?.speedtestTableLastHeader as string) ?? 'Last'}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { speedtestTableLastHeader: (e.target as HTMLInputElement).value } })
                        }
                      />
                    </label>
                    <label class="speedtest-label-field">
                      <span>Suffix (Mb/s)</span>
                      <input
                        type="text"
                        value={(widget?.options?.speedtestYTickLabels as string) ?? 'Mb/s'}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { speedtestYTickLabels: (e.target as HTMLInputElement).value } })
                        }
                      />
                    </label>
                    <label class="speedtest-label-field">
                      <span>X-Axis Label</span>
                      <input
                        type="text"
                        value={(widget?.options?.speedtestXAxisLabel as string) ?? ''}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { speedtestXAxisLabel: (e.target as HTMLInputElement).value } })
                        }
                      />
                    </label>
                    <label class="speedtest-label-field">
                      <span>Y-Axis Label</span>
                      <input
                        type="text"
                        value={(widget?.options?.speedtestYAxisLabel as string) ?? 'Mb/s'}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { speedtestYAxisLabel: (e.target as HTMLInputElement).value } })
                        }
                      />
                    </label>
                  </div>
                </details>
              {:else if widget?.source === 'technitium' && widget?.kind === 'chart'}
                {@const dnsMetricManagerOptions = technitiumMetricOptions.filter((metric) => metric !== 'cachedAvgLatency')}
                {@const dnsMetricFallback = ['totalQueries', 'blockedPct', 'latency']}
                {@const dnsMetrics = getWidgetMetrics(
                  widget,
                  dnsMetricManagerOptions,
                  dnsMetricFallback,
                  dnsMetricManagerOptions.length
                )}
                <p class="appearance-subheader">Chart Configuration</p>
                <label>
                  Timeframe
                  <select
                    value={(widget?.options?.timeframe as string) ?? 'LastDay'}
                    on:change={(e) =>
                      updateWidget(selectedId, { options: { timeframe: (e.target as HTMLSelectElement).value } })
                    }
                  >
                    <option value="LastHour">Last Hour</option>
                    <option value="LastDay">Last Day</option>
                    <option value="LastWeek">Last Week</option>
                  </select>
                </label>
                <label>
                  Time Scale
                  <select
                    value={(widget?.options?.timeScale as string) ?? 'auto'}
                    on:change={(e) =>
                      updateWidget(selectedId, { options: { timeScale: (e.target as HTMLSelectElement).value } })
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value="hour">Hourly</option>
                    <option value="day">Daily</option>
                  </select>
                </label>
                <label>
                  Chart Points
                  <input
                    type="number"
                    min="4"
                    max="48"
                    value={(widget?.options?.points as number) ?? 12}
                    on:input={(e) =>
                      updateWidget(selectedId, { options: { points: Number((e.target as HTMLInputElement).value) } })
                    }
                  />
                </label>
                <p class="appearance-subheader">Metric Manager</p>
                <div class="metric-manager-list">
                  {#each dnsMetricManagerOptions as metric}
                    {@const isVisible = dnsMetrics.includes(metric)}
                    {@const metricIndex = dnsMetrics.indexOf(metric)}
                    <div class="metric-manager-row">
                      <div class="metric-manager-reorder">
                        <span class="metric-manager-drag" aria-hidden="true">⋮⋮</span>
                        <button
                          class="mini"
                          type="button"
                          disabled={!isVisible || metricIndex <= 0}
                          on:click={() =>
                            moveWidgetMetric(
                              widget,
                              metric,
                              'up',
                              dnsMetricManagerOptions,
                              dnsMetricFallback,
                              dnsMetricManagerOptions.length
                            )}
                        >
                          ↑
                        </button>
                        <button
                          class="mini"
                          type="button"
                          disabled={!isVisible || metricIndex < 0 || metricIndex >= dnsMetrics.length - 1}
                          on:click={() =>
                            moveWidgetMetric(
                              widget,
                              metric,
                              'down',
                              dnsMetricManagerOptions,
                              dnsMetricFallback,
                              dnsMetricManagerOptions.length
                            )}
                        >
                          ↓
                        </button>
                      </div>
                      <span class="metric-manager-badge">{metricLabels[metric] ?? metric}</span>
                      <input
                        class="metric-manager-override"
                        type="text"
                        placeholder="Rename..."
                        value={getMetricLabelOverride(widget, metric)}
                        on:input={(e) => setMetricLabelOverride(widget, metric, (e.target as HTMLInputElement).value)}
                      />
                      <button
                        type="button"
                        class={`hyper-glass-toggle ${isVisible ? 'on' : ''}`}
                        role="switch"
                        aria-checked={isVisible}
                        aria-label={`Show ${metricLabels[metric] ?? metric}`}
                        on:click={() =>
                          toggleWidgetMetric(
                            widget,
                            metric,
                            dnsMetricManagerOptions,
                            dnsMetricFallback,
                            dnsMetricManagerOptions.length
                          )}
                      >
                        <span class="hyper-glass-knob"></span>
                      </button>
                    </div>
                  {/each}
                </div>
              {:else if widget?.kind === 'plex' || widget?.kind === 'history' || widget?.source === 'media-history'}
                {@const mediaDisplayMode = (widget?.options?.subtype as string) === 'now-playing' ? 'now-playing' : 'history'}
                {@const showSessionMetadata = (widget?.options?.showStatus as boolean) ?? true}
                {@const autoMetadataAlignment = (widget?.options?.nowPlayingAutoMetadata as boolean) ?? true}
                {@const showIdleHistory = (widget?.options?.showFallbackHistory as boolean) ?? true}
                {@const showIdleMetrics = (widget?.options?.showFallbackMetrics as boolean) ?? true}
                {@const showIdleThumbnails = (widget?.options?.showThumbnail as boolean) ?? true}
                {@const showIdleUser = (widget?.options?.showUser as boolean) ?? true}
                {@const compactIdleRows = (widget?.options?.compact as boolean) ?? true}
                <div class="settings-group media-playback-group">
                  <p class="appearance-subheader media-playback-subheader">Active Stream</p>
                  <div class="layout-inline-row media-display-mode-row">
                    <p class="field-title">Display Mode</p>
                    <div class="identity-segmented-toggle" role="group" aria-label="Media display mode">
                      <button
                        type="button"
                        class={`identity-toggle-btn ${mediaDisplayMode === 'now-playing' ? 'active' : ''}`}
                        on:click={() => updateWidget(selectedId, { options: { subtype: 'now-playing' } })}
                      >
                        Now Playing
                      </button>
                      <button
                        type="button"
                        class={`identity-toggle-btn ${mediaDisplayMode === 'history' ? 'active' : ''}`}
                        on:click={() => updateWidget(selectedId, { options: { subtype: 'history' } })}
                      >
                        History
                      </button>
                    </div>
                  </div>
                  <label>
                    Sessions to Show
                    <input
                      type="number"
                      min="1"
                      max="6"
                      value={Number((widget?.options?.sessionLimit as number) ?? 1)}
                      on:input={(e) =>
                        updateWidget(selectedId, { options: { sessionLimit: Number((e.target as HTMLInputElement).value) } })
                      }
                    />
                  </label>
                  <div class="media-toggle-row">
                    <span>Show Session Metadata</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle ${showSessionMetadata ? 'on' : ''}`}
                      role="switch"
                      aria-checked={showSessionMetadata}
                      aria-label="Show session metadata"
                      on:click={() => updateWidget(selectedId, { options: { showStatus: !showSessionMetadata } })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </div>
                  <div class="media-toggle-row">
                    <span>Auto Metadata Alignment</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle ${autoMetadataAlignment ? 'on' : ''}`}
                      role="switch"
                      aria-checked={autoMetadataAlignment}
                      aria-label="Auto metadata alignment"
                      on:click={() =>
                        updateWidget(selectedId, { options: { nowPlayingAutoMetadata: !autoMetadataAlignment } })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </div>
                </div>

                <p class="appearance-subheader media-playback-subheader">Idle Mode</p>
                <div class="media-logic-card">
                  <div class="media-toggle-row">
                    <span>Show History</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle ${showIdleHistory ? 'on' : ''}`}
                      role="switch"
                      aria-checked={showIdleHistory}
                      aria-label="Show idle history"
                      on:click={() => updateWidget(selectedId, { options: { showFallbackHistory: !showIdleHistory } })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </div>
                  {#if showIdleHistory}
                    <label>
                      History Length
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={Number((widget?.options?.historyLimit as number) ?? 8)}
                        on:input={(e) =>
                          updateWidget(selectedId, { options: { historyLimit: Number((e.target as HTMLInputElement).value) } })
                        }
                      />
                    </label>
                    <div class="media-idle-toggles">
                      <div class="media-toggle-row">
                        <span>Show Thumbnails</span>
                        <button
                          type="button"
                          class={`hyper-glass-toggle ${showIdleThumbnails ? 'on' : ''}`}
                          role="switch"
                          aria-checked={showIdleThumbnails}
                          aria-label="Show history thumbnails"
                          on:click={() => updateWidget(selectedId, { options: { showThumbnail: !showIdleThumbnails } })}
                        >
                          <span class="hyper-glass-knob"></span>
                        </button>
                      </div>
                      <div class="media-toggle-row">
                        <span>Show User</span>
                        <button
                          type="button"
                          class={`hyper-glass-toggle ${showIdleUser ? 'on' : ''}`}
                          role="switch"
                          aria-checked={showIdleUser}
                          aria-label="Show history user"
                          on:click={() => updateWidget(selectedId, { options: { showUser: !showIdleUser } })}
                        >
                          <span class="hyper-glass-knob"></span>
                        </button>
                      </div>
                      <div class="media-toggle-row">
                        <span>Compact Rows</span>
                        <button
                          type="button"
                          class={`hyper-glass-toggle ${compactIdleRows ? 'on' : ''}`}
                          role="switch"
                          aria-checked={compactIdleRows}
                          aria-label="Compact history rows"
                          on:click={() => updateWidget(selectedId, { options: { compact: !compactIdleRows } })}
                        >
                          <span class="hyper-glass-knob"></span>
                        </button>
                      </div>
                    </div>
                  {/if}
                  <div class="media-toggle-row">
                    <span>Show Metrics</span>
                    <button
                      type="button"
                      class={`hyper-glass-toggle ${showIdleMetrics ? 'on' : ''}`}
                      role="switch"
                      aria-checked={showIdleMetrics}
                      aria-label="Show idle metrics"
                      on:click={() => updateWidget(selectedId, { options: { showFallbackMetrics: !showIdleMetrics } })}
                    >
                      <span class="hyper-glass-knob"></span>
                    </button>
                  </div>
                </div>
              {:else if widget?.kind === 'systemMonitor'}
                <h2>Monitored Nodes</h2>
                <div class="monitor-targets-section monitor-endpoint-manager">
                  <button class="monitor-target-add-btn" type="button" on:click={() => addMonitorSystemNode(widget)}>
                    + Add Node
                  </button>
                  {#if getMonitorSystemNodes(widget).length === 0}
                    <div class="editor-empty">No nodes configured yet. Add a node to start monitoring.</div>
                  {:else}
                    <div class="monitor-target-list">
                      {#each getMonitorSystemNodes(widget) as monitorNode, index (monitorNode.value)}
                        {@const nodeMetrics = getMonitorSystemMetrics(widget, monitorNode.value)}
                        <details class="monitor-target-collapsible">
                          <summary>
                            <span class="monitor-target-drag" aria-hidden="true">⋮⋮</span>
                            <span class="monitor-target-summary-copy">
                              <span class="monitor-target-summary-name">{monitorNode.label.trim() || `Node ${index + 1}`}</span>
                              <span class="monitor-target-summary-url">{monitorNode.host.trim() || '192.168.x.x'}</span>
                            </span>
                            <div class="monitor-target-reorder-actions">
                              <button
                                class="mini"
                                type="button"
                                disabled={index === 0}
                                on:click|preventDefault|stopPropagation={() =>
                                  moveMonitorSystemNode(widget, monitorNode.value, 'up')}
                              >
                                ↑
                              </button>
                              <button
                                class="mini"
                                type="button"
                                disabled={index === getMonitorSystemNodes(widget).length - 1}
                                on:click|preventDefault|stopPropagation={() =>
                                  moveMonitorSystemNode(widget, monitorNode.value, 'down')}
                              >
                                ↓
                              </button>
                            </div>
                            <span class="monitor-target-summary-chevron" aria-hidden="true">▾</span>
                            <button
                              class="mini danger monitor-target-summary-remove"
                              type="button"
                              aria-label={`Delete node ${index + 1}`}
                              on:click|preventDefault|stopPropagation={() => removeMonitorSystemNode(widget, monitorNode.value)}
                            >
                              ✕
                            </button>
                          </summary>
                          <div class="monitor-target-row monitor-target-editor-grid">
                            <label>
                              Name
                              <input
                                type="text"
                                value={monitorNode.label}
                                placeholder="Synology"
                                on:input={(e) =>
                                  updateMonitorSystemNodeField(
                                    widget,
                                    monitorNode.value,
                                    'label',
                                    (e.target as HTMLInputElement).value
                                  )}
                              />
                            </label>
                            <label>
                              Provider
                              <select
                                value={String(monitorNode.provider ?? 'glances')}
                                on:change={(e) =>
                                  updateMonitorSystemNodeField(
                                    widget,
                                    monitorNode.value,
                                    'provider',
                                    (e.target as HTMLSelectElement).value
                                  )}
                              >
                                <option value="glances">Glances</option>
                                <option value="netdata">Netdata</option>
                                <option value="custom">Custom</option>
                              </select>
                            </label>
                            <label>
                              URL / IP
                              <input
                                type="text"
                                value={monitorNode.host}
                                placeholder="192.168.1.10"
                                on:input={(e) =>
                                  updateMonitorSystemNodeField(
                                    widget,
                                    monitorNode.value,
                                    'host',
                                    (e.target as HTMLInputElement).value
                                  )}
                              />
                            </label>
                            <label>
                              Port
                              <input
                                type="number"
                                min="1"
                                max="65535"
                                value={Number(monitorNode.port ?? 61208)}
                                on:input={(e) =>
                                  updateMonitorSystemNodeField(
                                    widget,
                                    monitorNode.value,
                                    'port',
                                    Number((e.target as HTMLInputElement).value)
                                  )}
                              />
                            </label>
                            {#if String(monitorNode.provider ?? 'glances') !== 'glances'}
                              <label>
                                Username
                                <input
                                  type="text"
                                  value={String(monitorNode.username ?? '')}
                                  placeholder="optional"
                                  on:input={(e) =>
                                    updateMonitorSystemNodeField(
                                      widget,
                                      monitorNode.value,
                                      'username',
                                      (e.target as HTMLInputElement).value
                                    )}
                                />
                              </label>
                              <label>
                                Password
                                <input
                                  type="password"
                                  value={String(monitorNode.password ?? '')}
                                  placeholder="optional"
                                  on:input={(e) =>
                                    updateMonitorSystemNodeField(
                                      widget,
                                      monitorNode.value,
                                      'password',
                                      (e.target as HTMLInputElement).value
                                    )}
                                />
                              </label>
                            {/if}
                            <div class="monitor-enabled-metrics">
                              <span class="micro-label">Enabled Metrics</span>
                              <div class="monitor-enabled-metrics-grid">
                                <label class="pro-field compact item-toggle-field">
                                  <span class="micro-label">CPU</span>
                                  <button
                                    type="button"
                                    class={`hyper-glass-toggle ${nodeMetrics.includes('cpu') ? 'on' : ''}`}
                                    role="switch"
                                    aria-checked={nodeMetrics.includes('cpu')}
                                    aria-label="Enable CPU metric"
                                    on:click={() => toggleMonitorSystemMetric(widget, 'cpu', monitorNode.value)}
                                  >
                                    <span class="hyper-glass-knob"></span>
                                  </button>
                                </label>
                                <label class="pro-field compact item-toggle-field">
                                  <span class="micro-label">Mem</span>
                                  <button
                                    type="button"
                                    class={`hyper-glass-toggle ${nodeMetrics.includes('memory') ? 'on' : ''}`}
                                    role="switch"
                                    aria-checked={nodeMetrics.includes('memory')}
                                    aria-label="Enable memory metric"
                                    on:click={() => toggleMonitorSystemMetric(widget, 'memory', monitorNode.value)}
                                  >
                                    <span class="hyper-glass-knob"></span>
                                  </button>
                                </label>
                                <label class="pro-field compact item-toggle-field">
                                  <span class="micro-label">Disk</span>
                                  <button
                                    type="button"
                                    class={`hyper-glass-toggle ${nodeMetrics.includes('disk') ? 'on' : ''}`}
                                    role="switch"
                                    aria-checked={nodeMetrics.includes('disk')}
                                    aria-label="Enable disk metric"
                                    on:click={() => toggleMonitorSystemMetric(widget, 'disk', monitorNode.value)}
                                  >
                                    <span class="hyper-glass-knob"></span>
                                  </button>
                                </label>
                                <label class="pro-field compact item-toggle-field">
                                  <span class="micro-label">Temp</span>
                                  <button
                                    type="button"
                                    class={`hyper-glass-toggle ${nodeMetrics.includes('temperature') ? 'on' : ''}`}
                                    role="switch"
                                    aria-checked={nodeMetrics.includes('temperature')}
                                    aria-label="Enable temperature metric"
                                    on:click={() => toggleMonitorSystemMetric(widget, 'temperature', monitorNode.value)}
                                  >
                                    <span class="hyper-glass-knob"></span>
                                  </button>
                                </label>
                                <label class="pro-field compact item-toggle-field">
                                  <span class="micro-label">Net</span>
                                  <button
                                    type="button"
                                    class={`hyper-glass-toggle ${nodeMetrics.includes('network') ? 'on' : ''}`}
                                    role="switch"
                                    aria-checked={nodeMetrics.includes('network')}
                                    aria-label="Enable network metric"
                                    on:click={() => toggleMonitorSystemMetric(widget, 'network', monitorNode.value)}
                                  >
                                    <span class="hyper-glass-knob"></span>
                                  </button>
                                </label>
                                <label class="pro-field compact item-toggle-field">
                                  <span class="micro-label">I/O</span>
                                  <button
                                    type="button"
                                    class={`hyper-glass-toggle ${nodeMetrics.includes('diskio') ? 'on' : ''}`}
                                    role="switch"
                                    aria-checked={nodeMetrics.includes('diskio')}
                                    aria-label="Enable disk I/O metric"
                                    on:click={() => toggleMonitorSystemMetric(widget, 'diskio', monitorNode.value)}
                                  >
                                    <span class="hyper-glass-knob"></span>
                                  </button>
                                </label>
                              </div>
                            </div>
                          </div>
                        </details>
                      {/each}
                    </div>
                  {/if}
                </div>
              {:else if widget?.kind === 'monitor'}
                <h2>Monitored Endpoints</h2>
                <div class="monitor-targets-section monitor-endpoint-manager">
                  <button class="monitor-target-add-btn" type="button" on:click={() => addMonitorTarget(widget)}>
                    + Add New Endpoint
                  </button>
                  {#if getMonitorTargets(widget).length === 0}
                    <div class="editor-empty">No endpoints yet. Add an endpoint with a name and URL.</div>
                  {:else}
                    <div class="monitor-target-list">
                      {#each getMonitorTargets(widget) as target, index}
                        <details class="monitor-target-collapsible">
                          <summary>
                            <span class="monitor-target-drag" aria-hidden="true">⋮⋮</span>
                            <span class="monitor-target-summary-copy">
                              <span class="monitor-target-summary-name">{target.name.trim() || `Endpoint ${index + 1}`}</span>
                              <span class="monitor-target-summary-url">{target.url.trim() || 'https://example.local'}</span>
                            </span>
                            <span class="monitor-target-summary-chevron" aria-hidden="true">▾</span>
                            <button
                              class="mini danger monitor-target-summary-remove"
                              type="button"
                              aria-label={`Delete endpoint ${index + 1}`}
                              on:click|preventDefault|stopPropagation={() => removeMonitorTarget(widget, index)}
                            >
                              ✕
                            </button>
                          </summary>
                          <div class="monitor-target-row monitor-target-editor-grid">
                            <label>
                              Name
                              <input
                                type="text"
                                value={target.name}
                                placeholder="UpSnap"
                                on:input={(e) =>
                                  updateMonitorTargetField(
                                    widget,
                                    index,
                                    'name',
                                    (e.target as HTMLInputElement).value
                                  )}
                              />
                            </label>
                            <label>
                              URL
                              <input
                                type="text"
                                value={target.url}
                                placeholder="https://service.local/health"
                                on:input={(e) =>
                                  updateMonitorTargetField(
                                    widget,
                                    index,
                                    'url',
                                    (e.target as HTMLInputElement).value
                                  )}
                              />
                            </label>
                            <label>
                              Icon Override
                              <input
                                type="text"
                                value={target.icon}
                                placeholder={`${target.name.trim() || 'service-name'} or icon URL`}
                                on:input={(e) =>
                                  updateMonitorTargetField(
                                    widget,
                                    index,
                                    'icon',
                                    (e.target as HTMLInputElement).value
                                  )}
                              />
                            </label>
                            <label>
                              Method
                              <select
                                value={target.method === 'POST' ? 'POST' : 'GET'}
                                on:change={(e) =>
                                  updateMonitorTargetField(
                                    widget,
                                    index,
                                    'method',
                                    (e.target as HTMLSelectElement).value
                                  )}
                              >
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                              </select>
                            </label>
                            <label>
                              Docker Server
                              <input
                                type="text"
                                value={target.dockerServer}
                                list="monitor-docker-servers"
                                placeholder="node-1"
                                on:input={(e) =>
                                  updateMonitorTargetField(
                                    widget,
                                    index,
                                    'dockerServer',
                                    (e.target as HTMLInputElement).value
                                  )}
                              />
                            </label>
                            <label>
                              Container Name
                              <input
                                type="text"
                                value={target.dockerContainer}
                                placeholder={target.name.trim() || 'container-name'}
                                on:input={(e) =>
                                  updateMonitorTargetField(
                                    widget,
                                    index,
                                    'dockerContainer',
                                    (e.target as HTMLInputElement).value
                                  )}
                              />
                            </label>
                            <div class="monitor-target-actions">
                              <span class={`monitor-target-test ${monitorTargetTestStates[getMonitorTargetTestKey(widget.id, index)]?.status ?? 'idle'}`}>
                                {monitorTargetTestStates[getMonitorTargetTestKey(widget.id, index)]?.message ?? ''}
                              </span>
                              <button
                                class="mini"
                                type="button"
                                disabled={monitorTargetTestStates[getMonitorTargetTestKey(widget.id, index)]?.status === 'loading'}
                                on:click={() => runMonitorTargetTest(widget, index, target)}
                              >
                                {monitorTargetTestStates[getMonitorTargetTestKey(widget.id, index)]?.status === 'loading' ? 'Testing...' : 'Test'}
                              </button>
                            </div>
                          </div>
                        </details>
                      {/each}
                    </div>
                  {/if}
                  <datalist id="monitor-docker-servers">
                    {#each executionNodes as node (node.value)}
                      <option value={node.value}></option>
                    {/each}
                  </datalist>
                </div>
              {:else}
                <p class="field-title">Dynamic toggles and metric-level controls will live in this section.</p>
              {/if}
            </div>
          </details>
          {/if}
          </SettingsDrawer>
          </div>
        {/key}
      {:else}
        <div class="editor-empty">Select a widget to edit.</div>
      {/if}
      </section>
    </div>
  </div>
  {/if}

  {#if showAddWidgetWizard}
    <div class="widget-wizard-backdrop" role="presentation" on:click|self={closeAddWidgetWizard}>
      <div class="widget-wizard-modal" role="dialog" aria-modal="true" tabindex="-1">
        {#if addWidgetWizardStep === 'style'}
          <div class="widget-wizard-header">
            <h2>Select Widget Style</h2>
            <button class="mini" type="button" on:click={closeAddWidgetWizard}>Close</button>
          </div>
          <div class="widget-wizard-grid">
            {#each widgetStyleCategories as category (category.name)}
              <section class="widget-style-category">
                <h3>{category.name}</h3>
                <div class="widget-style-list">
                  {#each category.options as option (option.title)}
                    <button
                      class="widget-style-card"
                      type="button"
                      on:click={() => selectWidgetStyleForWizard(option)}
                    >
                      <strong>{option.title}</strong>
                      <span>{option.description}</span>
                    </button>
                  {/each}
                </div>
              </section>
            {/each}
          </div>
        {:else}
          <div class="widget-wizard-header">
            <h2>Select Execution Node</h2>
            <button class="mini" type="button" on:click={closeAddWidgetWizard}>Close</button>
          </div>
          <p class="widget-wizard-subtitle">
            Widget Style: {pendingWidgetTitle || kindLabels[pendingWidgetKind] || pendingWidgetKind}
          </p>
          <div class="widget-node-list">
            {#each executionNodes as node (node.value)}
              <button
                class="widget-node-card"
                type="button"
                on:click={() => addWidget(node.value as ExecutionNodeId)}
              >
                <strong>{node.label}</strong>
                <span>{node.host}</span>
              </button>
            {/each}
          </div>
          <div class="widget-wizard-actions">
            <button class="ghost" type="button" on:click={() => (addWidgetWizardStep = 'style')}>Back</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <ConfirmationModal
    open={showTabDeleteModal}
    title="Delete Tab"
    message={`Are you sure you want to delete the ${pendingTabDeletion?.name ?? 'selected'} tab? This action cannot be undone.`}
    confirmLabel="Delete Tab"
    on:cancel={cancelDeleteTab}
    on:confirm={confirmDeleteTab}
  />

  <TabIdentityModal
    open={showTabIdentityModal}
    initialName={tabIdentityName}
    initialIcon={tabIdentityIcon}
    icons={TAB_ICON_DEFS}
    on:cancel={closeTabIdentityModal}
    on:save={saveTabIdentityModal}
  />
</main>

<style>
  main.page {
    zoom: 0.9;
  }

	  .focus-toolbar {
	    position: relative;
	    isolation: isolate;
	    z-index: 500;
	    display: flex;
	    align-items: center;
	    justify-content: space-between;
	    gap: 12px;
	    margin-bottom: 14px;
	    width: 100%;
	    min-height: 78px;
	    padding: 8px 8px 10px 12px;
	    border: 1px solid rgba(255, 255, 255, 0.12);
	    border-radius: 14px;
	    background: var(--settings-bg-surface, rgba(10, 16, 24, 0.72));
	    backdrop-filter: blur(14px);
	    /* Allow the Control Center dropdown to render outside the toolbar. */
	    overflow: visible !important;
	    font-size: 0.75rem;
	  }

  .focus-tabs-pane,
  .focus-actions-pane,
  .focus-styles-pane {
    display: flex;
    flex-direction: row;
    gap: 0;
    min-width: 0;
    height: 100%;
    align-items: center;
  }

  .focus-tabs-pane {
    flex: 1 1 auto;
    max-width: calc(100% - 400px);
    min-width: 220px;
    padding-right: 8px;
    overflow: visible;
  }

	  .focus-actions-pane {
	    flex: 0 0 auto;
	    flex-shrink: 0;
	    position: sticky;
	    right: 0;
	    z-index: 520;
	    margin-left: auto;
	    min-width: fit-content;
	    background: linear-gradient(
	      to left,
	      rgba(10, 10, 10, 0.98) 0%,
      rgba(10, 10, 10, 0.9) 78%,
      transparent 100%
	    );
	    backdrop-filter: blur(14px);
	    padding-left: 22px;
	    padding-right: 6px;
	    gap: 12px;
	    column-gap: 12px;
	  }

  .focus-styles-pane {
    flex: 0 0 auto;
    flex-shrink: 0;
    align-items: center;
    padding-left: 0;
    transition: all 300ms ease;
  }

	  .tab-scroll {
	    width: 100%;
	    overflow-x: auto;
	    overflow-y: visible;
	    padding-top: 30px;
	    padding-right: 8px;
	    mask-image: linear-gradient(to right, #000 0%, #000 88%, transparent 100%);
	    -webkit-mask-image: linear-gradient(to right, #000 0%, #000 88%, transparent 100%);
	  }

  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }

  .focus-tabbar {
    display: flex;
    flex-wrap: nowrap;
    gap: 6px;
    align-items: center;
    height: 100%;
    width: max-content;
  }

  .focus-tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: var(--settings-bg-strong, rgba(10, 16, 24, 0.82));
    color: var(--muted);
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1;
    align-self: center;
    height: 44px;
    overflow: visible !important;
  }

  .focus-tab svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .focus-tab.active {
    color: #eaf3ff;
    border-color: #3b82f6;
    background: #3b82f6;
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.35);
  }

  .focus-tab.tab-drop-before::before,
  .focus-tab.tab-drop-after::before {
    content: '';
    position: absolute;
    top: 7px;
    bottom: 7px;
    width: 2px;
    border-radius: 999px;
    background: rgba(106, 168, 255, 0.98);
    box-shadow: 0 0 10px rgba(106, 168, 255, 0.55);
    pointer-events: none;
  }

  .focus-tab.tab-drop-before::before {
    left: -6px;
  }

  .focus-tab.tab-drop-after::before {
    right: -6px;
  }

  .focus-tab.deleting {
    animation: tab-fade-out 220ms ease forwards;
    pointer-events: none;
  }

  .tab-delete-chip {
    position: absolute;
    top: -4px;
    right: -4px;
    height: 16px;
    width: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid rgba(255, 107, 107, 0.6);
    background: rgba(120, 22, 22, 0.86);
    color: #ffdbdb;
    cursor: pointer;
    z-index: 10;
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms ease, background 140ms ease, border-color 140ms ease;
  }

  .focus-tab:hover .tab-delete-chip,
  .focus-tab.active .tab-delete-chip,
  .tab-delete-chip:hover,
  .tab-delete-chip:focus-visible {
    opacity: 1;
    pointer-events: auto;
    border-color: rgba(255, 107, 107, 0.9);
    background: rgba(185, 28, 28, 0.95);
  }

  .tab-delete-chip svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .tab-action-host {
    overflow: visible;
  }

	  .tab-action-strip {
	    position: absolute;
	    top: -18px;
	    left: 50%;
	    transform: translateX(-50%);
	    display: flex;
	    align-items: center;
	    gap: 4px;
	    opacity: 0;
	    pointer-events: none;
	    transition: opacity 140ms ease;
	    z-index: 50;
	  }

	  .focus-tab:hover .tab-action-strip,
	  .focus-tab:focus-visible .tab-action-strip {
	    opacity: 1;
	    pointer-events: auto;
	  }

	  .focus-tab.active .tab-action-strip {
	    opacity: 1;
	    pointer-events: auto;
	  }

  .tab-action-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.32);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(161, 161, 170, 0.95);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: color 140ms ease, border-color 140ms ease, background 140ms ease;
  }

  .tab-action-btn:hover {
    color: rgba(244, 244, 245, 0.98);
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(0, 0, 0, 0.44);
  }

  .tab-action-btn.danger:hover {
    color: rgba(248, 113, 113, 0.98);
    border-color: rgba(248, 113, 113, 0.32);
  }

  .tab-action-btn svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .tab-add-inline {
    width: 38px;
    height: 38px;
    padding: 0;
    min-width: 38px;
    justify-content: center;
    border-style: dashed;
    border-color: rgba(106, 168, 255, 0.75);
    background: rgba(20, 35, 56, 0.72);
    color: #d9ecff;
    box-shadow: 0 0 0 1px rgba(106, 168, 255, 0.22);
  }

  .tab-add-inline svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .tab-add-action {
    width: 34px;
    height: 34px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px dashed rgba(106, 168, 255, 0.75);
    background: rgba(20, 35, 56, 0.72);
    color: #d9ecff;
    box-shadow: 0 0 0 1px rgba(106, 168, 255, 0.22);
  }

  .tab-add-action svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .actions-divider {
    width: 1px;
    height: 30px;
    background: rgba(255, 255, 255, 0.12);
    flex: 0 0 1px;
  }

  .focus-hud {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 16px;
    width: auto;
    min-width: max-content;
    padding-left: 12px;
    font-size: 0.75rem;
  }

  .focus-hud .hud-group {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    white-space: nowrap;
    min-height: 44px;
  }

  .focus-hud .title-lab {
    gap: 0;
    padding: 0;
    border-radius: 0;
    background: transparent;
  }

  .focus-hud .title-lab-label {
    font-size: 9px;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(224, 236, 252, 0.55);
    font-weight: 700;
    line-height: 1;
    margin-right: 2px;
  }

  .focus-hud .title-lab > * {
    padding: 0 8px;
  }

  .focus-hud .title-lab > *:first-child {
    padding-left: 0;
  }

  .focus-hud .title-lab > *:last-child {
    padding-right: 0;
  }

  .focus-hud .title-lab > * + * {
    border-left: 1px solid rgba(255, 255, 255, 0.12);
  }

  .focus-hud .font-select-icon {
    font-size: 11px;
    font-weight: 700;
    color: rgba(224, 236, 252, 0.75);
  }

  .focus-hud .title-lab-meta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .focus-hud .title-weight-toggle {
    display: inline-flex;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    overflow: hidden;
  }

  .focus-hud .weight-btn {
    border: none;
    border-radius: 0;
    padding: 4px 7px;
    background: transparent;
    color: rgba(220, 236, 255, 0.72);
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
  }

  .focus-hud .weight-btn.active {
    background: rgba(59, 130, 246, 0.85);
    color: #eef4ff;
  }

  .focus-hud .title-size-icon {
    font-size: 12px;
    font-weight: 700;
    color: rgba(224, 236, 252, 0.8);
    line-height: 1;
  }

  .focus-hud .title-size-icon.header {
    font-size: 10px;
  }

  .focus-hud .hud-inline-control {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 6px;
    margin: 0;
    margin-bottom: 0 !important;
    color: inherit;
    white-space: nowrap;
    font-size: 0.75rem;
  }

  .focus-hud .hud-stack {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 38px;
  }

  .focus-hud .hud-label {
    font-weight: 600;
    color: rgba(220, 236, 255, 0.9);
    line-height: 1;
  }

  .focus-hud .hud-micro-label {
    display: inline-block;
    min-width: 32px;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.72;
    color: #dbe9ff;
    line-height: 1;
  }

  .focus-hud .hud-value-badge {
    font-size: 0.68rem;
    line-height: 1;
    border: 1px solid rgba(106, 168, 255, 0.45);
    border-radius: 999px;
    padding: 2px 6px;
    background: rgba(30, 52, 84, 0.65);
    color: #d9ecff;
    font-variant-numeric: tabular-nums;
  }


  .focus-hud .hud-divider {
    width: 1px;
    height: 16px;
    background: rgba(255, 255, 255, 0.1);
    flex: 0 0 1px;
    transition: all 300ms ease;
  }

  .focus-styles-pane .design-only {
    transition: all 300ms ease;
  }

  .focus-styles-pane.design-collapsed .design-only {
    max-width: 0;
    opacity: 0;
    margin: 0;
    padding: 0;
    overflow: hidden;
    pointer-events: none;
    transform: translateX(6px);
  }

  .focus-hud .hud-activity-toggle,
  .hud-activity-toggle {
    height: 34px;
    width: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: var(--settings-bg-strong, rgba(10, 16, 24, 0.82));
    color: rgba(205, 220, 240, 0.86);
  }

  .focus-hud .hud-activity-toggle svg,
  .hud-activity-toggle svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .focus-hud .hud-activity-toggle.active,
  .hud-activity-toggle.active {
    color: #eaf3ff;
    border-color: #3b82f6;
    background: #3b82f6;
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.35), 0 0 10px rgba(59, 130, 246, 0.3);
  }

  .focus-hud .hud-design-toggle,
  .hud-design-toggle {
    height: 34px;
    width: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: var(--settings-bg-strong, rgba(10, 16, 24, 0.82));
    color: rgba(205, 220, 240, 0.86);
  }

  .focus-hud .hud-design-toggle svg,
  .hud-design-toggle svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .focus-hud .hud-design-toggle.active,
  .hud-design-toggle.active {
    color: #eaf3ff;
    border-color: #3b82f6;
    background: #3b82f6;
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.35), 0 0 10px rgba(59, 130, 246, 0.28);
  }

	  .control-center-wrap {
	    position: relative;
	    overflow: visible;
	    display: inline-flex;
	    align-items: center;
	    z-index: 540;
	  }

	  .control-center-panel {
	    position: absolute;
	    top: calc(100% + 12px);
	    right: 0;
	    z-index: 560;
	    width: 320px;
	    max-height: 85vh;
	    overflow-y: auto;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(9, 9, 11, 0.95);
    backdrop-filter: blur(22px);
    padding: 14px;
    box-shadow: 0 30px 70px rgba(0, 0, 0, 0.6);
    transform-origin: top right;
    animation: cc-in 200ms ease;
  }

  @keyframes cc-in {
    from {
      opacity: 0;
      transform: translateY(-6px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .cc-section-title {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(161, 161, 170, 0.9);
    margin: 12px 0 10px;
    padding: 0 4px;
  }

  .cc-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 10px 0 6px;
  }

  .cc-stack {
    display: grid;
    gap: 10px;
  }

  .cc-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .cc-field {
    display: grid;
    gap: 6px;
  }

  .cc-label {
    font-size: 12px;
    color: rgba(228, 228, 231, 0.9);
  }

  .cc-label-small {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(161, 161, 170, 0.9);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .cc-value {
    font-size: 10px;
    letter-spacing: 0.08em;
    color: rgba(228, 228, 231, 0.8);
    font-variant-numeric: tabular-nums;
  }

  .cc-field select,
  .cc-field input[type='text'] {
    height: 36px;
    width: 100%;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: #0b1220;
    color: rgba(228, 228, 231, 0.95);
    padding: 0 10px;
    font-size: 12px;
    outline: none;
  }

  .cc-field select option {
    background: #0b1220;
    color: #eef4ff;
  }

  .cc-field input[type='file'] {
    width: 100%;
    font-size: 12px;
    color: rgba(228, 228, 231, 0.85);
  }

  .cc-field select:focus,
  .cc-field input[type='text']:focus {
    border-color: rgba(59, 130, 246, 0.55);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.18);
  }

  .cc-color-row {
    display: grid;
    grid-template-columns: 36px 1fr;
    gap: 10px;
    align-items: center;
  }

  .cc-color-row input[type='color'] {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: transparent;
    padding: 0;
    cursor: pointer;
  }

  .cc-segment {
    display: flex;
    height: 36px;
    border-radius: 10px;
    padding: 3px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(0, 0, 0, 0.35);
    gap: 4px;
  }

  .cc-segment button {
    flex: 1 1 0;
    height: 100%;
    border-radius: 8px;
    background: transparent;
    color: rgba(161, 161, 170, 0.95);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0;
    border: 1px solid transparent;
  }

  .cc-segment button.active {
    color: rgba(244, 244, 245, 0.98);
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.07);
  }

  .cc-range {
    width: 100%;
    -webkit-appearance: none;
    appearance: none;
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.24);
    margin: 0;
  }

  .cc-range::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.24);
  }

  .cc-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.88);
    background: #3b82f6;
    margin-top: -5px;
    box-shadow: 0 0 0 1px rgba(10, 15, 24, 0.65);
  }

  .cc-range::-moz-range-track {
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.24);
  }

  .cc-range::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.88);
    background: #3b82f6;
    box-shadow: 0 0 0 1px rgba(10, 15, 24, 0.65);
  }

  .cc-mt {
    margin-top: 12px;
  }

  .cc-actions {
    margin-top: 10px;
    display: flex;
    justify-content: flex-end;
  }

  @media (max-width: 768px) {
    .control-center-panel {
      position: fixed;
      top: 68px;
      left: 12px;
      right: 12px;
      width: auto;
      max-height: 85vh;
    }
  }

  @keyframes tab-fade-out {
    from {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    to {
      opacity: 0;
      transform: translateY(-5px) scale(0.94);
    }
  }

  .editor-tabs {
    display: none;
  }

  .tab-button {
    padding: 8px 14px;
    border-radius: 9px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted);
    font-size: 0.8rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .tab-button.active {
    color: var(--text);
    border-color: rgba(106, 168, 255, 0.45);
    background: rgba(106, 168, 255, 0.14);
  }

  .settings-panel {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    align-items: start;
    padding: 18px 20px;
  }

  .dashboard-settings {
    display: grid;
    gap: 12px;
  }

  .dashboard-settings-tabs {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }

  .settings-panel {
    margin: 0;
    border-radius: 14px;
    border: 1px solid var(--card-border);
    background: var(--settings-bg-soft, rgba(10, 16, 24, 0.58));
  }

  .settings-panel .ghost {
    justify-self: start;
  }

  .settings-actions {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .dashboard-tabs-panel {
    grid-template-columns: 1fr;
  }

  .dashboard-tab-list {
    display: grid;
    gap: 10px;
  }

  .dashboard-tab-row {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: var(--settings-bg-soft, rgba(10, 16, 24, 0.58));
  }

  .dashboard-tab-row label {
    margin: 0;
  }

  .dashboard-tab-meta {
    color: var(--muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .widget-editor-layout {
    display: grid;
    grid-template-columns: minmax(600px, 1.2fr) minmax(400px, 1fr);
    gap: 22px;
    align-items: start;
  }

  .editor-grid {
    display: grid;
    grid-template-columns: minmax(350px, 280px) 1fr;
    gap: 24px;
    align-items: start;
  }

  .editor-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px;
    border-radius: 16px;
    border: 1px solid var(--card-border);
    background: var(--settings-bg-soft, rgba(10, 16, 24, 0.58));
    backdrop-filter: blur(8px);
  }

  .add-widget-button {
    width: 100%;
    position: sticky;
    top: 0;
    z-index: 4;
    background: rgba(37, 99, 235, 0.92);
    border-color: rgba(96, 165, 250, 0.6);
    color: #f8fbff;
    box-shadow: 0 10px 24px rgba(30, 58, 138, 0.2);
  }

  .add-widget-button:hover {
    background: rgba(59, 130, 246, 0.95);
  }

  .editor-search-input {
    width: 100%;
    height: 32px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(0, 0, 0, 0.4);
    color: #f5f5f5;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0 10px;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
  }

  .editor-search-input:focus {
    outline: none;
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(59, 130, 246, 0.5);
  }

  .editor-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--card-border);
    background: var(--settings-bg-surface, rgba(10, 16, 24, 0.72));
    color: var(--text);
    text-align: left;
    justify-content: flex-start;
    transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
  }

  .editor-item.active {
    background: rgba(37, 99, 235, 0.15);
    border-color: rgba(59, 130, 246, 0.4);
    border-left-width: 2px;
    border-left-color: #3b82f6;
    box-shadow: inset 0 0 10px rgba(59, 130, 246, 0.1);
    color: #93c5fd;
    backdrop-filter: blur(8px);
  }

  .editor-item.drag-target {
    border-color: rgba(106, 168, 255, 0.9);
    box-shadow: 0 0 0 2px rgba(106, 168, 255, 0.25);
  }

  .editor-item-icon {
    width: 20px;
    height: 20px;
    object-fit: contain;
    opacity: 0.7;
    transition: opacity 140ms ease;
    flex: 0 0 auto;
  }

  .editor-item:hover .editor-item-icon,
  .editor-item.active .editor-item-icon {
    opacity: 1;
  }

  .editor-item-icon-fallback {
    width: 20px;
    height: 20px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(255, 255, 255, 0.06);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: rgba(228, 228, 231, 0.9);
    flex: 0 0 auto;
  }

  .editor-item-content {
    min-width: 0;
    flex: 1;
  }

  .editor-item-title {
    font-weight: 600;
    font-size: 12px;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .editor-item-provider {
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(161, 161, 170, 0.86);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .editor-item-node-badge {
    display: inline-flex;
    align-items: center;
    margin-top: 6px;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(10, 16, 24, 0.55);
    color: rgba(184, 206, 230, 0.88);
    font-size: 0.63rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    line-height: 1.1;
  }

  .editor-item-actions {
    display: flex;
    gap: 6px;
    margin-left: auto;
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms ease;
  }

  .editor-item:hover .editor-item-actions,
  .editor-item:focus-within .editor-item-actions {
    opacity: 1;
    pointer-events: auto;
  }

  .editor-item-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: #71717a;
    padding: 0;
    transition: color 120ms ease, background-color 120ms ease, border-color 120ms ease;
    cursor: pointer;
  }

  .editor-item-action-btn svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .editor-item-action-btn.duplicate:hover {
    color: #60a5fa;
    background: rgba(59, 130, 246, 0.08);
  }

  .editor-item-action-btn.danger:hover {
    color: #f87171;
    background: rgba(248, 113, 113, 0.08);
  }

  .mini {
    padding: 4px 8px;
    font-size: 0.75rem;
    border-radius: 8px;
    background: transparent;
    border: 1px solid var(--card-border);
    color: var(--text);
  }

  .mini.danger {
    border-color: rgba(255, 107, 107, 0.6);
    color: var(--danger);
  }

  .editor-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    border-radius: 16px;
    border: 1px solid var(--card-border);
    background: var(--settings-bg-surface, rgba(10, 16, 24, 0.72));
    max-height: min(86vh, 980px);
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    z-index: 120;
  }

  .inspector-scroll {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: visible;
    padding-right: 4px;
    max-height: none;
  }

  .identity-segmented-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: 10px;
    border: 1px solid var(--card-border);
    background: rgba(8, 14, 24, 0.6);
  }

  .identity-toggle-btn {
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    background: transparent;
    cursor: pointer;
  }

  .identity-toggle-btn.active {
    color: #eef4ff;
    border-color: rgba(86, 154, 255, 0.6);
    background: rgba(59, 130, 246, 0.2);
  }

  .inspector-accordion {
    border: 1px solid var(--card-border);
    border-radius: 14px;
    background: var(--settings-bg-surface, rgba(10, 16, 24, 0.72));
    overflow: hidden;
    position: relative;
    z-index: 1;
  }

  .inspector-accordion:focus-within {
    z-index: 220;
    overflow: visible;
  }

  .inspector-accordion > summary {
    cursor: pointer;
    list-style: none;
    font-size: 0.84rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text);
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: var(--settings-bg-soft, rgba(10, 16, 24, 0.58));
  }

  .inspector-accordion > summary::-webkit-details-marker {
    display: none;
  }

  .inspector-accordion > .panel-section {
    margin: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    padding: 12px 14px;
  }

  .inspector-accordion.visuals details.appearance-collapsible > summary,
  .inspector-accordion.visuals details.inspector-subaccordion > summary,
  .inspector-accordion.visuals details.content-subaccordion > summary,
  .inspector-accordion.content-metrics details.content-subaccordion > summary {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 0;
    margin: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    background: transparent;
    list-style: none;
    cursor: pointer;
    color: #71717a;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transition: color 160ms ease;
  }

  .inspector-accordion.visuals .panel-section > details.appearance-collapsible:first-of-type > summary,
  .inspector-accordion.visuals .panel-section > details.inspector-subaccordion:first-of-type > summary,
  .inspector-accordion.visuals .panel-section > details.content-subaccordion:first-of-type > summary,
  .inspector-accordion.content-metrics .panel-section > details.content-subaccordion:first-of-type > summary {
    border-top-color: transparent;
  }

  .inspector-accordion.visuals details.appearance-collapsible > summary:hover,
  .inspector-accordion.visuals details.inspector-subaccordion > summary:hover,
  .inspector-accordion.visuals details.content-subaccordion > summary:hover,
  .inspector-accordion.content-metrics details.content-subaccordion > summary:hover {
    color: #d4d4d8;
  }

  .inspector-accordion.visuals details.appearance-collapsible > summary::-webkit-details-marker,
  .inspector-accordion.visuals details.inspector-subaccordion > summary::-webkit-details-marker,
  .inspector-accordion.visuals details.content-subaccordion > summary::-webkit-details-marker,
  .inspector-accordion.content-metrics details.content-subaccordion > summary::-webkit-details-marker {
    display: none;
  }

  .inspector-accordion.visuals details.appearance-collapsible > summary::after,
  .inspector-accordion.visuals details.inspector-subaccordion > summary::after,
  .inspector-accordion.visuals details.content-subaccordion > summary::after,
  .inspector-accordion.content-metrics details.content-subaccordion > summary::after {
    content: '';
    width: 0.52rem;
    height: 0.52rem;
    border-right: 1.6px solid #52525b;
    border-bottom: 1.6px solid #52525b;
    transform: rotate(-45deg);
    transform-origin: center;
    transition: transform 160ms ease, border-color 160ms ease;
    flex: 0 0 auto;
  }

  .inspector-accordion.visuals details.appearance-collapsible > summary:hover::after,
  .inspector-accordion.visuals details.inspector-subaccordion > summary:hover::after,
  .inspector-accordion.visuals details.content-subaccordion > summary:hover::after,
  .inspector-accordion.content-metrics details.content-subaccordion > summary:hover::after {
    border-right-color: #ffffff;
    border-bottom-color: #ffffff;
  }

  .inspector-accordion.visuals details.appearance-collapsible[open] > summary::after,
  .inspector-accordion.visuals details.inspector-subaccordion[open] > summary::after,
  .inspector-accordion.visuals details.content-subaccordion[open] > summary::after,
  .inspector-accordion.content-metrics details.content-subaccordion[open] > summary::after {
    transform: rotate(45deg);
  }

  .inspector-accordion.visuals details.appearance-collapsible .subaccordion-chevron,
  .inspector-accordion.visuals details.inspector-subaccordion .subaccordion-chevron,
  .inspector-accordion.visuals details.content-subaccordion .subaccordion-chevron {
    display: none;
  }

  .inspector-accordion.identity {
    order: 1;
  }

  .inspector-accordion.source {
    order: 2;
  }

  .inspector-accordion.source.data-connection {
    order: 99;
  }

  .inspector-accordion.visuals {
    order: 2;
  }

  .inspector-accordion.content-metrics {
    order: 4;
  }

  .general-layout-pro,
  .data-connection-pro {
    --pro-label-color: #71717a;
  }

  .general-layout-pro .pro-field,
  .data-connection-pro .pro-field,
  .inspector-accordion.visuals .pro-field {
    margin-bottom: 10px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--pro-label-color);
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
    text-align: left;
    width: 100%;
    position: relative;
    z-index: 1;
  }

  .general-layout-pro .pro-field:focus-within,
  .data-connection-pro .pro-field:focus-within,
  .inspector-accordion.visuals .pro-field:focus-within {
    z-index: 260;
  }

  .general-layout-pro .pro-field input,
  .general-layout-pro .pro-field select,
  .general-layout-pro input[type='text'],
  .general-layout-pro input[type='number']:not(.layout-control-input),
  .general-layout-pro select,
  .data-connection-pro .pro-field input,
  .data-connection-pro .pro-field select,
  .data-connection-pro input[type='text'],
  .data-connection-pro input[type='password'],
  .data-connection-pro select,
  .inspector-accordion.visuals .pro-field input,
  .inspector-accordion.visuals .pro-field select {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    color: #f5f5f5;
    font-size: 12px;
    height: 32px;
    padding: 0 8px;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
  }

  .general-layout-pro .pro-field input:focus,
  .general-layout-pro .pro-field select:focus,
  .general-layout-pro input[type='text']:focus,
  .general-layout-pro input[type='number']:not(.layout-control-input):focus,
  .general-layout-pro select:focus,
  .data-connection-pro .pro-field input:focus,
  .data-connection-pro .pro-field select:focus,
  .data-connection-pro input[type='text']:focus,
  .data-connection-pro input[type='password']:focus,
  .data-connection-pro select:focus,
  .inspector-accordion.visuals .pro-field input:focus,
  .inspector-accordion.visuals .pro-field select:focus {
    outline: none;
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(59, 130, 246, 0.5);
  }

  .general-layout-pro .pro-select,
  .general-layout-pro select,
  .data-connection-pro .pro-select,
  .data-connection-pro select,
  .inspector-accordion.visuals .pro-select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='6' viewBox='0 0 9 6'%3E%3Cpath fill='%239ca3af' d='M4.5 6L0 1.2 1.2 0l3.3 3.5L7.8 0 9 1.2z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    padding-right: 24px;
  }

  .general-layout-pro select option,
  .data-connection-pro select option,
  .inspector-accordion.visuals select option {
    background: #0b1220;
    color: #eef4ff;
  }

  .general-layout-pro .identity-well {
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    padding: 12px;
    margin-bottom: 12px;
  }

  .general-layout-pro .identity-grid-two {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-bottom: 10px;
  }

  .general-layout-pro .identity-grid-two > .pro-field {
    margin-bottom: 0;
  }

  .general-layout-pro .identity-input-wrap {
    position: relative;
    width: 100%;
  }

  .general-layout-pro .identity-input-prefix {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: rgba(161, 161, 170, 0.85);
    pointer-events: none;
    display: inline-flex;
    align-items: center;
  }

  .general-layout-pro .pro-field input.identity-icon-input {
    width: 100%;
    padding-left: 40px;
    background-image: none !important;
    background-position: 0 0 !important;
    background-size: 0 0 !important;
    background-repeat: no-repeat !important;
    -webkit-appearance: none;
    appearance: none;
  }

  .general-layout-pro .identity-visibility-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 32px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    padding: 12px;
    margin: 12px 0 10px;
  }

  .general-layout-pro .identity-visibility-item {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 11px;
    font-weight: 500;
    color: #a1a1aa;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .data-connection-pro .connection-well {
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    padding: 12px;
    margin-bottom: 12px;
  }

  .data-connection-pro .connection-row-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 10px;
  }

  .data-connection-pro .suggested-link-btn {
    margin-top: 6px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.1);
    color: #60a5fa;
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 10px;
    letter-spacing: 0.03em;
    text-align: left;
    width: fit-content;
    cursor: pointer;
  }

  .data-connection-pro .suggested-link-btn:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .data-connection-pro .icon-input-wrap {
    position: relative;
    width: 100%;
  }

  .data-connection-pro .icon-input-prefix {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: rgba(161, 161, 170, 0.85);
    pointer-events: none;
    display: inline-flex;
    align-items: center;
  }

  .data-connection-pro .pro-field input.icon-input {
    width: 100%;
    padding-left: 40px;
    background-image: none !important;
    background-position: 0 0 !important;
    background-size: 0 0 !important;
    background-repeat: no-repeat !important;
    -webkit-appearance: none;
    appearance: none;
  }

  .data-connection-pro .icon-input.with-suffix {
    padding-right: 30px;
    padding-left: 8px;
  }

  .data-connection-pro .icon-input-suffix {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    border: 0;
    background: transparent;
    color: rgba(161, 161, 170, 0.9);
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 6px;
  }

  .data-connection-pro .icon-input-suffix:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #e4e4e7;
  }

  .data-connection-pro .connection-test-btn {
    width: 100%;
    height: 32px;
    border-radius: 8px;
    border: 1px solid rgba(59, 130, 246, 0.3);
    background: rgba(37, 99, 235, 0.2);
    color: #60a5fa;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
    margin-bottom: 10px;
  }

  .data-connection-pro .connection-test-btn:hover:not(:disabled) {
    background: rgba(37, 99, 235, 0.4);
  }

  .data-connection-pro .connection-test-btn:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .data-connection-pro .btn-spinner {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    border: 2px solid rgba(96, 165, 250, 0.35);
    border-top-color: rgba(147, 197, 253, 1);
    animation: spin 0.8s linear infinite;
  }

  .general-layout-pro .layout-control-bar {
    display: flex;
    align-items: center;
    gap: 1px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    overflow: hidden;
    padding: 4px;
    margin-bottom: 12px;
  }

  .general-layout-pro .layout-control-segment {
    min-width: 0;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    border-radius: 7px;
    background: rgba(0, 0, 0, 0.32);
    height: 32px;
  }

  .general-layout-pro .layout-control-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.11em;
    color: #71717a;
    white-space: nowrap;
  }

  .general-layout-pro .layout-control-input {
    width: 100%;
    min-width: 0;
    border: 0;
    background: transparent;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    height: 26px;
    padding: 0;
    text-align: right;
  }

  .general-layout-pro .layout-control-input:focus {
    outline: none;
  }

  .general-layout-pro .layout-control-input::-webkit-outer-spin-button,
  .general-layout-pro .layout-control-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .general-layout-pro .layout-control-input[type='number'] {
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .general-layout-pro .visibility-segment {
    justify-content: space-between;
    gap: 6px;
  }

  .general-layout-pro .visibility-icon {
    color: rgba(161, 161, 170, 0.9);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .hyper-glass-toggle {
    width: 40px;
    height: 24px;
    border-radius: 999px;
    transition: all 500ms ease-out;
    cursor: pointer;
    position: relative;
    border: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.6);
    padding: 0;
    flex: 0 0 auto;
  }

  .hyper-glass-toggle.on {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(96, 165, 250, 0.3);
    box-shadow:
      inset 0 0 12px rgba(59, 130, 246, 0.6),
      0 0 0 1px rgba(59, 130, 246, 0.5);
  }

  .hyper-glass-knob {
    width: 16px;
    height: 16px;
    border-radius: 999px;
    position: absolute;
    top: 3px;
    left: 3px;
    transition: all 500ms cubic-bezier(0.23, 1, 0.32, 1);
    background: linear-gradient(to bottom, #fff, #d4d4d8);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.2);
    transform: translateX(0);
  }

  .hyper-glass-toggle.on .hyper-glass-knob {
    transform: translateX(16px);
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.5),
      0 0 8px rgba(255, 255, 255, 0.5);
  }

  .inspector-accordion.visuals .appearance-smart {
    display: grid;
    gap: 12px;
    margin-bottom: 12px;
  }

  .inspector-accordion.visuals .layout-engine-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 92px;
    gap: 10px;
    align-items: end;
  }

  .inspector-accordion.visuals .pro-field.compact {
    margin-bottom: 0;
  }

  .inspector-accordion.visuals .pro-field.compact input,
  .inspector-accordion.visuals .pro-field.compact select {
    height: 28px;
  }

  .inspector-accordion.visuals .pro-field.compact.cols-field input:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .inspector-accordion.visuals .pagination-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    padding: 8px;
  }

  .inspector-accordion.visuals .pagination-toggle-wrap {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  .inspector-accordion.visuals .pagination-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #71717a;
  }

  .inspector-accordion.visuals .pagination-limit {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 0;
  }

  .inspector-accordion.visuals .pagination-limit-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #71717a;
  }

  .inspector-accordion.visuals .pagination-limit input {
    width: 60px;
    height: 28px;
    text-align: center;
    text-transform: lowercase;
  }

  .inspector-accordion.visuals .pagination-limit.disabled {
    opacity: 0.45;
  }

  .inspector-accordion .appearance-subheader {
    margin: 16px 0 8px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #71717a;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding-bottom: 4px;
  }

  .inspector-accordion.visuals .appearance-two-col {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    align-items: end;
  }

  .inspector-accordion.visuals .appearance-three-col {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    align-items: end;
  }

  .inspector-accordion.visuals .speedtest-toggle-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 16px;
    row-gap: 12px;
    margin-bottom: 16px;
  }

  .inspector-accordion.visuals .speedtest-slider-stack {
    margin-top: 16px;
    display: grid;
    gap: 12px;
  }

  .inspector-accordion.visuals .dns-chart-layout-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .inspector-accordion.visuals .dns-chart-layout-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .inspector-accordion.visuals .dns-chart-layout-field select {
    width: 100%;
    min-width: 0;
  }

  .inspector-accordion.visuals .item-styling-grid {
    align-items: start;
  }

  .inspector-accordion.visuals .micro-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #71717a;
    margin-bottom: 6px;
    display: block;
    width: 100%;
    text-align: left;
  }

  .inspector-accordion.visuals .item-toggle-field {
    align-items: flex-start;
  }

  .inspector-accordion.visuals .item-toggle-field .hyper-glass-toggle {
    margin-top: 2px;
  }

  .inspector-accordion.visuals .color-row {
    margin-top: -2px;
  }

  .inspector-accordion.visuals .dns-chart-color-grid {
    margin-top: 10px;
  }

  .inspector-accordion.visuals .dns-chart-color-control {
    align-items: flex-start;
  }

  .inspector-accordion.visuals .dns-chart-slider-stack {
    margin-top: 12px;
    display: grid;
    gap: 12px;
  }

  .inspector-accordion.visuals .color-field {
    align-items: flex-start;
  }

  .inspector-accordion.visuals .color-circle {
    width: 16px;
    height: 16px;
    padding: 0;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: transparent;
    overflow: hidden;
    cursor: pointer;
  }

  .inspector-accordion.visuals .color-well {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 0 8px;
    height: 32px;
  }

  .inspector-accordion.visuals .color-hex-input {
    border: 0;
    background: transparent;
    color: #fff;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    width: 100%;
    height: 100%;
    padding: 0;
  }

  .inspector-accordion.visuals .color-hex-input:focus {
    outline: none;
    box-shadow: none;
  }

  .inspector-accordion.visuals .color-circle::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .inspector-accordion.visuals .color-circle::-webkit-color-swatch {
    border: 0;
    border-radius: 999px;
  }

  .inspector-accordion.visuals .typography-matrix {
    margin-top: -2px;
  }

  .inspector-accordion.visuals .metric-grid-style-section > summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .inspector-accordion.visuals .metric-grid-style-section > summary::-webkit-details-marker {
    display: none;
  }

  .inspector-accordion.visuals .metric-grid-style-section .subaccordion-chevron {
    color: rgba(161, 161, 170, 0.9);
    font-size: 11px;
    transform: rotate(-90deg);
    transition: transform 180ms ease;
  }

  .inspector-accordion.visuals .metric-grid-style-section[open] .subaccordion-chevron {
    transform: rotate(0deg);
  }

  .inspector-accordion.visuals .metric-grid-bg-row {
    display: grid;
    grid-template-columns: 170px minmax(0, 1fr);
    gap: 10px;
    margin-bottom: 10px;
    align-items: end;
  }

  .inspector-accordion.visuals .metric-grid-border-row {
    display: grid;
    grid-template-columns: 170px minmax(0, 1fr);
    gap: 10px;
    align-items: end;
    margin-bottom: 10px;
  }

  .inspector-accordion.visuals .metric-grid-border-style {
    margin-bottom: 10px;
  }

  .inspector-accordion.visuals .metric-grid-color-well {
    width: 100%;
    min-width: 120px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    padding: 0 8px;
    height: 42px;
    position: relative;
  }

  .inspector-accordion.visuals .metric-grid-color-swatch {
    width: 24px !important;
    height: 24px !important;
    min-width: 24px;
    padding: 0 !important;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1) !important;
    background: transparent !important;
    overflow: hidden;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    flex-shrink: 0;
    margin-right: 12px;
  }

  .inspector-accordion.visuals .metric-grid-color-swatch::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .inspector-accordion.visuals .metric-grid-color-swatch::-webkit-color-swatch {
    border: 0;
    border-radius: 999px;
  }

  .inspector-accordion.visuals .metric-grid-color-text {
    flex: 1;
    min-width: 90px;
    width: 100%;
    height: 100% !important;
    padding: 0 !important;
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    color: #f5f5f5;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    line-height: 1;
  }

  .inspector-accordion.visuals .metric-grid-color-text:focus {
    outline: none;
    box-shadow: none;
  }

  .inspector-accordion.visuals .metric-grid-full-select {
    width: 100%;
    height: 42px !important;
    background-color: rgba(0, 0, 0, 0.4) !important;
    border: 1px solid rgba(255, 255, 255, 0.05) !important;
    border-radius: 10px !important;
    box-shadow: none !important;
    padding-left: 16px !important;
    padding-right: 40px !important;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 14px;
  }

  .inspector-accordion.visuals .metric-grid-geometry-bar {
    display: flex;
    width: 100%;
    height: 42px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 12px;
    margin-top: 10px;
  }

  .inspector-accordion.visuals .metric-grid-geometry-segment {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    background: transparent;
    min-width: 0;
    height: 100%;
    transition: background-color 140ms ease;
  }

  .inspector-accordion.visuals .metric-grid-geometry-segment:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .inspector-accordion.visuals .metric-grid-geometry-segment-width {
    border-right: 1px solid rgba(255, 255, 255, 0.05);
  }

  .inspector-accordion.visuals .metric-grid-geometry-label {
    font-size: 10px;
    font-weight: 700;
    color: #71717a;
    margin-right: 8px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    flex: 0 0 auto;
  }

  .inspector-accordion.visuals .metric-grid-geometry-input {
    width: 100%;
    min-width: 0;
    height: 100% !important;
    border: none !important;
    border-radius: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    color: #fff;
    font-size: 14px;
    text-align: right;
    padding: 0 !important;
    appearance: textfield;
    -webkit-appearance: none;
    -moz-appearance: textfield;
  }

  .inspector-accordion.visuals .metric-grid-geometry-input:focus {
    outline: none;
    box-shadow: none;
  }

  .inspector-accordion.visuals .metric-grid-geometry-input::-webkit-outer-spin-button,
  .inspector-accordion.visuals .metric-grid-geometry-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .metric-manager-list {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    overflow: hidden;
    display: grid;
  }

  .custom-entity-list {
    display: grid;
    gap: 10px;
    margin-bottom: 10px;
  }

  .custom-entity-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    overflow: hidden;
  }

  .custom-entity-card > summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px;
  }

  .custom-entity-card > summary:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .custom-entity-card > summary::-webkit-details-marker {
    display: none;
  }

  .custom-entity-title {
    font-size: 12px;
    font-weight: 600;
    color: #e4e4e7;
  }

  .custom-entity-actions {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }

  .custom-entity-delete {
    border: 0;
    background: transparent;
    color: #f87171;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    cursor: pointer;
  }

  .custom-entity-delete:hover {
    color: #fca5a5;
  }

  .custom-entity-chevron {
    color: rgba(161, 161, 170, 0.9);
    font-size: 11px;
    transform: rotate(-90deg);
    transition: transform 180ms ease;
  }

  .custom-entity-card[open] .custom-entity-chevron {
    transform: rotate(0deg);
  }

  .custom-entity-body {
    padding: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .custom-entity-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #71717a;
  }

  .custom-entity-field input {
    height: 36px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    color: #f5f5f5;
    font-size: 12px;
    padding: 0 10px;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
  }

  .custom-entity-field input:focus {
    outline: none;
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(59, 130, 246, 0.5);
  }

  .custom-entity-add {
    width: 100%;
    padding: 8px 12px;
    border: 1px dashed rgba(255, 255, 255, 0.1);
    color: #a1a1aa;
    background: transparent;
    border-radius: 10px;
    transition: border-color 140ms ease, color 140ms ease, background-color 140ms ease;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 700;
    margin-bottom: 10px;
    cursor: pointer;
  }

  .custom-entity-add:hover:not(:disabled) {
    color: #fff;
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.05);
  }

  .custom-entity-add:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .metric-manager-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .metric-manager-row:last-child {
    border-bottom: 0;
  }

  .metric-manager-reorder {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
  }

  .metric-manager-drag {
    color: rgba(161, 161, 170, 0.75);
    letter-spacing: -0.1em;
    font-size: 11px;
    line-height: 1;
    user-select: none;
  }

  .metric-manager-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.1);
    color: #d4d4d8;
    font-size: 10px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    border-radius: 6px;
    padding: 2px 6px;
    white-space: nowrap;
  }

  .metric-manager-override {
    flex: 1;
    min-width: 0;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    color: #f5f5f5;
    font-size: 12px;
    height: 30px;
    padding: 0 8px;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
  }

  .metric-manager-override:focus {
    outline: none;
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(59, 130, 246, 0.5);
  }

  .seerr-style-empty {
    margin-bottom: 10px;
  }

  .icon-overrides-module .icon-manager {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .icon-overrides-module {
    margin-top: 4px;
  }

  .icon-overrides-module > summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .icon-overrides-module > summary::-webkit-details-marker {
    display: none;
  }

  .icon-overrides-module .subaccordion-chevron {
    color: rgba(161, 161, 170, 0.9);
    font-size: 11px;
    transform: rotate(-90deg);
    transition: transform 180ms ease;
  }

  .icon-overrides-module[open] .subaccordion-chevron {
    transform: rotate(0deg);
  }

  .icon-overrides-module .icon-manager-list {
    display: grid;
  }

  .icon-overrides-module .icon-manager-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
    gap: 8px;
    align-items: center;
    padding: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .icon-overrides-module .icon-manager-row:last-child {
    border-bottom: 0;
  }

  .icon-overrides-module .icon-manager-row input {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    color: #f5f5f5;
    font-size: 12px;
    height: 30px;
    padding: 0 8px;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
  }

  .icon-overrides-module .icon-manager-row input:read-only {
    color: #a1a1aa;
  }

  .icon-overrides-module .icon-manager-delete,
  .icon-overrides-module .icon-manager-add {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    border: 1px solid rgba(59, 130, 246, 0.35);
    background: rgba(37, 99, 235, 0.2);
    color: #60a5fa;
    font-size: 16px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
  }

  .icon-overrides-module .icon-manager-delete {
    border-color: rgba(248, 113, 113, 0.35);
    background: rgba(127, 29, 29, 0.28);
    color: #fca5a5;
  }

  .icon-overrides-module .icon-manager-add:disabled {
    opacity: 0.45;
    cursor: default;
  }

  @media (max-width: 860px) {
    .general-layout-pro .identity-grid-two {
      grid-template-columns: 1fr;
    }

    .data-connection-pro .connection-row-grid {
      grid-template-columns: 1fr;
    }

    .general-layout-pro .layout-control-bar {
      flex-direction: column;
      gap: 6px;
    }

    .general-layout-pro .layout-control-segment {
      width: 100%;
    }

    .monitor-offset-grid,
    .monitor-toggle-grid,
    .monitor-enabled-metrics-grid {
      grid-template-columns: 1fr;
    }

  }

  .panel-section h2 {
    margin: 0 0 12px 0;
    font-size: 1rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 12px;
  }

  input,
  select {
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--card-border);
    background: rgba(15, 20, 28, 0.9);
    color: var(--text);
    text-transform: none;
    letter-spacing: normal;
    font-size: 0.8rem;
    font-weight: 500;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .checkbox {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  .editor-empty {
    padding: 18px;
    border-radius: 12px;
    border: 1px dashed var(--card-border);
    color: var(--muted);
  }

  .settings-section,
  .preview-section {
    margin: 0;
  }

  .preview-section {
    position: sticky;
    top: 12px;
    display: flex;
    align-items: stretch;
  }

  .preview-stage {
    position: relative;
    width: 100%;
    min-height: 360px;
    height: min(72vh, 760px);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: rgba(2, 6, 23, 0.3);
    backdrop-filter: blur(12px);
  }

  .preview-stage-toolbar {
    position: relative;
    z-index: 3;
    width: 100%;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    pointer-events: auto;
    padding: 0 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(10px);
  }

  .preview-stage-title {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(113, 113, 122, 0.95);
    font-weight: 700;
  }

  .preview-stage-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .preview-zoom-input {
    width: 64px;
    height: 32px;
    padding: 0 8px;
    text-align: center;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(7, 9, 14, 0.75);
    box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.06),
      inset 0 -1px 1px rgba(0, 0, 0, 0.5);
    color: #e3eefc;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .preview-zoom-input:focus {
    outline: none;
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.5);
  }

  .preview-view-toggle {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 3px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(6, 10, 16, 0.52);
    backdrop-filter: blur(8px);
  }

  .preview-view-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: rgba(198, 216, 236, 0.82);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 5px 8px;
    line-height: 1;
    cursor: pointer;
  }

  .preview-view-btn svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .preview-view-btn.active {
    color: #eef4ff;
    border-color: rgba(86, 154, 255, 0.55);
    background: rgba(59, 130, 246, 0.2);
  }

  .preview-zoom-reset {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(255, 255, 255, 0.05);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: rgb(161, 161, 170);
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease;
    font-size: 14px;
    line-height: 1;
    font-weight: 700;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
  }

  .preview-zoom-reset:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .preview-zoom-stage {
    position: relative;
    z-index: 1;
    flex: 1;
    width: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 26px 18px 18px;
    overflow: hidden;
    background: rgba(2, 6, 23, 0.18);
  }

  .preview-zoom-stage::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
      linear-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.06) 1px, transparent 1px);
    background-size: 16px 16px, 16px 16px, 16px 16px;
    background-position: 0 0, 0 0;
    opacity: 0.86;
    pointer-events: none;
    z-index: 0;
  }

  .preview-device-shell {
    position: relative;
    z-index: 1;
    width: min(98%, 1600px);
    display: grid;
    place-items: center;
    transform: scale(var(--preview-zoom, 1));
    transform-origin: top center;
    transition: transform 180ms ease-out;
  }

  .preview-device-shell.desktop {
    width: min(98%, var(--preview-desktop-width, 1600px));
    max-width: var(--preview-desktop-width, 1600px);
  }

  .preview-device-shell.mobile {
    width: 430px;
    max-width: 430px;
    min-width: 430px;
  }

  .preview-frame {
    position: relative;
    z-index: 1;
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 0;
    width: min(98%, 1600px);
    min-width: 320px;
    min-height: 0;
    height: auto;
    overflow: visible;
    pointer-events: auto;
    box-shadow: 0 28px 52px rgba(0, 0, 0, 0.42), 0 14px 26px rgba(0, 0, 0, 0.3);
  }

  .preview-frame.is-clickable {
    cursor: pointer;
  }

  .preview-click-layer {
    position: absolute;
    inset: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    z-index: 3;
  }

  .preview-frame :global(.grid) {
    min-width: 0;
    pointer-events: none;
  }

  .preview-frame.desktop :global(.widget-shell) {
    grid-column: 1 / -1;
  }

  .preview-frame.desktop {
    width: min(98%, var(--preview-desktop-width, 1600px));
    max-width: var(--preview-desktop-width, 1600px);
  }

  .preview-frame.mobile {
    width: 430px;
    max-width: 430px;
    min-width: 430px;
  }

  .preview-frame.mobile :global(.widget-shell) {
    grid-column: span min(var(--mobile-span, 4), 4);
  }

  /* Force the same narrow-phone Komodo behavior in editor mobile preview. */
  .preview-frame.mobile :global(.service-list.grid.komodo-grid) {
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .settings-table label {
    display: grid;
    grid-template-columns: minmax(130px, 42%) minmax(0, 1fr);
    align-items: center;
    gap: 10px 12px;
  }

  .settings-group {
    display: grid;
    gap: 8px;
    margin-bottom: 12px;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: var(--settings-bg-soft, rgba(10, 16, 24, 0.58));
    backdrop-filter: blur(8px);
  }

  .settings-group .field-title {
    margin-bottom: 2px;
  }

  .inspector-accordion.content-metrics .media-playback-group {
    gap: 10px;
  }

  .inspector-accordion.content-metrics .media-playback-subheader {
    margin: 0 0 4px;
  }

  .inspector-accordion.content-metrics .media-display-mode-row {
    margin-bottom: 4px;
  }

  .inspector-accordion.content-metrics .media-display-mode-row .field-title {
    margin: 0;
  }

  .inspector-accordion.content-metrics .media-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    padding: 7px 10px;
    background: rgba(255, 255, 255, 0.04);
    font-size: 0.78rem;
    color: var(--text);
  }

  .inspector-accordion.content-metrics .media-logic-card {
    display: grid;
    gap: 10px;
    margin-bottom: 12px;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(8px);
  }

  .inspector-accordion.content-metrics .media-idle-toggles {
    display: grid;
    gap: 8px;
  }

  .inspector-accordion.content-metrics .speedtest-label-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 8px;
  }

  .inspector-accordion.content-metrics .speedtest-content-header {
    margin: 8px 0 10px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #71717a;
  }

  .inspector-accordion.content-metrics .speedtest-master-toggle {
    margin-bottom: 0;
  }

  .inspector-accordion.content-metrics .speedtest-table-master-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    margin-bottom: 16px;
  }

  .inspector-accordion.content-metrics .speedtest-columns-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 16px;
    row-gap: 12px;
    margin-top: 0;
  }

  .inspector-accordion.content-metrics .speedtest-column-toggle-cell {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .inspector-accordion.content-metrics .speedtest-toggle-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #71717a;
  }

  .inspector-accordion.content-metrics .speedtest-compact-toggle {
    width: 44px;
    height: 24px;
    flex: 0 0 auto;
    flex-shrink: 0;
    flex-grow: 0;
  }

  .inspector-accordion.content-metrics .speedtest-label-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: stretch;
  }

  .inspector-accordion.content-metrics .speedtest-label-field > span {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #71717a;
  }

  .inspector-accordion.content-metrics .speedtest-label-field > input {
    width: 100%;
  }

  .layout-inline-row {
    display: grid;
    grid-template-columns: minmax(130px, 42%) minmax(0, 1fr);
    align-items: center;
    gap: 10px 12px;
    margin-bottom: 15px;
  }

  .layout-inline-row .field-title {
    margin: 0;
  }

  .layout-inline-row .identity-segmented-toggle {
    justify-self: start;
  }

  .suggested-url-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
  }

  .settings-table label.checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    text-transform: none;
    letter-spacing: normal;
    font-size: 0.78rem;
    font-weight: 500;
  }

  .settings-section input[type='range'] {
    width: 100%;
  }

  .resize-panel {
    margin-top: 12px;
  }

  .resize-preview {
    padding: 12px;
    border-radius: 12px;
    border: 1px dashed var(--card-border);
    background: var(--settings-bg-soft, rgba(10, 16, 24, 0.58));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .resize-info {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .resize-handle {
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--card-border);
    background: transparent;
    color: var(--text);
    font-size: 0.75rem;
    cursor: grab;
  }

  .metric-options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }

  .field-title {
    margin: 0 0 8px 0;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .widget-wizard-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1200;
    display: grid;
    place-items: center;
    background: rgba(3, 8, 15, 0.62);
    backdrop-filter: blur(8px);
    padding: 22px;
  }

  .widget-wizard-modal {
    width: min(960px, calc(100vw - 44px));
    max-height: min(84vh, 900px);
    overflow: auto;
    border-radius: 16px;
    border: 1px solid var(--card-border);
    background: var(--settings-bg-surface, rgba(10, 16, 24, 0.72));
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
    padding: 16px;
    display: grid;
    gap: 14px;
  }

  .widget-wizard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .widget-wizard-header h2 {
    margin: 0;
    font-size: 1.1rem;
    color: var(--text);
  }

  .widget-wizard-subtitle {
    margin: 0;
    font-size: 0.8rem;
    color: var(--muted);
  }

  .widget-wizard-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .widget-style-category {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 12px;
    background: var(--settings-bg-soft, rgba(10, 16, 24, 0.58));
    display: grid;
    gap: 10px;
  }

  .widget-style-category h3 {
    margin: 0;
    font-size: 0.78rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: rgba(224, 236, 252, 0.8);
  }

  .widget-style-list {
    display: grid;
    gap: 8px;
  }

  .widget-style-card {
    display: grid;
    gap: 4px;
    text-align: left;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(12, 22, 35, 0.74);
    color: var(--text);
  }

  .widget-style-card strong {
    font-size: 0.84rem;
    font-weight: 700;
  }

  .widget-style-card span {
    font-size: 0.74rem;
    color: var(--muted);
  }

  .widget-style-card:hover {
    border-color: rgba(106, 168, 255, 0.72);
    box-shadow: 0 0 0 1px rgba(106, 168, 255, 0.28);
  }

  .widget-node-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .widget-node-card {
    display: grid;
    gap: 5px;
    text-align: left;
    padding: 12px;
    border-radius: 11px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(12, 22, 35, 0.74);
    color: var(--text);
  }

  .widget-node-card strong {
    font-size: 0.86rem;
  }

  .widget-node-card span {
    font-size: 0.76rem;
    color: var(--muted);
  }

  .widget-node-card:hover {
    border-color: rgba(106, 168, 255, 0.72);
    box-shadow: 0 0 0 1px rgba(106, 168, 255, 0.28);
  }

  .widget-wizard-actions {
    display: flex;
    justify-content: flex-end;
  }

  .metric-option {
    margin-bottom: 0;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--card-border);
    background: var(--settings-bg-soft, rgba(10, 16, 24, 0.58));
  }

  .metric-order-list {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;
  }

  .metric-order-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: var(--settings-bg-soft, rgba(10, 16, 24, 0.58));
    color: var(--text);
    font-size: 0.75rem;
  }

  .metric-order-item.draggable {
    cursor: grab;
  }

  .metric-order-item.draggable:active {
    cursor: grabbing;
  }

  .metric-order-item.drag-over-before {
    box-shadow: inset 0 2px 0 rgba(106, 168, 255, 0.9);
  }

  .metric-order-item.drag-over-after {
    box-shadow: inset 0 -2px 0 rgba(106, 168, 255, 0.9);
  }

  .metric-order-main {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .metric-order-main span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .metric-label-override {
    width: 150px;
    min-width: 110px;
    height: 30px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(10, 16, 24, 0.75);
    color: var(--text);
    font-size: 0.72rem;
  }

  .metric-order-actions {
    display: inline-flex;
    gap: 6px;
  }

  .monitor-targets-section {
    margin-bottom: 14px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid var(--card-border);
    background: var(--settings-bg-soft, rgba(10, 16, 24, 0.58));
  }

  .monitor-targets-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .monitor-targets-header .field-title {
    margin: 0;
  }

  .monitor-appearance-geometry {
    gap: 10px;
  }

  .monitor-slider-input-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 90px;
    gap: 8px;
    align-items: center;
  }

  .monitor-offset-grid {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .monitor-toggle-grid {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .monitor-endpoint-manager {
    gap: 12px;
    display: grid;
  }

  .monitor-target-add-btn {
    width: 100%;
    height: 34px;
    border-radius: 9px;
    border: 1px solid rgba(59, 130, 246, 0.45);
    background: rgba(37, 99, 235, 0.34);
    color: #dbeafe;
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
  }

  .monitor-target-collapsible {
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: var(--settings-bg-soft, rgba(10, 16, 24, 0.58));
    overflow: hidden;
  }

  .monitor-target-collapsible > summary {
    list-style: none;
    cursor: pointer;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto auto;
    gap: 8px;
    align-items: center;
    padding: 10px 10px 10px 8px;
  }

  .monitor-target-collapsible > summary::-webkit-details-marker {
    display: none;
  }

  .monitor-target-drag {
    color: rgba(161, 161, 170, 0.9);
    letter-spacing: -0.08em;
    font-size: 12px;
    user-select: none;
  }

  .monitor-target-summary-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .monitor-target-summary-name {
    color: #f1f5f9;
    font-size: 0.82rem;
    font-weight: 700;
    line-height: 1.1;
  }

  .monitor-target-summary-url {
    color: #94a3b8;
    font-size: 0.72rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .monitor-target-summary-chevron {
    color: rgba(161, 161, 170, 0.92);
    font-size: 12px;
  }

  .monitor-target-collapsible[open] .monitor-target-summary-chevron {
    transform: rotate(180deg);
  }

  .monitor-target-summary-remove {
    min-width: 24px;
    min-height: 24px;
    line-height: 1;
    padding: 0;
  }

  .monitor-target-reorder-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .monitor-target-reorder-actions .mini {
    min-width: 22px;
    min-height: 22px;
    line-height: 1;
    padding: 0;
  }

  .monitor-target-editor-grid {
    border-top: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 0;
    border-left: 0;
    border-right: 0;
    border-bottom: 0;
  }

  .source-help {
    margin: 0 0 10px 0;
    font-size: 0.74rem;
    color: var(--muted);
  }

  .monitor-target-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .monitor-target-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 10px;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: var(--settings-bg-soft, rgba(10, 16, 24, 0.58));
  }

  .monitor-target-row label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
  }

  .monitor-target-row .mini.danger {
    justify-self: start;
  }

  .monitor-enabled-metrics {
    grid-column: 1 / -1;
    display: grid;
    gap: 8px;
  }

  .monitor-enabled-metrics-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  .monitor-target-actions {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .monitor-target-test {
    font-size: 0.72rem;
    color: var(--muted);
    min-height: 1em;
    margin-right: auto;
  }

  .monitor-target-test.ok {
    color: var(--success);
  }

  .monitor-target-test.error {
    color: var(--danger);
  }

  .monitor-target-test.loading {
    color: #9dbad0;
  }

  .source-health-test-row {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }

  .source-health-test {
    font-size: 0.72rem;
    color: var(--muted);
    min-height: 1em;
  }

  .source-health-test.ok {
    color: var(--success);
  }

  .source-health-test.error {
    color: var(--danger);
  }

  .source-health-test.loading {
    color: #9dbad0;
  }

  .editor-error {
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 107, 107, 0.5);
    color: var(--danger);
    background: rgba(255, 107, 107, 0.1);
  }

  @media (max-width: 1320px) {
    .widget-editor-layout {
      grid-template-columns: 1fr;
      gap: 16px;
    }

    .preview-section {
      position: static;
    }
  }

  @media (max-width: 900px) {
    .editor-grid {
      grid-template-columns: 1fr;
    }

    .editor-tabs {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .inspector-accordion.visuals .layout-engine-row,
    .inspector-accordion.visuals .appearance-two-col,
    .inspector-accordion.visuals .appearance-three-col {
      grid-template-columns: 1fr;
    }

    .inspector-accordion.visuals .speedtest-toggle-grid {
      grid-template-columns: 1fr;
    }

    .inspector-accordion.visuals .dns-chart-layout-grid {
      grid-template-columns: 1fr;
    }

    .inspector-accordion.visuals .metric-grid-border-row {
      grid-template-columns: 1fr;
    }

    .inspector-accordion.visuals .metric-grid-bg-row {
      grid-template-columns: 1fr;
    }

    .metric-manager-row {
      flex-wrap: wrap;
    }

    .metric-manager-override {
      flex-basis: 100%;
    }

    .custom-entity-body {
      grid-template-columns: 1fr;
    }

    .inspector-accordion.content-metrics .speedtest-label-grid {
      grid-template-columns: 1fr;
    }

    .inspector-accordion.content-metrics .speedtest-columns-grid {
      grid-template-columns: 1fr;
    }

    .inspector-accordion.visuals .pagination-bar {
      flex-direction: column;
      align-items: stretch;
    }

    .inspector-accordion.visuals .pagination-limit {
      justify-content: space-between;
    }

    .icon-overrides-module .icon-manager-row {
      grid-template-columns: 1fr;
    }

    .tab-button {
      width: 100%;
    }

    .settings-panel {
      grid-template-columns: 1fr;
    }

    .dashboard-settings-tabs {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dashboard-tab-row {
      grid-template-columns: 1fr;
      align-items: start;
    }
  }
</style>
