<script lang="ts">
  import type { WidgetInstance } from '$widgets/types';
  import { getSourceIconUrl, getSourceSubtitle } from '$lib/shared/dashboardIcons';

type StatPayload = {
  metrics?: Array<{
    key?: string;
    value: number | string;
    label: string;
    unit?: string;
  }>;
  value: number | string;
  unit?: string;
  label?: string;
  trend?: number | string;
  error?: string;
  };

  export let widget: WidgetInstance<StatPayload>;

  let data: StatPayload = { value: 0, unit: '' };
  let iconErrored = false;
  let iconUrl = '';
  let subtitle = '';
  let hideTitle = false;
  let hideTitleIcon = false;
  let titleIconUrl = '';
  let metrics: Array<{ key?: string; value: number | string; label: string; unit?: string }> = [];
  let columnClass = 'cols-1';
  let showMetricBoxes = true;
  let metricBoxWidth = 0;
  let metricBoxHeight = 52;
  let metricBoxBorder = true;
  let metricBoxBackgroundColor = '#0a1018';
  let metricBoxBorderColor = '#ffffff';
  let metricBoxBorderStyle: 'solid' | 'dashed' | 'glow' = 'solid';
  let metricFont = '';
  let metricFontWeight = 600;
  let metricFontSize = 14;
  let metricFontColor = '#eef4ff';
  let metricLabelFont = '';
  let metricLabelFontWeight = 600;
  let metricLabelFontSize = 12;
  let metricLabelFontColor = '#eef4ff';
  let metricLabelOverrides: Record<string, string> = {};
  const metricLabelByKey: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    available: 'Available',
    processing: 'Processing',
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
    failedSyncTasks24h: 'Failed Sync (24h)',
    lastSyncStatus: 'Last Sync Status',
    commitsBehindAhead: 'Commits (Behind/Ahead)',
    customFormats: 'Custom Formats',
    ping: 'Ping',
    passed: 'Passed',
    failed: 'Failed',
    unknown: 'Unknown',
    streams: 'Streams',
    albums: 'Albums',
    tv: 'TV'
  };
  $: data = widget.data ?? { value: 0, unit: '' };
  $: iconUrl = getSourceIconUrl(widget.source) ?? '';
  $: subtitle = getSourceSubtitle(widget.source);
  $: hideTitle = widget.options?.hideTitle === true;
  $: hideTitleIcon = widget.options?.hideTitleIcon === true;
  $: titleIconUrl =
    typeof widget.options?.titleIconUrl === 'string' && widget.options.titleIconUrl.trim()
      ? widget.options.titleIconUrl.trim()
      : '';
  $: showMetricBoxes = widget.options?.metricBoxes !== false;
  $: metricBoxWidth = Math.min(600, Math.max(0, Number(widget.options?.metricBoxWidth ?? 0)));
  $: metricBoxHeight = Math.min(220, Math.max(24, Number(widget.options?.metricBoxHeight ?? 52)));
  $: metricBoxBorder = widget.options?.metricBoxBorder !== false;
  $: metricBoxBackgroundColor =
    typeof widget.options?.metricBoxBackgroundColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.metricBoxBackgroundColor)
      ? widget.options.metricBoxBackgroundColor
      : '#0a1018';
  $: metricBoxBorderColor =
    typeof widget.options?.metricBoxBorderColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.metricBoxBorderColor)
      ? widget.options.metricBoxBorderColor
      : '#ffffff';
  $: metricBoxBorderStyle =
    widget.options?.metricBoxBorderStyle === 'dashed' || widget.options?.metricBoxBorderStyle === 'glow'
      ? widget.options.metricBoxBorderStyle
      : 'solid';
  $: metricFont = typeof widget.options?.metricFont === 'string' ? widget.options.metricFont.trim() : '';
  $: metricFontWeight = Math.min(900, Math.max(300, Number(widget.options?.metricFontWeight ?? 600)));
  $: metricFontSize = Math.min(48, Math.max(8, Number(widget.options?.metricFontSize ?? 14)));
  $: metricFontColor =
    typeof widget.options?.metricFontColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.metricFontColor)
      ? widget.options.metricFontColor
      : '#eef4ff';
  $: metricLabelFont =
    typeof widget.options?.metricLabelFont === 'string' ? widget.options.metricLabelFont.trim() : '';
  $: metricLabelFontWeight = Math.min(
    900,
    Math.max(300, Number(widget.options?.metricLabelFontWeight ?? 600))
  );
  $: metricLabelFontSize = Math.min(
    48,
    Math.max(8, Number(widget.options?.metricLabelFontSize ?? 12))
  );
  $: metricLabelFontColor =
    typeof widget.options?.metricLabelFontColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.metricLabelFontColor)
      ? widget.options.metricLabelFontColor
      : '#eef4ff';
  $: metricLabelOverrides =
    widget.options?.metricLabelOverrides &&
    typeof widget.options.metricLabelOverrides === 'object' &&
    !Array.isArray(widget.options.metricLabelOverrides)
      ? Object.fromEntries(
          Object.entries(widget.options.metricLabelOverrides as Record<string, unknown>)
            .filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
            .map(([key, value]) => [key, String(value).trim()])
        )
      : {};
  $: {
    const rawMetrics = Array.isArray(data.metrics) ? data.metrics : [];
    const selectedKeys = Array.isArray(widget.options?.metrics)
      ? widget.options.metrics.filter((item): item is string => typeof item === 'string')
      : [];
    if (rawMetrics.length > 0 && selectedKeys.length > 0) {
      const byKey = new Map(
        rawMetrics
          .filter((metric) => typeof metric.key === 'string' && metric.key)
          .map((metric) => [String(metric.key), metric])
      );
      const selectedMetrics = selectedKeys.map((key) => {
        const existing = byKey.get(key);
        const overrideLabel = metricLabelOverrides[key];
        if (existing) {
          return {
            ...existing,
            label: overrideLabel || existing.label
          };
        }
        return {
          key,
          value: 0,
          label: overrideLabel || metricLabelByKey[key] || key
        };
      });
      metrics = selectedMetrics;
    } else {
      metrics = rawMetrics.map((metric) => {
        const key = typeof metric.key === 'string' ? metric.key : '';
        return key && metricLabelOverrides[key]
          ? { ...metric, label: metricLabelOverrides[key] }
          : metric;
      });
    }
  }
  $: columnClass = `cols-${Math.min(Math.max(metrics.length || (data.trend === undefined ? 1 : 2), 1), 4)}`;
  $: if (!iconUrl) {
    iconErrored = false;
  }

  const formatValue = (value: number | string, unit?: string) => {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value !== 'number' || Number.isNaN(value)) return `0${unit ?? ''}`;
    const rendered = Number.isInteger(value)
      ? value.toLocaleString()
      : value.toFixed(2).replace(/\.00$/, '');
    return `${rendered}${unit ?? ''}`;
  };

  const iconFallback = () => {
    const title = widget.title?.trim();
    if (title) return title[0]!.toUpperCase();
    return '?';
  };
</script>

{#if data.error}
  <p class="error-text">{data.error}</p>
{:else}
  <div
    class="stat-shell"
    style={`--metric-box-width:${metricBoxWidth > 0 ? `${metricBoxWidth}px` : '100%'};--metric-box-height:${metricBoxHeight}px;--metric-box-bg:${metricBoxBackgroundColor};--metric-box-border-color:${metricBoxBorderColor};--metric-box-border-style:${metricBoxBorderStyle === 'dashed' ? 'dashed' : 'solid'};--metric-box-glow:${metricBoxBorder && metricBoxBorderStyle === 'glow' ? `0 0 10px color-mix(in srgb, ${metricBoxBorderColor} 50%, transparent)` : 'none'};--metric-box-border:${metricBoxBorder ? '1px' : '0px'};--metric-font-size:${metricFontSize}px;--metric-font-weight:${metricFontWeight};--metric-font-color:${metricFontColor};--metric-label-font-size:${metricLabelFontSize}px;--metric-label-font-weight:${metricLabelFontWeight};--metric-label-font-color:${metricLabelFontColor};${metricFont ? `--metric-font:${metricFont};` : ''}${metricLabelFont ? `--metric-label-font:${metricLabelFont};` : ''}`}
  >
    {#if !hideTitle}
      <div class="service-head">
        {#if !hideTitleIcon}
          <div class="service-icon">
            {#if (titleIconUrl || iconUrl) && !iconErrored}
              <img
                src={titleIconUrl || iconUrl}
                alt={widget.title}
                loading="lazy"
                on:error={() => (iconErrored = true)}
              />
            {:else}
              <span>{iconFallback()}</span>
            {/if}
          </div>
        {/if}
        <div class="service-copy">
          <div class="service-title">{widget.title}</div>
          {#if subtitle}
            <div class="service-subtitle">{subtitle}</div>
          {/if}
        </div>
      </div>
    {/if}

    {#if metrics.length > 0}
      <div class={`metric-row ${columnClass} ${showMetricBoxes ? 'boxed' : 'plain'}`}>
        {#each metrics as metric}
          <div class={`metric-box ${showMetricBoxes ? 'is-boxed' : 'is-plain'}`}>
            <div class="metric-value">{formatValue(metric.value, metric.unit)}</div>
            <div class="metric-label">{metric.label}</div>
          </div>
        {/each}
      </div>
    {:else}
      <div class={`metric-row ${columnClass} ${showMetricBoxes ? 'boxed' : 'plain'}`}>
        <div class={`metric-box ${showMetricBoxes ? 'is-boxed' : 'is-plain'}`}>
          <div class="metric-value">{formatValue(data.value, data.unit)}</div>
          <div class="metric-label">{data.label ?? 'Current'}</div>
        </div>
        {#if data.trend !== undefined}
          <div class={`metric-box ${showMetricBoxes ? 'is-boxed' : 'is-plain'}`}>
            <div class="metric-value">{formatValue(data.trend, '%')}</div>
            <div class="metric-label">Trend</div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .stat-shell {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    gap: 12px;
    container-type: inline-size;
  }

  .service-head {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 46px;
  }

  .service-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.03);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex: 0 0 auto;
  }

  .service-icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .service-icon span {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text);
  }

  .service-copy {
    min-width: 0;
  }

  .service-title {
    font-family: var(--card-title-font-family, var(--font-heading));
    font-size: calc(var(--card-title-size, 17.6px) * var(--ui-scale, 1));
    font-weight: var(--card-title-font-weight, 600);
    color: var(--card-title-color, var(--text));
    line-height: 1.05;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .service-subtitle {
    font-size: 0.72rem;
    color: var(--muted);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .metric-row {
    display: grid;
    gap: 8px;
    width: 100%;
    margin-top: auto;
    align-items: stretch;
  }

  .metric-row.cols-1 {
    grid-template-columns: 1fr;
  }

  .metric-row.cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metric-row.cols-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .metric-row.cols-4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .metric-box.is-boxed {
    border-radius: 12px;
    border-width: var(--metric-box-border, 1px);
    border-style: var(--metric-box-border-style, solid);
    border-color: color-mix(in srgb, var(--metric-box-border-color, #ffffff) 14%, transparent);
    box-shadow: var(--metric-box-glow, none);
    background: color-mix(in srgb, var(--metric-box-bg, #0a1018) 55%, transparent);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    min-height: var(--metric-box-height, 52px);
    width: var(--metric-box-width, 100%);
    max-width: 100%;
    justify-self: center;
    padding: 6px 5px;
    overflow: hidden;
    container-type: inline-size;
  }

  .metric-box.is-plain {
    border: none;
    background: transparent;
    min-height: 38px;
    padding: 2px 2px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    overflow: hidden;
    container-type: inline-size;
  }

  .metric-value {
    font-size: clamp(
      0.56rem,
      min(var(--metric-font-size, 0.96rem), 17cqi),
      var(--metric-font-size, 0.96rem)
    );
    color: var(--metric-font-color, var(--text));
    font-family: var(--metric-font, var(--font-heading));
    font-weight: var(--metric-font-weight, 600);
    line-height: 1.1;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .metric-label {
    margin-top: 2px;
    font-size: clamp(
      0.44rem,
      min(var(--metric-label-font-size, calc(var(--metric-font-size, 0.96rem) * 0.56)), 11cqi),
      var(--metric-label-font-size, calc(var(--metric-font-size, 0.96rem) * 0.56))
    );
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--metric-label-font-color, var(--metric-font-color, var(--muted)));
    font-family: var(--metric-label-font, var(--metric-font, var(--font-body)));
    font-weight: var(--metric-label-font-weight, 600);
    opacity: 0.88;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-text {
    color: var(--danger);
    font-size: 0.9rem;
  }
</style>
