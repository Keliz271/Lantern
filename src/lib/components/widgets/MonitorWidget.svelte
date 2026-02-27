<script lang="ts">
  import { onMount } from 'svelte';
  import type { WidgetInstance } from '$widgets/types';

  type MonitorItem = {
    name: string;
    url?: string;
    icon?: string;
    status: 'ok' | 'warn' | 'down' | 'unknown';
    statusText: string;
    latencyMs?: number;
    containerHealth?: 'healthy' | 'unhealthy' | 'unknown';
  };

  type SystemMonitorVital = {
    key:
      | 'cpu'
      | 'memory'
      | 'activeMemory'
      | 'disk'
      | 'temperature'
      | 'network'
      | 'diskio'
      | 'load1'
      | 'load5'
      | 'load15';
    label: string;
    value: number;
    actual?: number;
    percent?: number;
    unit: string;
    max: number;
  };

  type SystemMonitorHost = {
    id: string;
    label: string;
    host: string;
    uptimeText: string;
    uptimeSec?: number;
    status: 'ok' | 'warn' | 'down' | 'unknown';
    metrics: SystemMonitorVital[];
  };

  type MonitorPayload = {
    items: MonitorItem[];
    checkedAt?: string;
    mode?: 'targets' | 'system';
    systemHosts?: SystemMonitorHost[];
    error?: string;
  };

  export let widget: WidgetInstance<MonitorPayload>;

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const monitorMetricOptions = [
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
  const defaultMonitorMetrics = ['cpu', 'memory', 'disk', 'temperature'] as const;

  let gridEl: HTMLDivElement | null = null;
  let measuredWidth = 0;
  let measuredHeight = 0;
  let items: MonitorItem[] = [];
  let systemHosts: SystemMonitorHost[] = [];
  let orderedSystemHosts: SystemMonitorHost[] = [];
  let columns = 3;
  let effectiveColumns = 3;
  let effectiveRows = 1;
  let monitorScale = 1;
  let monitorStyle: 'list' | 'system' = 'list';
  let monitorDisplay: 'compact' | 'gauge' | 'linear' | 'header' | 'spark' = 'compact';
  let monitorSystemOrientation: 'stacked' | 'side-by-side' = 'side-by-side';
  let monitorSystemMetrics: string[] = [...defaultMonitorMetrics];
  let monitorSystemMetricsByNode: Record<string, string[]> = {};
  let monitorMetricLabelOverrides: Record<string, string> = {};
  let monitorMetricValueMode: 'actual' = 'actual';
  let monitorAutoHeight = true;
  let monitorCriticalPulse = true;
  let monitorShowNodeIp = true;
  let monitorShowMetricIcons = true;
  let monitorHideHostLabel = false;
  let monitorHideUptime = false;
  let monitorHeadOffsetY = 0;
  let monitorVitalsOffsetY = 0;
  let showStatusDot = true;
  let showStatusText = true;
  let showLatency = true;
  let showDividers = true;
  let iconSize = 38;
  let contentOffsetX = 0;
  let contentOffsetY = 0;
  let monitorNameFont = '';
  let monitorNameWeight = 600;
  let monitorNameSize = 16;
  let monitorNameColor = '#eef4ff';
  let monitorStatusFont = '';
  let monitorStatusWeight = 600;
  let monitorStatusSize = 13;
  let monitorStatusColor = '#b6cadf';
  let monitorLatencyFont = '';
  let monitorLatencyWeight = 600;
  let monitorLatencySize = 13;
  let monitorLatencyColor = '#9aa8ba';
  let monitorPrimaryFont = '';
  let monitorPrimaryWeight = 700;
  let monitorPrimarySize = 28;
  let monitorPrimaryColor = '#eef4ff';
  let monitorMetricLabelFont = '';
  let monitorMetricLabelWeight = 600;
  let monitorMetricLabelSize = 13;
  let monitorMetricLabelColor = '#9aa8ba';
  let monitorMetricValueFont = '';
  let monitorMetricValueWeight = 700;
  let monitorMetricValueSize = 28;
  let monitorMetricValueColor = '#eef4ff';
  let monitorUnitFont = '';
  let monitorUnitWeight = 600;
  let monitorUnitSize = 13;
  let monitorUnitColor = '#9aa8ba';
  let monitorRingSize = 112;
  let monitorStrokeWidth = 8;
  let monitorGaugeColumnGap = 10;
  let monitorWarnThreshold = 75;
  let monitorCriticalThreshold = 90;
  let monitorGaugeTrackColor = '#2a3440';
  let monitorGaugeColor = '#eef4ff';
  let monitorGaugeWarnColor = '#ffd479';
  let monitorGaugeCriticalColor = '#ff6b6b';
  let monitorLinearNodeGap = 0;
  let monitorLinearBarHeight = 12;
  let monitorLinearBarWidth = 100;
  let monitorLinearTrackColor = '#243041';
  let monitorLinearFillStartColor = '#43b9ff';
  let monitorLinearFillMidColor = '#7d75ff';
  let monitorLinearFillEndColor = '#ff6778';
  let monitorLinearStripeColor = '#ffffff';
  let monitorLinearIconBgColor = '#182332';
  let monitorLinearIconBorderColor = '#54657a';
  let monitorLinearValueWidth = 48;
  let sparkHistory = new Map<string, number[]>();
  let sparkHistorySignature = '';
  let failedIconUrls = new Set<string>();

  $: items = Array.isArray(widget.data?.items) ? widget.data.items : [];
  $: systemHosts = Array.isArray(widget.data?.systemHosts)
    ? widget.data.systemHosts.filter((entry): entry is SystemMonitorHost => Boolean(entry && entry.metrics))
    : [];
  $: monitorStyle =
    widget.kind === 'systemMonitor'
      ? 'system'
      : widget.options?.monitorStyle === 'system'
        ? 'system'
        : 'list';
  $: monitorDisplay =
    widget.options?.monitorDisplay === 'gauge' ||
    widget.options?.monitorDisplay === 'linear' ||
    widget.options?.monitorDisplay === 'header' ||
    widget.options?.monitorDisplay === 'spark'
      ? widget.options.monitorDisplay
      : 'compact';
  $: monitorSystemOrientation =
    widget.options?.monitorSystemOrientation === 'stacked' ? 'stacked' : 'side-by-side';
  $: monitorSystemMetrics = Array.isArray(widget.options?.monitorSystemMetrics)
    ? widget.options.monitorSystemMetrics
        .filter((entry): entry is string => typeof entry === 'string')
        .filter((entry) => monitorMetricOptions.includes(entry as (typeof monitorMetricOptions)[number]))
    : [...defaultMonitorMetrics];
  $: if (monitorSystemMetrics.length === 0) {
    monitorSystemMetrics = [...defaultMonitorMetrics];
  }
  $: monitorSystemMetricsByNode =
    widget.options?.monitorSystemMetricsByNode &&
    typeof widget.options.monitorSystemMetricsByNode === 'object' &&
    !Array.isArray(widget.options.monitorSystemMetricsByNode)
      ? Object.fromEntries(
          Object.entries(widget.options.monitorSystemMetricsByNode as Record<string, unknown>)
            .map(([nodeId, metrics]) => {
              const cleanNodeId = String(nodeId ?? '').trim();
              if (!cleanNodeId) return null;
              const selected = Array.isArray(metrics)
                ? metrics
                    .filter((entry): entry is string => typeof entry === 'string')
                    .filter((entry) => monitorMetricOptions.includes(entry as (typeof monitorMetricOptions)[number]))
                : [];
              return [cleanNodeId, selected] as const;
            })
            .filter((entry): entry is readonly [string, string[]] => Boolean(entry))
        )
      : {};
  $: monitorMetricLabelOverrides =
    widget.options?.metricLabelOverrides &&
    typeof widget.options.metricLabelOverrides === 'object' &&
    !Array.isArray(widget.options.metricLabelOverrides)
      ? Object.fromEntries(
          Object.entries(widget.options.metricLabelOverrides as Record<string, unknown>)
            .map(([key, value]) => [String(key ?? '').trim(), String(value ?? '').trim()] as const)
            .filter(([key, value]) => key.length > 0 && value.length > 0)
        )
      : {};
  $: monitorMetricValueMode = 'actual';
  $: monitorAutoHeight = widget.options?.monitorAutoHeight !== false;
  $: monitorCriticalPulse = widget.options?.monitorCriticalPulse !== false;
  $: monitorShowNodeIp = widget.options?.monitorShowNodeIp !== false;
  $: monitorShowMetricIcons = widget.options?.monitorShowMetricIcons !== false;
  $: monitorHideHostLabel = widget.options?.monitorHideHostLabel === true;
  $: monitorHideUptime = widget.options?.monitorHideUptime === true;
  $: monitorHeadOffsetY = clamp(Number(widget.options?.monitorHeadOffsetY ?? 0), -120, 120);
  $: monitorVitalsOffsetY = clamp(Number(widget.options?.monitorVitalsOffsetY ?? 0), -120, 120);
  $: columns = Math.min(6, Math.max(1, Number(widget.options?.columns ?? 3)));
  $: showStatusDot = widget.options?.showStatusDot !== false;
  $: showStatusText = widget.options?.showStatusText !== false;
  $: showLatency = widget.options?.showLatency !== false;
  $: showDividers = widget.options?.showDividers !== false;
  $: iconSize = clamp(Number(widget.options?.iconSize ?? 38), 16, 96);
  $: contentOffsetX = clamp(Number(widget.options?.monitorContentOffsetX ?? 0), -120, 120);
  $: contentOffsetY = clamp(Number(widget.options?.monitorContentOffsetY ?? 0), -120, 120);
  $: monitorNameFont =
    typeof widget.options?.monitorNameFont === 'string' ? widget.options.monitorNameFont.trim() : '';
  $: monitorNameWeight = clamp(Number(widget.options?.monitorNameWeight ?? 600), 300, 900);
  $: monitorNameSize = clamp(Number(widget.options?.monitorNameSize ?? 16), 8, 42);
  $: monitorNameColor =
    typeof widget.options?.monitorNameColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorNameColor)
      ? widget.options.monitorNameColor
      : '#eef4ff';
  $: monitorStatusFont =
    typeof widget.options?.monitorStatusFont === 'string' ? widget.options.monitorStatusFont.trim() : '';
  $: monitorStatusWeight = clamp(Number(widget.options?.monitorStatusWeight ?? 600), 300, 900);
  $: monitorStatusSize = clamp(Number(widget.options?.monitorStatusSize ?? 13), 8, 36);
  $: monitorStatusColor =
    typeof widget.options?.monitorStatusColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorStatusColor)
      ? widget.options.monitorStatusColor
      : '#b6cadf';
  $: monitorLatencyFont =
    typeof widget.options?.monitorLatencyFont === 'string' ? widget.options.monitorLatencyFont.trim() : '';
  $: monitorLatencyWeight = clamp(Number(widget.options?.monitorLatencyWeight ?? 600), 300, 900);
  $: monitorLatencySize = clamp(Number(widget.options?.monitorLatencySize ?? 13), 8, 36);
  $: monitorLatencyColor =
    typeof widget.options?.monitorLatencyColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorLatencyColor)
      ? widget.options.monitorLatencyColor
      : '#9aa8ba';
  $: monitorPrimaryFont =
    typeof widget.options?.monitorPrimaryFont === 'string' ? widget.options.monitorPrimaryFont.trim() : '';
  $: monitorPrimaryWeight = clamp(Number(widget.options?.monitorPrimaryWeight ?? 700), 300, 900);
  $: monitorPrimarySize = clamp(Number(widget.options?.monitorPrimarySize ?? 28), 10, 80);
  $: monitorPrimaryColor =
    typeof widget.options?.monitorPrimaryColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorPrimaryColor)
      ? widget.options.monitorPrimaryColor
      : '#eef4ff';
  $: monitorMetricLabelFont =
    typeof widget.options?.monitorMetricLabelFont === 'string'
      ? widget.options.monitorMetricLabelFont.trim()
      : monitorLatencyFont;
  $: monitorMetricLabelWeight = clamp(
    Number(widget.options?.monitorMetricLabelWeight ?? monitorLatencyWeight ?? 600),
    300,
    900
  );
  $: monitorMetricLabelSize = clamp(
    Number(widget.options?.monitorMetricLabelSize ?? monitorLatencySize ?? 13),
    8,
    36
  );
  $: monitorMetricLabelColor =
    typeof widget.options?.monitorMetricLabelColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorMetricLabelColor)
      ? widget.options.monitorMetricLabelColor
      : monitorLatencyColor;
  $: monitorMetricValueFont =
    typeof widget.options?.monitorMetricValueFont === 'string'
      ? widget.options.monitorMetricValueFont.trim()
      : monitorPrimaryFont;
  $: monitorMetricValueWeight = clamp(
    Number(widget.options?.monitorMetricValueWeight ?? monitorPrimaryWeight ?? 700),
    300,
    900
  );
  $: monitorMetricValueSize = clamp(
    Number(widget.options?.monitorMetricValueSize ?? monitorPrimarySize ?? 28),
    10,
    80
  );
  $: monitorMetricValueColor =
    typeof widget.options?.monitorMetricValueColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorMetricValueColor)
      ? widget.options.monitorMetricValueColor
      : monitorPrimaryColor;
  $: monitorUnitFont =
    typeof widget.options?.monitorUnitFont === 'string' ? widget.options.monitorUnitFont.trim() : '';
  $: monitorUnitWeight = clamp(Number(widget.options?.monitorUnitWeight ?? 600), 300, 900);
  $: monitorUnitSize = clamp(Number(widget.options?.monitorUnitSize ?? 13), 8, 48);
  $: monitorUnitColor =
    typeof widget.options?.monitorUnitColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorUnitColor)
      ? widget.options.monitorUnitColor
      : '#9aa8ba';
  $: monitorRingSize = clamp(Number(widget.options?.monitorRingSize ?? 112), 64, 240);
  $: monitorStrokeWidth = clamp(Number(widget.options?.monitorStrokeWidth ?? 8), 2, 20);
  $: monitorGaugeColumnGap = clamp(Number(widget.options?.monitorGaugeColumnGap ?? 10), -300, 300);
  $: monitorWarnThreshold = clamp(Number(widget.options?.monitorWarnThreshold ?? 75), 0, 100);
  $: monitorCriticalThreshold = clamp(
    Number(widget.options?.monitorCriticalThreshold ?? 90),
    monitorWarnThreshold,
    100
  );
  $: monitorGaugeTrackColor =
    typeof widget.options?.monitorGaugeTrackColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorGaugeTrackColor)
      ? widget.options.monitorGaugeTrackColor
      : '#2a3440';
  $: monitorGaugeColor =
    typeof widget.options?.monitorGaugeColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorGaugeColor)
      ? widget.options.monitorGaugeColor
      : monitorPrimaryColor;
  $: monitorGaugeWarnColor =
    typeof widget.options?.monitorGaugeWarnColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorGaugeWarnColor)
      ? widget.options.monitorGaugeWarnColor
      : '#ffd479';
  $: monitorGaugeCriticalColor =
    typeof widget.options?.monitorGaugeCriticalColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorGaugeCriticalColor)
      ? widget.options.monitorGaugeCriticalColor
      : '#ff6b6b';
  $: monitorLinearNodeGap = clamp(Number(widget.options?.monitorLinearNodeGap ?? 0), 0, 80);
  $: monitorLinearBarHeight = clamp(Number(widget.options?.monitorLinearBarHeight ?? 12), 4, 32);
  $: monitorLinearBarWidth = clamp(Number(widget.options?.monitorLinearBarWidth ?? 100), 40, 100);
  $: monitorLinearTrackColor =
    typeof widget.options?.monitorLinearTrackColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorLinearTrackColor)
      ? widget.options.monitorLinearTrackColor
      : '#243041';
  $: monitorLinearFillStartColor =
    typeof widget.options?.monitorLinearFillStartColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorLinearFillStartColor)
      ? widget.options.monitorLinearFillStartColor
      : '#43b9ff';
  $: monitorLinearFillMidColor =
    typeof widget.options?.monitorLinearFillMidColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorLinearFillMidColor)
      ? widget.options.monitorLinearFillMidColor
      : '#7d75ff';
  $: monitorLinearFillEndColor =
    typeof widget.options?.monitorLinearFillEndColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorLinearFillEndColor)
      ? widget.options.monitorLinearFillEndColor
      : '#ff6778';
  $: monitorLinearStripeColor =
    typeof widget.options?.monitorLinearStripeColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorLinearStripeColor)
      ? widget.options.monitorLinearStripeColor
      : '#ffffff';
  $: monitorLinearIconBgColor =
    typeof widget.options?.monitorLinearIconBgColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorLinearIconBgColor)
      ? widget.options.monitorLinearIconBgColor
      : '#182332';
  $: monitorLinearIconBorderColor =
    typeof widget.options?.monitorLinearIconBorderColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.monitorLinearIconBorderColor)
      ? widget.options.monitorLinearIconBorderColor
      : '#54657a';
  $: monitorLinearValueWidth = 82;
  $: {
    if (monitorStyle !== 'system' || systemHosts.length === 0) {
      sparkHistorySignature = '';
    } else {
      const signature = `${widget.data?.checkedAt ?? ''}|${systemHosts
        .map((host) => `${host.id}:${host.metrics.map((metric) => `${metric.key}:${metric.value.toFixed(2)}`).join(',')}`)
        .join(';')}`;
      if (signature !== sparkHistorySignature) {
        sparkHistorySignature = signature;

        const next = new Map(sparkHistory);
        const activeKeys = new Set<string>();
        for (const host of systemHosts) {
          for (const metric of host.metrics) {
            const key = `${host.id}:${metric.key}`;
            activeKeys.add(key);
            const prev = next.get(key) ?? [];
            const limit = 90;
            const value = clamp(getMetricPercent(metric), 0, 100);
            const series = [...prev, value];
            if (series.length > limit) series.splice(0, series.length - limit);
            next.set(key, series);
          }
        }
        for (const key of next.keys()) {
          if (!activeKeys.has(key)) next.delete(key);
        }
        sparkHistory = next;
      }
    }
  }

  const updateGridMeasurements = () => {
    if (!gridEl || typeof window === 'undefined') return;
    const rect = gridEl.getBoundingClientRect();
    const parentRect = gridEl.parentElement?.getBoundingClientRect();
    measuredWidth = rect.width;
    measuredHeight = Math.max(rect.height, parentRect?.height ?? 0);
  };

  const resolveLayout = () => {
    const listCount = Math.max(1, items.length);
    const systemCount = Math.max(1, orderedSystemHosts.length);
    const count = monitorStyle === 'system' ? systemCount : listCount;
    if (monitorStyle === 'system') {
      const shouldUseTwoColumns =
        monitorSystemOrientation === 'side-by-side' && count > 1;
      effectiveColumns = shouldUseTwoColumns ? Math.min(2, count) : 1;
    } else {
      effectiveColumns = Math.min(clamp(columns, 1, 6), count);
    }
    effectiveRows = Math.max(1, Math.ceil(count / effectiveColumns));
    const cellWidth = measuredWidth > 0 ? measuredWidth / effectiveColumns : 170;
    const cellHeight = measuredHeight > 0 ? measuredHeight / effectiveRows : 72;
    const widthScale = cellWidth / (monitorStyle === 'system' ? 360 : 260);
    const heightScale = cellHeight / (monitorStyle === 'system' ? 210 : 84);
    const fittedScale =
      monitorStyle === 'system' && monitorAutoHeight ? widthScale : Math.min(widthScale, heightScale);
    monitorScale = clamp(
      fittedScale,
      monitorStyle === 'system' ? 0.34 : 0.56,
      monitorStyle === 'system' ? 1 : 1.5
    );
  };

  $: {
    monitorStyle;
    monitorSystemOrientation;
    columns;
    items.length;
    orderedSystemHosts.length;
    measuredWidth;
    measuredHeight;
    resolveLayout();
  }

  onMount(() => {
    updateGridMeasurements();
    if (!gridEl || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateGridMeasurements());
    observer.observe(gridEl);
    return () => observer.disconnect();
  });

  const handleIconError = (url?: string) => {
    if (!url || failedIconUrls.has(url)) return;
    failedIconUrls = new Set([...failedIconUrls, url]);
  };

  const canShowIcon = (url?: string) => Boolean(url) && !failedIconUrls.has(url!);

  const getInitial = (name: string) => {
    const value = name.trim();
    return value ? value[0]!.toUpperCase() : '?';
  };

  const getMetricWarnThreshold = (vital: SystemMonitorVital) =>
    vital.key === 'activeMemory' ? 85 : monitorWarnThreshold;

  const getMetricCriticalThreshold = (vital: SystemMonitorVital) =>
    Math.max(getMetricWarnThreshold(vital), monitorCriticalThreshold);

  const getMetricValueColor = (vital: SystemMonitorVital, value: number) => {
    if (value >= getMetricCriticalThreshold(vital)) return monitorGaugeCriticalColor;
    if (value >= getMetricWarnThreshold(vital)) return monitorGaugeWarnColor;
    return monitorGaugeColor;
  };

  const getMetricPercent = (vital: SystemMonitorVital) => {
    if (typeof vital.percent === 'number' && Number.isFinite(vital.percent)) {
      return clamp(vital.percent, 0, 100);
    }
    return clamp((vital.value / Math.max(1, vital.max)) * 100, 0, 100);
  };

  const getMetricActual = (vital: SystemMonitorVital) => {
    const actualRaw = (vital as unknown as Record<string, unknown>).actual;
    if (typeof actualRaw === 'number' && Number.isFinite(actualRaw)) return actualRaw;
    if (actualRaw === null || typeof actualRaw !== 'undefined') return NaN;
    return vital.value;
  };

  const formatMetricNumber = (value: number, unit: string) => {
    if (!Number.isFinite(value)) return '--';
    if (unit === '%') return String(Math.round(value * 10) / 10).replace(/\.0$/, '');
    if (unit === '') return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
    if (Math.abs(value) >= 100) return String(Math.round(value));
    return String(Math.round(value * 10) / 10).replace(/\.0$/, '');
  };

  const toMetricParts = (vital: SystemMonitorVital) => {
    const actual = getMetricActual(vital);
    const percent = getMetricPercent(vital);
    const actualText = Number.isFinite(actual)
      ? `${formatMetricNumber(actual, vital.unit)}${vital.unit === 'C' ? '°C' : vital.unit ? ` ${vital.unit}` : ''}`
      : '--';
    const renderText = actualText;
    const rounded = actual;
    return {
      value: Number.isFinite(rounded) ? formatMetricNumber(rounded, '') : '--',
      unit: vital.unit === 'C' ? '°C' : vital.unit,
      renderText,
      percent
    };
  };

  const getGaugeLength = (vital: SystemMonitorVital) => {
    const size = monitorRingSize;
    const stroke = monitorStrokeWidth;
    const radius = Math.max(2, (size - stroke) / 2);
    const circumference = 2 * Math.PI * radius;
    const ratio = clamp(getMetricPercent(vital) / 100, 0, 1);
    return {
      radius,
      circumference,
      dashoffset: circumference * (1 - ratio)
    };
  };

  const getSparklinePoints = (hostId: string, vital: SystemMonitorVital) => {
    const key = `${hostId}:${vital.key}`;
    const history = sparkHistory.get(key) ?? [vital.value];
    const width = 180;
    const height = 34;
    const minY = 2;
    const maxY = height - 2;
    const limit = 100;
    if (history.length <= 1) {
      const y = maxY - (clamp(history[0] ?? getMetricPercent(vital), 0, limit) / limit) * (maxY - minY);
      return `0,${y.toFixed(2)} ${width},${y.toFixed(2)}`;
    }
    return history
      .map((value, index) => {
        const x = (index / (history.length - 1)) * width;
        const normalized = clamp(value, 0, limit) / limit;
        const y = maxY - normalized * (maxY - minY);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  };

  const getSystemHostLabel = (host: SystemMonitorHost) => {
    const label = String(host.label ?? '').trim();
    if (!label) return '';
    if (monitorShowNodeIp) return label;
    const hostToken = String(host.host ?? '').trim();
    if (!hostToken) return label;
    const suffix = ` (${hostToken})`;
    return label.endsWith(suffix) ? label.slice(0, -suffix.length).trim() : label;
  };

  const getOrderedSystemHosts = (hosts: SystemMonitorHost[]) => {
    if (monitorSystemMetrics.length === 0) return hosts;
    return hosts.map((host) => {
      const metricByKey = new Map<string, SystemMonitorVital>();
      host.metrics.forEach((metric) => metricByKey.set(metric.key, metric));
      const scopedOrder = monitorSystemMetricsByNode[host.id];
      const order = Array.isArray(scopedOrder) && scopedOrder.length > 0 ? scopedOrder : monitorSystemMetrics;
      const ordered = order
        .map((key) => metricByKey.get(key))
        .filter((metric): metric is SystemMonitorVital => Boolean(metric));
      return { ...host, metrics: ordered };
    });
  };

  $: {
    monitorSystemMetrics;
    monitorSystemMetricsByNode;
    orderedSystemHosts = getOrderedSystemHosts(systemHosts);
  }

  const getMetricIconName = (key: SystemMonitorVital['key']) => {
    if (key === 'cpu') return 'cpu';
    if (key === 'memory') return 'memory';
    if (key === 'activeMemory') return 'memory';
    if (key === 'disk') return 'disk';
    if (key === 'temperature') return 'temperature';
    if (key === 'network') return 'network';
    if (key === 'diskio') return 'diskio';
    return 'gauge';
  };

  const getMetricDisplayLabel = (vital: SystemMonitorVital) => {
    const override = monitorMetricLabelOverrides[vital.key];
    return override && override.trim().length > 0 ? override.trim() : vital.label;
  };
</script>

{#if widget.data?.error && monitorStyle !== 'system'}
  <p class="error-text">{widget.data.error}</p>
{:else}
  <div
    bind:this={gridEl}
    class={`monitor-grid ${monitorStyle === 'system' ? 'system' : 'list'} ${monitorStyle === 'system' && orderedSystemHosts.length > 1 ? 'has-multiple' : ''} ${monitorStyle === 'system' && effectiveColumns === 2 ? 'two-col' : ''} ${monitorStyle === 'system' && monitorDisplay === 'linear' ? 'linear-style' : ''} ${monitorStyle === 'system' && monitorAutoHeight ? 'auto-height' : ''}`}
    style={`--monitor-columns: ${effectiveColumns}; --monitor-rows: ${effectiveRows}; --monitor-scale: ${monitorScale}; --monitor-text-scale: ${monitorStyle === 'system' ? monitorScale : 1}; --monitor-icon-size: ${iconSize}px; --monitor-name-size: ${monitorNameSize}px; --monitor-name-color: ${monitorNameColor}; --monitor-name-weight:${monitorNameWeight}; --monitor-status-size: ${monitorStatusSize}px; --monitor-status-color: ${monitorStatusColor}; --monitor-status-weight:${monitorStatusWeight}; --monitor-latency-size: ${monitorLatencySize}px; --monitor-latency-color:${monitorLatencyColor}; --monitor-latency-weight:${monitorLatencyWeight}; --monitor-offset-x:${contentOffsetX}px; --monitor-offset-y:${contentOffsetY}px; --monitor-divider-color:${showDividers ? 'rgba(255, 255, 255, 0.08)' : 'transparent'}; --monitor-primary-size:${monitorPrimarySize}px; --monitor-primary-color:${monitorPrimaryColor}; --monitor-primary-weight:${monitorPrimaryWeight}; --monitor-unit-size:${monitorUnitSize}px; --monitor-unit-color:${monitorUnitColor}; --monitor-unit-weight:${monitorUnitWeight}; --monitor-metric-label-size:${monitorMetricLabelSize}px; --monitor-metric-label-color:${monitorMetricLabelColor}; --monitor-metric-label-weight:${monitorMetricLabelWeight}; --monitor-metric-value-size:${monitorMetricValueSize}px; --monitor-metric-value-color:${monitorMetricValueColor}; --monitor-metric-value-weight:${monitorMetricValueWeight}; --monitor-ring-size:${monitorRingSize}px; --monitor-stroke-width:${monitorStrokeWidth}px; --monitor-gauge-column-gap:${monitorGaugeColumnGap}px; --monitor-gauge-track-color:${monitorGaugeTrackColor}; --monitor-head-offset-y:${monitorHeadOffsetY}px; --monitor-vitals-offset-y:${monitorVitalsOffsetY}px; --monitor-linear-node-gap:${monitorLinearNodeGap}px; --monitor-linear-bar-height:${monitorLinearBarHeight}px; --monitor-linear-bar-width-pct:${monitorLinearBarWidth}%; --monitor-linear-value-width:${monitorLinearValueWidth}px; --monitor-linear-track-color:${monitorLinearTrackColor}; --monitor-linear-fill-start-color:${monitorLinearFillStartColor}; --monitor-linear-fill-mid-color:${monitorLinearFillMidColor}; --monitor-linear-fill-end-color:${monitorLinearFillEndColor}; --monitor-linear-stripe-color:${monitorLinearStripeColor}; --monitor-linear-icon-bg-color:${monitorLinearIconBgColor}; --monitor-linear-icon-border-color:${monitorLinearIconBorderColor}; ${monitorNameFont ? `--monitor-name-font:${monitorNameFont};` : ''} ${monitorStatusFont ? `--monitor-status-font:${monitorStatusFont};` : ''} ${monitorLatencyFont ? `--monitor-latency-font:${monitorLatencyFont};` : ''} ${monitorPrimaryFont ? `--monitor-primary-font:${monitorPrimaryFont};` : ''} ${monitorUnitFont ? `--monitor-unit-font:${monitorUnitFont};` : ''} ${monitorMetricLabelFont ? `--monitor-metric-label-font:${monitorMetricLabelFont};` : ''} ${monitorMetricValueFont ? `--monitor-metric-value-font:${monitorMetricValueFont};` : ''}`}
  >
    {#if monitorStyle === 'system'}
      {#if orderedSystemHosts.length === 0}
        <div class="monitor-empty">{widget.data?.error ?? 'No system monitor nodes configured.'}</div>
      {:else}
        {#each orderedSystemHosts as host}
          <article class="system-host-card">
            {#if !monitorHideHostLabel || !monitorHideUptime}
              <header class="system-host-head" class:only-label={!monitorHideHostLabel && monitorHideUptime} class:only-uptime={monitorHideHostLabel && !monitorHideUptime}>
                {#if !monitorHideHostLabel}
                  <div class="system-host-label">{getSystemHostLabel(host)}</div>
                {/if}
                {#if !monitorHideUptime}
                  <div class={`system-host-uptime ${host.status}`}>Uptime {host.uptimeText || '--'}</div>
                {/if}
              </header>
            {/if}
            <div class={`system-vitals ${monitorDisplay}`}>
              {#each host.metrics as vital}
                {@const parts = toMetricParts(vital)}
                {@const gauge = getGaugeLength(vital)}
                {@const metricPercent = getMetricPercent(vital)}
                {@const valueColor = getMetricValueColor(vital, metricPercent)}
                {@const isCritical = metricPercent >= getMetricCriticalThreshold(vital)}
                {@const metricIcon = getMetricIconName(vital.key)}
                {#if monitorDisplay === 'gauge'}
                  <div class={`system-vital-gauge ${isCritical && monitorCriticalPulse ? 'critical' : ''}`} style={`--system-value-color:${valueColor};`}>
                    <svg viewBox={`0 0 ${monitorRingSize} ${monitorRingSize}`} aria-hidden="true">
                      <circle
                        class="system-gauge-track"
                        cx={monitorRingSize / 2}
                        cy={monitorRingSize / 2}
                        r={gauge.radius}
                        stroke-width={monitorStrokeWidth}
                      ></circle>
                      <circle
                        class="system-gauge-fill"
                        cx={monitorRingSize / 2}
                        cy={monitorRingSize / 2}
                        r={gauge.radius}
                        stroke-width={monitorStrokeWidth}
                        stroke-dasharray={gauge.circumference}
                        stroke-dashoffset={gauge.dashoffset}
                      ></circle>
                    </svg>
                    <div class="system-gauge-center">
                      <div class="system-gauge-value">{parts.renderText}</div>
                      {#if parts.unit}
                        <div class="system-gauge-unit">{parts.unit}</div>
                      {/if}
                    </div>
                    <div class="system-gauge-label">{getMetricDisplayLabel(vital)}</div>
                  </div>
                {:else if monitorDisplay === 'linear'}
                  <div class={`system-vital-linear ${isCritical && monitorCriticalPulse ? 'critical' : ''}`} style={`--system-value-color:${valueColor};`}>
                    <div class="system-vital-linear-label" class:no-icon={!monitorShowMetricIcons}>
                      {#if monitorShowMetricIcons}
                        <span class="system-vital-icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            {#if metricIcon === 'cpu'}
                              <rect x="4" y="4" width="16" height="16" rx="2"></rect>
                              <rect x="9" y="9" width="6" height="6" rx="1"></rect>
                              <path d="M9 2v2"></path>
                              <path d="M15 2v2"></path>
                              <path d="M9 20v2"></path>
                              <path d="M15 20v2"></path>
                              <path d="M2 9h2"></path>
                              <path d="M2 15h2"></path>
                              <path d="M20 9h2"></path>
                              <path d="M20 15h2"></path>
                            {:else if metricIcon === 'memory'}
                              <path d="M6 19v-3"></path>
                              <path d="M10 19v-3"></path>
                              <path d="M14 19v-3"></path>
                              <path d="M18 19v-3"></path>
                              <path d="M8 11V9"></path>
                              <path d="M12 11V9"></path>
                              <path d="M16 11V9"></path>
                              <rect x="2" y="9" width="20" height="8" rx="2"></rect>
                            {:else if metricIcon === 'disk'}
                              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path>
                              <line x1="2" y1="12" x2="22" y2="12"></line>
                              <line x1="6" y1="16" x2="6.01" y2="16"></line>
                              <line x1="10" y1="16" x2="10.01" y2="16"></line>
                            {:else if metricIcon === 'temperature'}
                              <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4 4 0 1 0 5 0z"></path>
                            {:else if metricIcon === 'network'}
                              <circle cx="6" cy="18" r="2"></circle>
                              <circle cx="18" cy="18" r="2"></circle>
                              <circle cx="12" cy="6" r="2"></circle>
                              <path d="M8 17l3-8"></path>
                              <path d="M16 17l-3-8"></path>
                            {:else if metricIcon === 'gauge'}
                              <path d="M12 14 15.5 10.5"></path>
                              <path d="M20.42 15a9 9 0 1 0-16.84 0"></path>
                              <path d="M4 15h16"></path>
                            {:else if metricIcon === 'diskio'}
                              <path d="m16 3 4 4-4 4"></path>
                              <path d="M20 7H4"></path>
                              <path d="m8 21-4-4 4-4"></path>
                              <path d="M4 17h16"></path>
                            {/if}
                          </svg>
                        </span>
                      {/if}
                      <span class="system-vital-label system-vital-linear-label-text">{getMetricDisplayLabel(vital)}</span>
                    </div>
                    <div class="system-vital-linear-track">
                      <div
                        class="system-vital-linear-fill"
                        style={`width:${metricPercent.toFixed(2)}%;`}
                      ></div>
                    </div>
                    <div class="system-vital-linear-value">
                      <span class="system-vital-value system-vital-linear-value-text">{parts.renderText}</span>
                    </div>
                  </div>
                {:else if monitorDisplay === 'header'}
                  <div class={`system-vital-header ${isCritical && monitorCriticalPulse ? 'critical' : ''}`} style={`--system-value-color:${valueColor};`}>
                    <div class="system-vital-header-top">
                      <span class="system-vital-label">{getMetricDisplayLabel(vital)}</span>
                      <span class="system-vital-value-row">
                        <span class="system-vital-value">{parts.renderText}</span>
                      </span>
                    </div>
                    <div class="system-vital-header-track">
                      <div
                        class="system-vital-header-fill"
                        style={`width:${metricPercent.toFixed(2)}%;`}
                      ></div>
                    </div>
                  </div>
                {:else if monitorDisplay === 'spark'}
                  <div class="system-vital-spark" style={`--system-value-color:${valueColor};`}>
                    <div class="system-vital-spark-head">
                      <span class="system-vital-label">{getMetricDisplayLabel(vital)}</span>
                      <span class="system-vital-value-row">
                        <span class="system-vital-value">{parts.renderText}</span>
                      </span>
                    </div>
                    <div class="system-vital-spark-chart">
                      <svg viewBox="0 0 180 34" preserveAspectRatio="none" aria-hidden="true">
                        <polyline
                          class="system-sparkline"
                          points={getSparklinePoints(host.id, vital)}
                        ></polyline>
                      </svg>
                    </div>
                  </div>
                {:else}
                  <div class="system-vital-compact" style={`--system-value-color:${valueColor};`}>
                    <div class="system-vital-label">{getMetricDisplayLabel(vital)}</div>
                    <div class="system-vital-value-row">
                      <span class="system-vital-value">{parts.renderText}</span>
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          </article>
        {/each}
      {/if}
    {:else}
      {#if items.length === 0}
        <div class="monitor-empty">No monitor targets configured.</div>
      {/if}

      {#each items as item, index}
        {@const rowCount = Math.ceil(items.length / effectiveColumns)}
        {@const rowIndex = Math.floor(index / effectiveColumns)}
        {@const isLastRow = rowIndex === rowCount - 1}
        {@const isLastColumn = (index + 1) % effectiveColumns === 0}
        {@const isFirstColumn = index % effectiveColumns === 0}
        {#if item.url}
          <a class={`monitor-item monitor-item-link ${isLastRow ? 'no-bottom' : ''} ${isLastColumn ? 'no-right' : ''} ${!isLastColumn ? 'with-divider' : ''} ${!isFirstColumn ? 'with-left-divider' : ''}`} href={item.url} target="_blank" rel="noreferrer">
            <div class="monitor-item-inner">
              <div class="monitor-icon">
                {#if canShowIcon(item.icon)}
                  <img src={item.icon} alt={item.name} loading="lazy" on:error={() => handleIconError(item.icon)} />
                {:else}
                  <span>{getInitial(item.name)}</span>
                {/if}
              </div>
              <div class="monitor-copy">
                <div class="monitor-title">{item.name}</div>
                {#if showStatusText || showLatency}
                  <div class="monitor-meta">
                    {#if showStatusText}
                      <span class={`monitor-status ${item.status}`}>{item.statusText}</span>
                    {/if}
                    {#if showStatusText && showLatency}
                      <span class="monitor-sep">·</span>
                    {/if}
                    {#if showLatency}
                      <span class="monitor-latency">{item.latencyMs ? `${item.latencyMs}ms` : '--'}</span>
                    {/if}
                  </div>
                {/if}
              </div>
              {#if showStatusDot}
                <div class="monitor-state">
                  <span class={`monitor-dot ${item.status}`} title={item.statusText}></span>
                </div>
              {/if}
            </div>
          </a>
        {:else}
          <article class={`monitor-item ${isLastRow ? 'no-bottom' : ''} ${isLastColumn ? 'no-right' : ''} ${!isLastColumn ? 'with-divider' : ''} ${!isFirstColumn ? 'with-left-divider' : ''}`}>
            <div class="monitor-item-inner">
              <div class="monitor-icon">
                {#if canShowIcon(item.icon)}
                  <img src={item.icon} alt={item.name} loading="lazy" on:error={() => handleIconError(item.icon)} />
                {:else}
                  <span>{getInitial(item.name)}</span>
                {/if}
              </div>
              <div class="monitor-copy">
                <div class="monitor-title">{item.name}</div>
                {#if showStatusText || showLatency}
                  <div class="monitor-meta">
                    {#if showStatusText}
                      <span class={`monitor-status ${item.status}`}>{item.statusText}</span>
                    {/if}
                    {#if showStatusText && showLatency}
                      <span class="monitor-sep">·</span>
                    {/if}
                    {#if showLatency}
                      <span class="monitor-latency">{item.latencyMs ? `${item.latencyMs}ms` : '--'}</span>
                    {/if}
                  </div>
                {/if}
              </div>
              {#if showStatusDot}
                <div class="monitor-state">
                  <span class={`monitor-dot ${item.status}`} title={item.statusText}></span>
                </div>
              {/if}
            </div>
          </article>
        {/if}
      {/each}
    {/if}
  </div>
{/if}

<style>
  .monitor-grid {
    display: grid;
    grid-template-columns: repeat(var(--monitor-columns, 3), minmax(0, 1fr));
    grid-template-rows: repeat(var(--monitor-rows, 1), minmax(0, 1fr));
    gap: 0;
    height: 100%;
    min-height: 0;
  }

  .monitor-grid.system {
    --monitor-system-scale: calc(var(--monitor-scale, 1) * var(--ui-scale, 1));
    gap: clamp(8px, calc(10px * var(--monitor-system-scale, 1)), 14px);
  }

  .monitor-grid.system.auto-height {
    height: auto;
    grid-template-rows: repeat(var(--monitor-rows, 1), auto);
  }

  .system-host-card {
    border: 0;
    border-radius: 0;
    padding: clamp(8px, calc(10px * var(--monitor-system-scale, 1)), 14px);
    background: transparent;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: clamp(10px, calc(10px * var(--monitor-system-scale, 1)), 14px);
  }

  .monitor-grid.system.has-multiple {
    gap: 0;
  }

  .monitor-grid.system.has-multiple .system-host-card:not(:first-child) {
    border-top: 1px solid rgba(255, 255, 255, 0.12);
  }

  .monitor-grid.system.has-multiple.two-col .system-host-card {
    border-top: 0;
  }

  .monitor-grid.system.has-multiple.two-col .system-host-card:nth-child(even) {
    border-left: 1px solid rgba(255, 255, 255, 0.12);
    padding-left: clamp(18px, calc(24px * var(--monitor-system-scale, 1)), 34px);
  }

  .monitor-grid.system.has-multiple.two-col .system-host-card:nth-child(odd) {
    padding-right: clamp(18px, calc(24px * var(--monitor-system-scale, 1)), 34px);
  }

  .monitor-grid.system.has-multiple.two-col.linear-style .system-host-card:nth-child(even) {
    border-left: 0;
    padding-left: clamp(18px, calc(24px * var(--monitor-system-scale, 1)), 34px);
  }

  .monitor-grid.system.has-multiple.two-col.linear-style .system-host-card:nth-child(odd) {
    padding-right: clamp(18px, calc(24px * var(--monitor-system-scale, 1)), 34px);
  }

  .monitor-grid.system.has-multiple.two-col.linear-style {
    column-gap: calc(var(--monitor-linear-node-gap, 0px) * var(--monitor-system-scale, 1));
  }

  .monitor-grid.system.has-multiple.linear-style {
    --monitor-linear-node-offset: calc(
      var(--monitor-linear-node-gap, 0px) * var(--monitor-system-scale, 1)
    );
  }

  .monitor-grid.system.has-multiple.two-col.linear-style .system-host-card:nth-child(odd) {
    transform: translateX(calc(var(--monitor-linear-node-offset, 0px) * -0.5));
  }

  .monitor-grid.system.has-multiple.two-col.linear-style .system-host-card:nth-child(even) {
    transform: translateX(calc(var(--monitor-linear-node-offset, 0px) * 0.5));
  }

  .monitor-grid.system.has-multiple.linear-style:not(.two-col) .system-host-card:nth-child(odd) {
    transform: translateY(calc(var(--monitor-linear-node-offset, 0px) * -0.5));
  }

  .monitor-grid.system.has-multiple.linear-style:not(.two-col) .system-host-card:nth-child(even) {
    transform: translateY(calc(var(--monitor-linear-node-offset, 0px) * 0.5));
  }

  .monitor-grid.system.has-multiple.two-col .system-host-card:nth-child(n + 3) {
    border-top: 1px solid rgba(255, 255, 255, 0.12);
  }

  .system-host-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    transform: translateY(calc(var(--monitor-head-offset-y, 0px) * var(--monitor-system-scale, 1)));
  }

  .system-host-head.only-label {
    justify-content: flex-start;
  }

  .system-host-head.only-uptime {
    justify-content: flex-end;
  }

  .system-host-label {
    font-size: calc(var(--monitor-name-size, 16px) * var(--monitor-system-scale, 1));
    color: var(--monitor-name-color, #eef4ff);
    font-weight: var(--monitor-name-weight, 600);
    font-family: var(--monitor-name-font, var(--font-heading));
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .system-host-uptime {
    font-size: calc(var(--monitor-status-size, 13px) * var(--monitor-system-scale, 1));
    color: var(--monitor-status-color, #b6cadf);
    font-weight: var(--monitor-status-weight, 600);
    font-family: var(--monitor-status-font, var(--font-body));
    white-space: nowrap;
  }

  .system-host-uptime.down {
    color: #ff6b6b;
  }

  .system-vitals {
    display: grid;
    gap: clamp(8px, calc(8px * var(--monitor-system-scale, 1)), 12px);
    --monitor-vitals-base-offset: 0px;
    transform: translateY(
      calc(
        (var(--monitor-vitals-offset-y, 0px) + var(--monitor-vitals-base-offset, 0px)) *
          var(--monitor-system-scale, 1)
      )
    );
  }

  .system-vitals.gauge {
    --monitor-vitals-base-offset: -30px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    --monitor-gauge-gap: calc(var(--monitor-gauge-column-gap, 10px) * var(--monitor-system-scale, 1));
    --monitor-gauge-overlap: max(0px, calc(-1 * var(--monitor-gauge-gap)));
    column-gap: max(0px, var(--monitor-gauge-gap));
  }

  .system-vitals.gauge > .system-vital-gauge:nth-child(odd) {
    transform: translateX(calc(var(--monitor-gauge-overlap, 0px) / 2));
  }

  .system-vitals.gauge > .system-vital-gauge:nth-child(even) {
    transform: translateX(calc(var(--monitor-gauge-overlap, 0px) / -2));
  }

  .system-vitals.compact {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .system-vitals.linear {
    --monitor-vitals-base-offset: -8px;
    grid-template-columns: 1fr;
    gap: clamp(7px, calc(7px * var(--monitor-system-scale, 1)), 10px);
  }

  .system-vitals.header {
    --monitor-vitals-base-offset: -18px;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: clamp(8px, calc(10px * var(--monitor-system-scale, 1)), 14px);
    align-items: start;
  }

  .system-vitals.spark {
    --monitor-vitals-base-offset: -10px;
    grid-template-columns: 1fr;
    gap: clamp(8px, calc(9px * var(--monitor-system-scale, 1)), 12px);
  }

  .system-vital-gauge {
    position: relative;
    display: grid;
    justify-items: center;
    align-items: center;
    gap: 6px;
  }

  .system-vital-gauge svg {
    width: calc(var(--monitor-ring-size, 112px) * var(--monitor-system-scale, 1));
    height: calc(var(--monitor-ring-size, 112px) * var(--monitor-system-scale, 1));
    transform: rotate(-90deg);
    overflow: visible;
  }

  .system-gauge-track,
  .system-gauge-fill {
    fill: none;
    transform-origin: center;
  }

  .system-gauge-track {
    stroke: var(--monitor-gauge-track-color, #2a3440);
  }

  .system-gauge-fill {
    stroke: var(--system-value-color, var(--monitor-primary-color, #eef4ff));
    transition: stroke-dashoffset 180ms ease, stroke 180ms ease;
    stroke-linecap: round;
  }

  .system-gauge-center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .system-gauge-value,
  .system-vital-value {
    color: var(--system-value-color, var(--monitor-metric-value-color, #eef4ff));
    font-size: calc(var(--monitor-metric-value-size, 28px) * var(--monitor-system-scale, 1));
    font-family: var(--monitor-metric-value-font, var(--monitor-primary-font, var(--font-heading)));
    font-weight: var(--monitor-metric-value-weight, 700);
    line-height: 1;
  }

  .system-gauge-unit,
  .system-vital-unit {
    color: var(--monitor-unit-color, #9aa8ba);
    font-size: calc(var(--monitor-unit-size, 13px) * var(--monitor-system-scale, 1));
    font-family: var(--monitor-unit-font, var(--font-body));
    font-weight: var(--monitor-unit-weight, 600);
    line-height: 1;
  }

  .system-gauge-label,
  .system-vital-label {
    color: var(--monitor-metric-label-color, #9aa8ba);
    font-size: calc(var(--monitor-metric-label-size, 13px) * var(--monitor-system-scale, 1));
    font-family: var(--monitor-metric-label-font, var(--monitor-latency-font, var(--font-body)));
    font-weight: var(--monitor-metric-label-weight, 600);
  }

  .system-vital-compact {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: clamp(8px, calc(9px * var(--monitor-system-scale, 1)), 12px);
    background: rgba(255, 255, 255, 0.02);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .system-vital-linear {
    display: flex;
    align-items: center;
    gap: clamp(2px, calc(4px * var(--monitor-system-scale, 1)), 6px);
    min-width: 0;
  }

  .monitor-grid.system.linear-style .system-host-card,
  .monitor-grid.system.linear-style .system-vital-linear {
    transition:
      transform 560ms cubic-bezier(0.2, 1.4, 0.35, 1),
      opacity 260ms ease;
    will-change: transform;
  }

  .system-vital-linear-label {
    width: calc(112px * var(--monitor-system-scale, 1));
    flex: 0 0 calc(112px * var(--monitor-system-scale, 1));
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .system-vital-linear-label.no-icon {
    gap: 0;
  }

  .system-vital-linear-label-text {
    display: inline-block;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .system-vital-icon {
    width: calc(17px * var(--monitor-system-scale, 1));
    height: calc(17px * var(--monitor-system-scale, 1));
    border-radius: 999px;
    border: 1px solid var(--monitor-linear-icon-border-color, #54657a);
    background: var(--monitor-linear-icon-bg-color, #182332);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: calc(10px * var(--monitor-system-scale, 1));
    font-weight: 700;
    color: var(--monitor-unit-color, #9aa8ba);
    font-family: var(--monitor-unit-font, var(--font-body));
    flex: 0 0 auto;
    overflow: hidden;
  }

  .system-vital-icon svg {
    width: calc(12px * var(--monitor-system-scale, 1));
    height: calc(12px * var(--monitor-system-scale, 1));
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    display: block;
  }

  .system-vital-linear-track,
  .system-vital-header-track {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: 999px;
    background: var(--monitor-linear-track-color, #243041);
  }

  .system-vital-linear-track {
    flex: 1 1 auto;
    min-width: 0;
    height: clamp(
      4px,
      calc(var(--monitor-linear-bar-height, 12px) * var(--monitor-system-scale, 1)),
      40px
    );
    width: 100%;
  }

  .system-vital-linear-fill,
  .system-vital-header-fill {
    height: 100%;
    border-radius: inherit;
    position: relative;
  }

  .system-vital-linear-fill {
    background: linear-gradient(
      90deg,
      var(--monitor-linear-fill-start-color, #43b9ff) 0%,
      var(--monitor-linear-fill-mid-color, #7d75ff) 55%,
      var(--monitor-linear-fill-end-color, #ff6778) 100%
    );
    transition:
      width 640ms cubic-bezier(0.2, 1.35, 0.35, 1),
      filter 220ms ease,
      box-shadow 220ms ease;
    will-change: width;
  }

  .system-vital-header-fill {
    background: var(--system-value-color, var(--monitor-primary-color, #eef4ff));
  }

  .system-vital-linear-fill::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      90deg,
      var(--monitor-linear-stripe-color, #ffffff) 0,
      var(--monitor-linear-stripe-color, #ffffff) 1px,
      transparent 1px,
      transparent 10px
    );
    mix-blend-mode: screen;
    opacity: 0.24;
  }

  .system-vital-linear.critical .system-vital-linear-fill,
  .system-vital-header.critical .system-vital-header-fill,
  .system-vital-gauge.critical .system-gauge-fill {
    animation: monitor-critical-neon 1.25s ease-in-out infinite;
    box-shadow: 0 0 10px rgba(255, 39, 56, 0.8), 0 0 20px rgba(255, 39, 56, 0.45);
    filter: saturate(1.25);
  }

  .system-vital-gauge.critical .system-gauge-fill {
    stroke: #ff2738;
  }

  @keyframes monitor-critical-neon {
    0% {
      opacity: 0.78;
      filter: brightness(0.95) saturate(1.1);
    }
    50% {
      opacity: 1;
      filter: brightness(1.28) saturate(1.35);
    }
    100% {
      opacity: 0.78;
      filter: brightness(0.95) saturate(1.1);
    }
  }

  .system-vital-linear-value {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    justify-content: flex-end;
    width: calc(var(--monitor-linear-value-width, 48px) * var(--monitor-system-scale, 1));
    flex: 0 0 calc(var(--monitor-linear-value-width, 48px) * var(--monitor-system-scale, 1));
    text-align: right;
    white-space: nowrap;
    min-width: 0;
  }

  .system-vital-linear-value-text {
    width: 100%;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .system-vital-header {
    min-width: 0;
    display: grid;
    gap: clamp(5px, calc(6px * var(--monitor-system-scale, 1)), 8px);
  }

  .system-vital-header-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  .system-vital-header-track {
    height: clamp(3px, calc(4px * var(--monitor-system-scale, 1)), 5px);
  }

  .system-vital-spark {
    display: grid;
    gap: clamp(4px, calc(5px * var(--monitor-system-scale, 1)), 8px);
  }

  .system-vital-spark-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .system-vital-spark-chart {
    position: relative;
    height: clamp(28px, calc(34px * var(--monitor-system-scale, 1)), 40px);
    border-radius: 6px;
    overflow: hidden;
    mask-image: linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 1) 14%, rgba(0, 0, 0, 1) 100%);
    -webkit-mask-image: linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 1) 14%, rgba(0, 0, 0, 1) 100%);
  }

  .system-vital-spark-chart svg {
    width: 100%;
    height: 100%;
  }

  .system-sparkline {
    fill: none;
    stroke: var(--system-value-color, var(--monitor-primary-color, #eef4ff));
    stroke-width: clamp(1.4px, calc(1.8px * var(--monitor-system-scale, 1)), 2.4px);
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .system-vital-value-row {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
  }

  .monitor-item {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(60px, calc(8px * var(--monitor-scale, 1)), 12px);
    min-width: 0;
    --monitor-pad-y: clamp(6px, calc(10px * var(--monitor-scale, 1)), 14px);
    --monitor-pad-x: clamp(20px, calc(12px * var(--monitor-scale, 1)), 16px);
    --monitor-divider-gap: clamp(12px, calc(14px * var(--monitor-scale, 1)), 20px);
    padding: var(--monitor-pad-y) var(--monitor-pad-x);
    min-height: 0;
    height: 100%;
    background: transparent;
    border-bottom: 1px solid var(--monitor-divider-color, rgba(255, 255, 255, 0.08));
  }

  .monitor-item::after {
    content: '';
    position: absolute;
    top: var(--monitor-pad-y);
    bottom: var(--monitor-pad-y);
    right: calc(var(--monitor-pad-x) - 20px);
    width: 1px;
    background: var(--monitor-divider-color, rgba(255, 255, 255, 0.08));
  }

  .monitor-item-inner {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: clamp(6px, calc(8px * var(--monitor-scale, 1)), 12px);
    padding-left: 0;
  }

  .monitor-item.with-left-divider .monitor-item-inner {
    padding-left: var(--monitor-divider-gap);
  }

  .monitor-item.no-right {
    border-right: 0;
  }

  .monitor-item.no-right::after {
    display: none;
  }

  .monitor-item.no-bottom {
    border-bottom: 0;
  }

  .monitor-item-link {
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }

  .monitor-item-link:hover .monitor-title {
    text-decoration: underline;
  }

  .monitor-icon {
    width: calc(var(--monitor-icon-size, 38px) * var(--monitor-scale, 1));
    height: calc(var(--monitor-icon-size, 38px) * var(--monitor-scale, 1));
    border-radius: calc(12px * var(--monitor-scale, 1));
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex: 0 0 auto;
    transform: translate(var(--monitor-offset-x, 0px), var(--monitor-offset-y, 0px));
  }

  .monitor-icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .monitor-icon span {
    color: var(--text);
    font-size: calc(0.92rem * var(--monitor-scale, 1));
    font-weight: 700;
  }

  .monitor-copy {
    min-width: 0;
    flex: 1 1 auto;
    transform: translate(var(--monitor-offset-x, 0px), var(--monitor-offset-y, 0px));
  }

  .monitor-title {
    font-size: calc(var(--monitor-name-size, 16px) * var(--monitor-text-scale, 1));
    color: var(--monitor-name-color, var(--text));
    font-weight: var(--monitor-name-weight, 600);
    font-family: var(--monitor-name-font, var(--font-heading));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }

  .monitor-meta {
    margin-top: clamp(2px, calc(3px * var(--monitor-scale, 1)), 5px);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }

  .monitor-status {
    color: var(--monitor-status-color, #b6cadf);
    font-weight: var(--monitor-status-weight, 600);
    font-family: var(--monitor-status-font, var(--font-body));
    font-size: calc(var(--monitor-status-size, 13px) * var(--monitor-text-scale, 1));
  }

  .monitor-latency {
    color: var(--monitor-latency-color, var(--muted));
    font-family: var(--monitor-latency-font, var(--font-body));
    font-size: calc(var(--monitor-latency-size, 13px) * var(--monitor-text-scale, 1));
    font-weight: var(--monitor-latency-weight, 600);
  }

  .monitor-sep {
    color: rgba(157, 186, 208, 0.6);
  }

  .monitor-state {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-right: 0;
    transform: translate(var(--monitor-offset-x, 0px), var(--monitor-offset-y, 0px));
  }

  .monitor-item.with-divider .monitor-state {
    margin-right: var(--monitor-divider-gap);
    transform: translate(var(--monitor-offset-x, 0px), var(--monitor-offset-y, 0px));
  }

  .monitor-dot {
    width: calc(10px * var(--monitor-scale, 1));
    height: calc(10px * var(--monitor-scale, 1));
    border-radius: 999px;
    background: rgba(160, 180, 196, 0.35);
    border: 1px solid rgba(160, 180, 196, 0.55);
    flex: 0 0 auto;
    box-shadow: 0 0 8px rgba(160, 180, 196, 0.2);
  }

  .monitor-dot.ok {
    background: var(--success);
    border-color: transparent;
    box-shadow: 0 0 8px rgba(126, 231, 135, 0.45);
  }

  .monitor-dot.warn {
    background: #ffd479;
    border-color: transparent;
    box-shadow: 0 0 8px rgba(255, 212, 121, 0.45);
  }

  .monitor-dot.down {
    background: var(--danger);
    border-color: transparent;
    box-shadow: 0 0 8px rgba(255, 107, 107, 0.45);
  }

  .monitor-dot.unknown {
    background: rgba(160, 180, 196, 0.35);
    border-color: rgba(160, 180, 196, 0.55);
  }

  .monitor-empty {
    grid-column: 1 / -1;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px dashed var(--card-border);
    color: var(--muted);
    font-size: 0.82rem;
  }

  .error-text {
    color: var(--danger);
    font-size: 0.9rem;
  }
</style>
