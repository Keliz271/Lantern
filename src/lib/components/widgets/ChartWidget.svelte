<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { WidgetInstance } from '$widgets/types';

type ChartPayload = {
  labels: string[];
  total: number[];
  blocked: number[];
  metrics?: Array<{
    key?: string;
    value: number | string;
    label: string;
    unit?: string;
  }>;
  summary?: {
    totalQueries: number;
    blockedPct: number;
    latency: number;
    failures?: number;
    cachedAvgLatency?: number;
    cached?: number;
    recursive?: number;
    authoritative?: number;
  };
  error?: string;
};

  export let widget: WidgetInstance<ChartPayload>;
  let data: ChartPayload = { labels: [], total: [], blocked: [] };
  let max = 1;
  let orientation = 'vertical';
  let labels: string[] = [];
  let totals: number[] = [];
  let blocked: number[] = [];
  const defaultBar =
    'linear-gradient(180deg, rgba(106, 168, 255, 0.95), rgba(45, 93, 165, 0.92))';
  const defaultBlocked = 'linear-gradient(180deg, #ff7b7b, #ff4f4f)';
  let stacked = true;
  let barColor = defaultBar;
  let blockedColor = defaultBlocked;
  let barStyle: 'classic' | 'pill-liquid' | 'squircle' = 'classic';
  let barWidth = 18;
  let barGap = 8;
  let barBorder = 1;
  let barBorderColor = '#d2e4f6';
  let barHeightScale = 1;
  let cornerSmoothing = 1;
  let rootEl: HTMLDivElement | null = null;
  let summaryEl: HTMLDivElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let frameId = 0;
  let chartHeight = 166;
  let barScale = 120;
  let summaryMetrics: Array<{ key?: string; value: number | string; label: string; unit?: string }> = [];
  let showMetricBoxes = true;
  let metricBoxWidth = 0;
  let metricBoxHeight = 52;
  let metricBoxBorder = true;
  let metricBoxBackgroundColor = '#0a1018';
  let metricBoxBorderColor = '#6aa8ff';
  let metricFont = '';
  let metricFontSize = 14;
  let metricFontColor = '#eef4ff';
  let metricLabelFont = '';
  let metricLabelFontSize = 12;
  let metricLabelFontColor = '#eef4ff';
  let dnsAxisFont = '';
  let dnsAxisWeight = 600;
  let dnsAxisSize = 11;
  let dnsAxisColor = '#9fb4ca';
  let dnsLegendFont = '';
  let dnsLegendWeight = 600;
  let dnsLegendSize = 12;
  let dnsLegendColor = '#cadbec';
  const metricLabelByKey: Record<string, string> = {
    totalQueries: 'Queries',
    blockedPct: 'Blocked',
    latency: 'Latency',
    failures: 'Failure',
    cachedAvgLatency: 'Cached Avg. Latency',
    cached: 'Cached',
    recursive: 'Recursive',
    authoritative: 'Authoritative'
  };

  $: data = widget.data ?? { labels: [], total: [], blocked: [] };
  $: labels = Array.isArray(data.labels) ? data.labels : [];
  $: totals = Array.isArray(data.total) ? data.total : [];
  $: blocked = Array.isArray(data.blocked) ? data.blocked : [];
  $: max = Math.max(...totals, 1);
  $: orientation = typeof widget.options?.orientation === 'string' ? widget.options.orientation : 'vertical';
  $: stacked = widget.options?.stacked !== false;
  $: barColor =
    typeof widget.options?.barColor === 'string' && widget.options.barColor
      ? widget.options.barColor
      : defaultBar;
  $: blockedColor =
    typeof widget.options?.blockedColor === 'string' && widget.options.blockedColor
      ? widget.options.blockedColor
      : defaultBlocked;
  $: barStyle =
    widget.options?.barStyle === 'pill-liquid' || widget.options?.barStyle === 'squircle'
      ? widget.options.barStyle
      : 'classic';
  $: barWidth = Math.min(48, Math.max(8, Number(widget.options?.barWidth ?? 18)));
  $: barGap = Math.min(24, Math.max(2, Number(widget.options?.barGap ?? 8)));
  $: barBorder = Math.min(8, Math.max(0, Number(widget.options?.barBorder ?? widget.options?.barGlow ?? 1)));
  $: barBorderColor =
    typeof widget.options?.barBorderColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.barBorderColor)
      ? widget.options.barBorderColor
      : '#d2e4f6';
  $: barHeightScale = Math.min(1.8, Math.max(0.4, Number(widget.options?.barHeightScale ?? 1)));
  $: cornerSmoothing = Math.min(1, Math.max(0, Number(widget.options?.cornerSmoothing ?? 100) / 100));
  $: barScale = orientation === 'horizontal' ? 220 : Math.max(32, chartHeight - 34);
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
      : '#6aa8ff';
  $: metricFont = typeof widget.options?.metricFont === 'string' ? widget.options.metricFont.trim() : '';
  $: metricFontSize = Math.min(48, Math.max(8, Number(widget.options?.metricFontSize ?? 14)));
  $: metricFontColor =
    typeof widget.options?.metricFontColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.metricFontColor)
      ? widget.options.metricFontColor
      : '#eef4ff';
  $: metricLabelFont =
    typeof widget.options?.metricLabelFont === 'string' ? widget.options.metricLabelFont.trim() : '';
  $: metricLabelFontSize = Math.min(
    48,
    Math.max(8, Number(widget.options?.metricLabelFontSize ?? 12))
  );
  $: metricLabelFontColor =
    typeof widget.options?.metricLabelFontColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.metricLabelFontColor)
      ? widget.options.metricLabelFontColor
      : '#eef4ff';
  $: dnsAxisFont =
    typeof widget.options?.dnsAxisFont === 'string' ? widget.options.dnsAxisFont.trim() : '';
  $: dnsAxisWeight = Math.min(900, Math.max(300, Number(widget.options?.dnsAxisWeight ?? 600)));
  $: dnsAxisSize = Math.min(30, Math.max(8, Number(widget.options?.dnsAxisSize ?? 11)));
  $: dnsAxisColor =
    typeof widget.options?.dnsAxisColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.dnsAxisColor)
      ? widget.options.dnsAxisColor
      : '#9fb4ca';
  $: dnsLegendFont =
    typeof widget.options?.dnsLegendFont === 'string' ? widget.options.dnsLegendFont.trim() : '';
  $: dnsLegendWeight = Math.min(900, Math.max(300, Number(widget.options?.dnsLegendWeight ?? 600)));
  $: dnsLegendSize = Math.min(32, Math.max(8, Number(widget.options?.dnsLegendSize ?? 12)));
  $: dnsLegendColor =
    typeof widget.options?.dnsLegendColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.dnsLegendColor)
      ? widget.options.dnsLegendColor
      : '#cadbec';
  $: {
    const selectedKeys = Array.isArray(widget.options?.metrics)
      ? widget.options.metrics.filter((item): item is string => typeof item === 'string')
      : [];
    const labelOverrides =
      widget.options?.metricLabelOverrides &&
      typeof widget.options.metricLabelOverrides === 'object' &&
      !Array.isArray(widget.options.metricLabelOverrides)
        ? (widget.options.metricLabelOverrides as Record<string, unknown>)
        : {};
    const resolveMetricLabel = (key: string, fallback: string) => {
      const override = labelOverrides[key];
      return typeof override === 'string' && override.trim() ? override.trim() : fallback;
    };
    const rawMetrics = Array.isArray(data.metrics) ? data.metrics : [];
    const rawByKey = new Map(
      rawMetrics
        .filter((metric) => typeof metric.key === 'string' && metric.key)
        .map((metric) => [String(metric.key), metric])
    );
    if (data.summary) {
      const summaryByKey: Record<string, { value: number | string; label: string; unit?: string }> = {
        totalQueries: {
          value: data.summary.totalQueries,
          label: resolveMetricLabel('totalQueries', 'Queries')
        },
        blockedPct: {
          value: data.summary.blockedPct,
          label: resolveMetricLabel('blockedPct', 'Blocked'),
          unit: '%'
        },
        latency: {
          value: data.summary.latency > 0 ? data.summary.latency.toFixed(2) : '—',
          label: resolveMetricLabel('latency', 'Latency'),
          unit: data.summary.latency > 0 ? 'ms' : undefined
        },
        failures: {
          value: Number(data.summary.failures ?? 0),
          label: resolveMetricLabel('failures', 'Failure')
        },
        cachedAvgLatency: {
          value: Number(data.summary.cachedAvgLatency ?? 0).toFixed(2),
          label: resolveMetricLabel('cachedAvgLatency', 'Cached Avg. Latency'),
          unit: 'ms'
        },
        cached: { value: Number(data.summary.cached ?? 0), label: resolveMetricLabel('cached', 'Cached') },
        recursive: {
          value: Number(data.summary.recursive ?? 0),
          label: resolveMetricLabel('recursive', 'Recursive')
        },
        authoritative: {
          value: Number(data.summary.authoritative ?? 0),
          label: resolveMetricLabel('authoritative', 'Authoritative')
        }
      };

      if (selectedKeys.length > 0) {
        summaryMetrics = selectedKeys.map((key) => {
          const fromSummary = summaryByKey[key];
          if (fromSummary) return { key, ...fromSummary };
          const fromRaw = rawByKey.get(key);
          if (fromRaw) {
            return { ...fromRaw, label: resolveMetricLabel(key, fromRaw.label ?? metricLabelByKey[key] ?? key) };
          }
          return { key, value: 0, label: resolveMetricLabel(key, metricLabelByKey[key] ?? key) };
        });
      } else if (rawMetrics.length > 0) {
        summaryMetrics = rawMetrics.map((metric) => {
          const key = typeof metric.key === 'string' ? metric.key : '';
          const baseLabel = metric.label ?? (key ? metricLabelByKey[key] ?? key : 'Metric');
          return {
            ...metric,
            label: key ? resolveMetricLabel(key, baseLabel) : baseLabel
          };
        });
      } else {
        summaryMetrics = [
          { key: 'totalQueries', ...summaryByKey.totalQueries },
          { key: 'blockedPct', ...summaryByKey.blockedPct },
          { key: 'latency', ...summaryByKey.latency }
        ];
      }
    } else {
      summaryMetrics = rawMetrics;
    }
  }

  const updateChartHeight = () => {
    if (!rootEl) return;

    const totalHeight = rootEl.clientHeight;
    const summaryHeight = summaryEl?.offsetHeight ?? 0;
    const summaryGap = summaryEl ? 10 : 0;
    const nextHeight = Math.max(96, totalHeight - summaryHeight - summaryGap);
    chartHeight = nextHeight;
  };

  const scheduleChartHeightUpdate = () => {
    if (typeof window === 'undefined') return;
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = window.requestAnimationFrame(() => {
      frameId = 0;
      updateChartHeight();
    });
  };

  onMount(() => {
    scheduleChartHeightUpdate();
    if (!rootEl) return;

    resizeObserver = new ResizeObserver(() => scheduleChartHeightUpdate());
    resizeObserver.observe(rootEl);
    const card = rootEl.closest('.card');
    if (card instanceof HTMLElement) {
      resizeObserver.observe(card);
    }
  });

  onDestroy(() => {
    if (frameId && typeof window !== 'undefined') {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
  });
</script>

{#if data.error}
  <p class="error-text">{data.error}</p>
{:else}
  <div
    class="chart-widget"
    style={`--metric-box-width:${metricBoxWidth > 0 ? `${metricBoxWidth}px` : '100%'};--metric-box-height:${metricBoxHeight}px;--metric-box-border-width:${metricBoxBorder ? '1px' : '0px'};--metric-box-bg:${metricBoxBackgroundColor};--metric-box-border-color:${metricBoxBorderColor};--metric-font-size:${metricFontSize}px;--metric-font-color:${metricFontColor};--metric-label-font-size:${metricLabelFontSize}px;--metric-label-font-color:${metricLabelFontColor};--dns-bar-width:${barWidth}px;--dns-bar-gap:${barGap}px;--dns-bar-border:${barBorder}px;--dns-bar-border-color:${barBorderColor};--dns-corner-smoothing:${cornerSmoothing};--dns-axis-size:${dnsAxisSize}px;--dns-axis-weight:${dnsAxisWeight};--dns-axis-color:${dnsAxisColor};--dns-legend-size:${dnsLegendSize}px;--dns-legend-weight:${dnsLegendWeight};--dns-legend-color:${dnsLegendColor};${metricFont ? `--metric-font:${metricFont};` : ''}${metricLabelFont ? `--metric-label-font:${metricLabelFont};` : ''}${dnsAxisFont ? `--dns-axis-font:${dnsAxisFont};` : ''}${dnsLegendFont ? `--dns-legend-font:${dnsLegendFont};` : ''}`}
    bind:this={rootEl}
  >
    {#if summaryMetrics.length > 0}
      <div
        class={`summary-grid ${showMetricBoxes ? 'boxed' : 'plain'}`}
        style={`--summary-cols: ${Math.max(1, summaryMetrics.length)};`}
        bind:this={summaryEl}
      >
        {#each summaryMetrics as metric}
          <div
            class={`summary-metric ${showMetricBoxes ? 'metric-box' : ''}`}
            style={showMetricBoxes
              ? `border-color:${metricBoxBorderColor};border-width:${metricBoxBorder ? 1 : 0}px;border-style:solid;`
              : undefined}
          >
            <div class="summary-value">
              {metric.value}{metric.unit ? metric.unit === '%' ? '%' : ` ${metric.unit}` : ''}
            </div>
            <div class="summary-label">{metric.label}</div>
          </div>
        {/each}
      </div>
    {/if}

    <div
      class={`chart ${orientation === 'horizontal' ? 'horizontal' : ''} ${barStyle}`}
      style={orientation === 'horizontal' ? undefined : `height: ${chartHeight}px;`}
    >
      {#each labels as label, index}
        {#if totals[index] !== undefined}
          {@const total = totals[index]}
          {@const blockedValue = Math.min(blocked[index] ?? 0, total)}
          {@const scale = barScale}
          {@const size = Math.max(8, (total / max) * scale * barHeightScale)}
          {@const blockedSize = Math.max(
            blockedValue > 0 ? 3 : 0,
            (blockedValue / max) * scale * barHeightScale
          )}
          {@const fillSize = Math.max(2, size)}
          {@const blockedVisibleSize = Math.min(fillSize, blockedSize)}
          <div class="bar">
            <div
              class="bar-track"
              style={`--bar-color:${barColor};--bar-blocked:${blockedColor};${
                orientation === 'horizontal' ? `width: ${size}px; height: 12px;` : `height: ${size}px;`
              }`}
            >
              <div
                class="bar-liquid"
                style={`background: ${barColor}; ${
                  orientation === 'horizontal'
                    ? `width: ${fillSize}px; height: 100%;`
                    : `height: ${fillSize}px;`
                }`}
              >
                {#if stacked && blockedVisibleSize > 0}
                  <div
                    class="bar-blocked"
                    style={`background: ${blockedColor}; ${
                      orientation === 'horizontal'
                        ? `width: ${blockedVisibleSize}px; height: 100%;`
                        : `height: ${blockedVisibleSize}px;`
                    }`}
                  ></div>
                {/if}
              </div>
            </div>
            <div class="bar-label">{label}</div>
          </div>
        {/if}
      {/each}
    </div>
  </div>
{/if}

<style>
  .chart-widget {
    min-width: 0;
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(var(--summary-cols, 3), minmax(0, 1fr));
    align-items: stretch;
    margin-bottom: 10px;
    min-width: 0;
    width: 100%;
    text-align: center;
    column-gap: 8px;
    padding-inline: 2px;
  }

  .summary-metric {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .summary-grid.boxed .summary-metric.metric-box {
    border-radius: 10px;
    border-width: var(--metric-box-border-width, 1px);
    border-style: solid;
    border-color: var(--metric-box-border-color, rgba(106, 168, 255, 0.28));
    background: var(--metric-box-bg, rgba(9, 14, 22, 0.72));
    min-height: var(--metric-box-height, 52px);
    width: var(--metric-box-width, 100%);
    max-width: 100%;
    justify-self: center;
    padding: 6px 6px 5px;
  }

  .summary-value {
    font-size: var(--metric-font-size, 0.94rem);
    color: var(--metric-font-color, var(--text));
    font-family: var(--metric-font, var(--font-heading));
    font-weight: 600;
    line-height: 1.05;
    white-space: nowrap;
    min-width: 0;
  }

  .summary-label {
    font-size: var(--dns-legend-size, var(--metric-label-font-size, calc(var(--metric-font-size, 0.94rem) * 0.56)));
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--dns-legend-color, var(--metric-label-font-color, var(--metric-font-color, var(--muted))));
    font-family: var(--dns-legend-font, var(--metric-label-font, var(--metric-font, var(--font-body))));
    font-weight: var(--dns-legend-weight, 600);
    opacity: 0.88;
    white-space: nowrap;
  }

  .chart {
    display: flex;
    align-items: flex-end;
    gap: var(--dns-bar-gap, 8px);
    flex: 1 1 auto;
    min-height: 96px;
    border-bottom: 1px solid var(--card-border);
    padding-bottom: 10px;
    padding-inline: 2px;
    width: 100%;
    overflow: hidden;
    min-width: 0;
  }

  .chart.horizontal {
    flex-direction: column;
    align-items: flex-start;
    height: auto;
    border-bottom: none;
    padding-bottom: 0;
    overflow-x: visible;
  }

  .bar {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    min-width: 0;
  }

  .chart.horizontal .bar {
    flex: 0 0 auto;
    min-width: 0;
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }

  .bar-track {
    width: var(--dns-bar-width, 18px);
    display: flex;
    align-items: flex-end;
    overflow: hidden;
  }

  .chart.horizontal .bar-track {
    max-width: none;
    align-items: center;
    justify-content: flex-start;
  }

  .chart.classic .bar-track {
    background: rgba(152, 169, 184, 0.38);
    border-radius: calc((var(--dns-bar-width, 18px) / 2) * var(--dns-corner-smoothing, 1));
    border: var(--dns-bar-border, 1px) solid var(--dns-bar-border-color, rgba(210, 228, 246, 0.4));
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  }

  .chart.horizontal.classic .bar-track {
    border-radius: calc((var(--dns-bar-width, 18px) / 2) * var(--dns-corner-smoothing, 1));
  }

  .bar-liquid {
    width: 100%;
    background: var(--bar-color, linear-gradient(180deg, rgba(106, 168, 255, 0.95), rgba(45, 93, 165, 0.92)));
    display: flex;
    align-items: flex-end;
    align-self: flex-end;
  }

  .chart.classic .bar-liquid {
    border-top: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: calc((var(--dns-bar-width, 18px) / 2) * var(--dns-corner-smoothing, 1));
  }

  .chart.horizontal.classic .bar-liquid {
    border-top: none;
    border-right: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: calc((var(--dns-bar-width, 18px) / 2) * var(--dns-corner-smoothing, 1));
    align-items: center;
    justify-content: flex-start;
    align-self: auto;
  }

  .bar-blocked {
    width: 100%;
    background: var(--bar-blocked, #ff6b6b);
  }

  .chart.classic .bar-blocked {
    border-top: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 0 0 calc((var(--dns-bar-width, 18px) / 2) * var(--dns-corner-smoothing, 1))
      calc((var(--dns-bar-width, 18px) / 2) * var(--dns-corner-smoothing, 1));
  }

  .chart.horizontal.classic .bar-blocked {
    border-top: none;
    border-right: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 0 calc((var(--dns-bar-width, 18px) / 2) * var(--dns-corner-smoothing, 1))
      calc((var(--dns-bar-width, 18px) / 2) * var(--dns-corner-smoothing, 1)) 0;
  }

  .bar-label {
    font-size: var(--dns-axis-size, clamp(0.5rem, 0.62vw, 0.6rem));
    color: var(--dns-axis-color, var(--muted));
    font-family: var(--dns-axis-font, var(--font-body));
    font-weight: var(--dns-axis-weight, 600);
    max-width: none;
    overflow: visible;
    text-overflow: clip;
    white-space: nowrap;
    text-align: center;
    line-height: 1.05;
    min-height: 0.88rem;
  }

  .chart.horizontal .bar-label {
    min-width: 44px;
    max-width: none;
    text-align: left;
  }

  .chart.pill-liquid .bar-track {
    border-radius: calc((var(--dns-bar-width, 18px) / 2) * var(--dns-corner-smoothing, 1));
    background: rgba(152, 169, 184, 0.38);
    border: var(--dns-bar-border, 1px) solid var(--dns-bar-border-color, rgba(210, 228, 246, 0.4));
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  }

  .chart.pill-liquid .bar-track .bar-liquid {
    width: 100%;
    border-radius: calc((var(--dns-bar-width, 18px) / 2) * var(--dns-corner-smoothing, 1));
    align-self: flex-end;
  }

  .chart.horizontal.pill-liquid .bar-track .bar-liquid {
    height: 100%;
    border-radius: calc((var(--dns-bar-width, 18px) / 2) * var(--dns-corner-smoothing, 1));
    align-self: auto;
  }

  .chart.squircle .bar-track {
    background: rgba(30, 41, 59, 0.9);
    border: var(--dns-bar-border, 1px) solid var(--dns-bar-border-color, rgba(255, 255, 255, 0.2));
    border-radius: clamp(
      calc(12px * var(--dns-corner-smoothing, 1)),
      calc(var(--dns-bar-width, 18px) * 0.5 * var(--dns-corner-smoothing, 1)),
      calc(16px * var(--dns-corner-smoothing, 1))
    );
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  }

  .chart.horizontal.squircle .bar-track {
    border-radius: clamp(
      calc(10px * var(--dns-corner-smoothing, 1)),
      calc(var(--dns-bar-width, 18px) * 0.4 * var(--dns-corner-smoothing, 1)),
      calc(14px * var(--dns-corner-smoothing, 1))
    );
  }

  .chart.squircle .bar-liquid {
    border-radius: 0 0
      clamp(
        calc(12px * var(--dns-corner-smoothing, 1)),
        calc(var(--dns-bar-width, 18px) * 0.5 * var(--dns-corner-smoothing, 1)),
        calc(16px * var(--dns-corner-smoothing, 1))
      )
      clamp(
        calc(12px * var(--dns-corner-smoothing, 1)),
        calc(var(--dns-bar-width, 18px) * 0.5 * var(--dns-corner-smoothing, 1)),
        calc(16px * var(--dns-corner-smoothing, 1))
      );
    border-top: none;
  }

  .chart.horizontal.squircle .bar-liquid {
    border-radius: 0
      clamp(
        calc(10px * var(--dns-corner-smoothing, 1)),
        calc(var(--dns-bar-width, 18px) * 0.4 * var(--dns-corner-smoothing, 1)),
        calc(14px * var(--dns-corner-smoothing, 1))
      )
      clamp(
        calc(10px * var(--dns-corner-smoothing, 1)),
        calc(var(--dns-bar-width, 18px) * 0.4 * var(--dns-corner-smoothing, 1)),
        calc(14px * var(--dns-corner-smoothing, 1))
      ) 0;
  }

  .chart.squircle .bar-blocked {
    border-radius: 0 0
      clamp(
        calc(12px * var(--dns-corner-smoothing, 1)),
        calc(var(--dns-bar-width, 18px) * 0.5 * var(--dns-corner-smoothing, 1)),
        calc(16px * var(--dns-corner-smoothing, 1))
      )
      clamp(
        calc(12px * var(--dns-corner-smoothing, 1)),
        calc(var(--dns-bar-width, 18px) * 0.5 * var(--dns-corner-smoothing, 1)),
        calc(16px * var(--dns-corner-smoothing, 1))
      );
    border-top: none;
  }

  .chart.horizontal.squircle .bar-blocked {
    border-radius: 0
      clamp(
        calc(10px * var(--dns-corner-smoothing, 1)),
        calc(var(--dns-bar-width, 18px) * 0.4 * var(--dns-corner-smoothing, 1)),
        calc(14px * var(--dns-corner-smoothing, 1))
      )
      clamp(
        calc(10px * var(--dns-corner-smoothing, 1)),
        calc(var(--dns-bar-width, 18px) * 0.4 * var(--dns-corner-smoothing, 1)),
        calc(14px * var(--dns-corner-smoothing, 1))
      ) 0;
  }

  @media (max-width: 900px) {
    .summary-grid {
      column-gap: 6px;
    }

    .summary-value {
      font-size: 0.92rem;
    }

    .chart {
      gap: 6px;
      height: 152px;
    }
  }

  .error-text {
    color: var(--danger);
    font-size: 0.9rem;
  }
</style>
