<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { WidgetInstance } from '$widgets/types';

  type SpeedtestPoint = {
    timestamp: string;
    ts: number;
    download: number;
    upload: number;
    ping: number;
  };

  type SeriesSummary = {
    mean: number;
    min: number;
    max: number;
    last: number;
  };

  type SpeedtestPayload = {
    points?: SpeedtestPoint[];
    summary?: {
      download: SeriesSummary;
      upload: SeriesSummary;
    };
    error?: string;
  };

  export let widget: WidgetInstance<SpeedtestPayload>;

  let rootEl: HTMLDivElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let chartWidth = 720;
  let chartHeight = 260;

  let data: SpeedtestPayload = {};
  let points: SpeedtestPoint[] = [];

  let showTable = true;
  let tableShowMean = true;
  let tableShowLast = true;
  let tableShowMin = false;
  let tableShowMax = false;
  let nameHeader = 'Name';
  let meanHeader = 'Mean';
  let lastHeader = 'Last';
  let minHeader = 'Min';
  let maxHeader = 'Max';
  let downloadLabel = 'Download';
  let uploadLabel = 'Upload';

  let yAxisLabel = 'Mb/s';
  let xAxisLabel = '';
  let yTicks = 6;
  let xTicks = 3;
  let xTickEvery = 1;
  let yTickStep = 5;
  let yTickLabels = 'Mb/s';
  let xTickFormat: 'date-time' | 'date' | 'time' = 'date-time';
  let autoYAxis = true;
  let yMinOverride = 0;
  let yMaxOverride = 0;
  let showGrid = true;
  let showPoints = true;
  let smoothCurves = true;
  let curveThickness = 2.2;
  let pointSize = 3.2;

  let downloadColor = '#1f82ff';
  let uploadColor = '#9c4dff';
  let tableHeaderColor = '#6fa9ff';
  let tableHeaderSize = 15;
  let tableBodyColor = '#d9e6fb';
  let tableBodySize = 15;
  let axisFont = 'var(--font-body)';
  let axisWeight = 500;
  let axisSize = 11;
  let axisColor = '#b3c7e4';
  let tableHeaderFont = 'var(--font-body)';
  let tableHeaderWeight = 600;
  let tableBodyFont = 'var(--font-body)';
  let tableBodyWeight = 500;

  let yMin = 0;
  let yMax = 1;
  let tableColumns: Array<{ key: string; label: string; enabled: boolean }> = [];
  let tableColumnsEffective: Array<{ key: string; label: string; enabled: boolean }> = [];
  let summaryDownload: SeriesSummary = { mean: 0, min: 0, max: 0, last: 0 };
  let summaryUpload: SeriesSummary = { mean: 0, min: 0, max: 0, last: 0 };
  let tableRows: Array<{ key: string; label: string; color: string; summary: SeriesSummary }> = [];
  let marginLeft = 68;
  let marginRight = 16;
  let marginTop = 14;
  let marginBottom = 34;
  let innerWidth = 0;
  let innerHeight = 0;
  let minTs = 0;
  let maxTs = 1;
  let spanMs = 1;
  let yRange = 1;
  let xForIndex = (index: number) => index;
  let yForValue = (value: number) => value;
  let baselineY = 0;
  let downloadCoords: Array<{ x: number; y: number }> = [];
  let uploadCoords: Array<{ x: number; y: number }> = [];
  let downloadPath = '';
  let uploadPath = '';
  let downloadAreaPath = '';
  let uploadAreaPath = '';
  let yTickValues: Array<{ value: number; y: number }> = [];
  let xTickItems: Array<{ x: number; label: string }> = [];

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const asNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const asColor = (value: unknown, fallback: string) =>
    typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value) ? value : fallback;
  const asText = (value: unknown, fallback: string) =>
    typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const asOptionalText = (value: unknown, fallback = '') =>
    typeof value === 'string' ? value : fallback;

  const updateSize = () => {
    if (!rootEl) return;
    chartWidth = Math.max(300, Math.floor(rootEl.clientWidth));
    const totalHeight = Math.max(180, Math.floor(rootEl.clientHeight));
    const tableEstimate = showTable ? 118 : 0;
    chartHeight = Math.max(160, totalHeight - tableEstimate);
  };

  const makeSmoothPath = (coords: Array<{ x: number; y: number }>) => {
    if (coords.length === 0) return '';
    if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
    if (coords.length === 2) return `M ${coords[0].x} ${coords[0].y} L ${coords[1].x} ${coords[1].y}`;
    let path = `M ${coords[0].x} ${coords[0].y}`;
    for (let index = 0; index < coords.length - 1; index += 1) {
      const p0 = coords[Math.max(0, index - 1)];
      const p1 = coords[index];
      const p2 = coords[index + 1];
      const p3 = coords[Math.min(coords.length - 1, index + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  };

  const makeAreaPath = (coords: Array<{ x: number; y: number }>, baselineY: number) => {
    if (coords.length === 0) return '';
    let path = `M ${coords[0].x} ${baselineY} L ${coords[0].x} ${coords[0].y}`;
    for (let index = 1; index < coords.length; index += 1) {
      path += ` L ${coords[index].x} ${coords[index].y}`;
    }
    const last = coords[coords.length - 1];
    path += ` L ${last.x} ${baselineY} Z`;
    return path;
  };

  const makeSmoothAreaPath = (coords: Array<{ x: number; y: number }>, baselineY: number) => {
    if (coords.length === 0) return '';
    if (coords.length === 1) {
      return `M ${coords[0].x} ${baselineY} L ${coords[0].x} ${coords[0].y} L ${coords[0].x} ${baselineY} Z`;
    }
    if (coords.length === 2) {
      return `M ${coords[0].x} ${baselineY} L ${coords[0].x} ${coords[0].y} L ${coords[1].x} ${coords[1].y} L ${coords[1].x} ${baselineY} Z`;
    }
    let path = `M ${coords[0].x} ${baselineY} L ${coords[0].x} ${coords[0].y}`;
    for (let index = 0; index < coords.length - 1; index += 1) {
      const p0 = coords[Math.max(0, index - 1)];
      const p1 = coords[index];
      const p2 = coords[index + 1];
      const p3 = coords[Math.min(coords.length - 1, index + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    const last = coords[coords.length - 1];
    path += ` L ${last.x} ${baselineY} Z`;
    return path;
  };

  const summarize = (values: number[]): SeriesSummary => {
    if (values.length === 0) {
      return { mean: 0, min: 0, max: 0, last: 0 };
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      mean: total / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      last: values[values.length - 1] ?? 0
    };
  };

  const formatMbps = (value: number) => `${value.toFixed(0)} Mb/s`;
  const formatTickValue = (value: number, unit: string) =>
    unit.trim() ? `${value.toFixed(0)} ${unit}` : `${value.toFixed(0)}`;
  const formatDateTick = (
    ts: number,
    spanMs: number,
    format: 'date-time' | 'date' | 'time'
  ) => {
    const date = new Date(ts);
    if (format === 'date') {
      return date.toLocaleDateString([], { month: '2-digit', day: '2-digit' });
    }
    if (format === 'time') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (spanMs > 86_400_000) {
      return date.toLocaleString([], {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  $: data = widget.data ?? {};
  $: points = Array.isArray(data.points)
    ? [...data.points]
        .filter((point): point is SpeedtestPoint => Boolean(point && Number.isFinite(point.ts)))
        .sort((left, right) => left.ts - right.ts)
    : [];
  $: showTable = widget.options?.speedtestShowTable !== false;
  $: tableShowMean = widget.options?.speedtestTableShowMean !== false;
  $: tableShowLast = widget.options?.speedtestTableShowLast !== false;
  $: tableShowMin = widget.options?.speedtestTableShowMin === true;
  $: tableShowMax = widget.options?.speedtestTableShowMax === true;
  $: nameHeader = asText(widget.options?.speedtestTableNameHeader, 'Name');
  $: meanHeader = asText(widget.options?.speedtestTableMeanHeader, 'Mean');
  $: lastHeader = asText(widget.options?.speedtestTableLastHeader, 'Last');
  $: minHeader = asText(widget.options?.speedtestTableMinHeader, 'Min');
  $: maxHeader = asText(widget.options?.speedtestTableMaxHeader, 'Max');
  $: downloadLabel = asText(widget.options?.speedtestDownloadLabel, 'Download');
  $: uploadLabel = asText(widget.options?.speedtestUploadLabel, 'Upload');
  $: yAxisLabel = asOptionalText(widget.options?.speedtestYAxisLabel, 'Mb/s');
  $: xAxisLabel = asOptionalText(widget.options?.speedtestXAxisLabel, '');
  $: yTicks = clamp(Math.round(asNumber(widget.options?.speedtestYTicks, 6)), 3, 10);
  $: xTicks = clamp(Math.round(asNumber(widget.options?.speedtestXTicks, 3)), 2, 8);
  $: xTickEvery = clamp(Math.round(asNumber(widget.options?.speedtestXTickEvery, 1)), 1, 12);
  $: yTickStep = clamp(Math.round(asNumber(widget.options?.speedtestYTickStep, 5)), 1, 500);
  $: yTickLabels = asOptionalText(widget.options?.speedtestYTickLabels, 'Mb/s');
  $: xTickFormat =
    widget.options?.speedtestXTickFormat === 'date' || widget.options?.speedtestXTickFormat === 'time'
      ? widget.options.speedtestXTickFormat
      : 'date-time';
  $: autoYAxis = widget.options?.speedtestAutoYAxis !== false;
  $: yMinOverride = asNumber(widget.options?.speedtestYAxisMin, 0);
  $: yMaxOverride = asNumber(widget.options?.speedtestYAxisMax, 0);
  $: showGrid = widget.options?.speedtestShowGrid !== false;
  $: showPoints = widget.options?.speedtestShowPoints !== false;
  $: smoothCurves = widget.options?.speedtestSmoothCurves !== false;
  $: curveThickness = clamp(asNumber(widget.options?.speedtestCurveThickness, 2.2), 1, 8);
  $: pointSize = clamp(asNumber(widget.options?.speedtestPointSize, 3.2), 0.5, 10);
  $: downloadColor = asColor(widget.options?.speedtestDownloadColor, '#1f82ff');
  $: uploadColor = asColor(widget.options?.speedtestUploadColor, '#9c4dff');
  $: tableHeaderColor = asColor(widget.options?.speedtestTableHeaderColor, '#6fa9ff');
  $: tableBodyColor = asColor(widget.options?.speedtestTableBodyColor, '#d9e6fb');
  $: tableHeaderSize = clamp(Math.round(asNumber(widget.options?.speedtestTableHeaderSize, 15)), 9, 28);
  $: tableBodySize = clamp(Math.round(asNumber(widget.options?.speedtestTableBodySize, 15)), 9, 28);
  $: axisFont = asOptionalText(widget.options?.speedtestAxisFont, 'var(--font-body)');
  $: axisWeight = clamp(Math.round(asNumber(widget.options?.speedtestAxisWeight, 500)), 100, 900);
  $: axisSize = clamp(Math.round(asNumber(widget.options?.speedtestAxisSize, 11)), 8, 24);
  $: axisColor = asColor(widget.options?.speedtestAxisColor, '#b3c7e4');
  $: tableHeaderFont = asOptionalText(widget.options?.speedtestTableHeaderFont, 'var(--font-body)');
  $: tableHeaderWeight = clamp(Math.round(asNumber(widget.options?.speedtestTableHeaderWeight, 600)), 100, 900);
  $: tableBodyFont = asOptionalText(widget.options?.speedtestTableBodyFont, 'var(--font-body)');
  $: tableBodyWeight = clamp(Math.round(asNumber(widget.options?.speedtestTableBodyWeight, 500)), 100, 900);
  $: {
    const values = points.flatMap((point) => [point.download, point.upload]).filter(Number.isFinite);
    const autoMin = values.length > 0 ? Math.min(...values) : 0;
    const autoMax = values.length > 0 ? Math.max(...values) : 1;
    const spread = Math.max(1, autoMax - autoMin);
    const padding = Math.max(3, spread * 0.08);
    const computedMin = Math.max(0, autoMin - padding);
    const computedMax = autoMax + padding;
    if (autoYAxis) {
      yMin = Math.max(0, Math.floor(computedMin / yTickStep) * yTickStep);
      yMax = Math.max(yMin + yTickStep, Math.ceil(computedMax / yTickStep) * yTickStep);
    } else {
      yMin = Math.floor(yMinOverride / yTickStep) * yTickStep;
      yMax = yMaxOverride > yMinOverride ? yMaxOverride : yMinOverride + yTickStep;
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax) || yMax <= yMin) {
      yMin = 0;
      yMax = Math.max(5, yTickStep);
    }
  }

  $: tableColumns = [
    { key: 'mean', label: meanHeader, enabled: tableShowMean },
    { key: 'last', label: lastHeader, enabled: tableShowLast },
    { key: 'min', label: minHeader, enabled: tableShowMin },
    { key: 'max', label: maxHeader, enabled: tableShowMax }
  ].filter((column) => column.enabled);
  $: tableColumnsEffective =
    tableColumns.length > 0 ? tableColumns : [{ key: 'mean', label: meanHeader, enabled: true }];

  $: summaryDownload = data.summary?.download ?? summarize(points.map((point) => point.download));
  $: summaryUpload = data.summary?.upload ?? summarize(points.map((point) => point.upload));
  $: tableRows = [
    { key: 'download', label: downloadLabel, color: downloadColor, summary: summaryDownload },
    { key: 'upload', label: uploadLabel, color: uploadColor, summary: summaryUpload }
  ];

  $: marginLeft = 68;
  $: marginRight = 16;
  $: marginTop = 14;
  $: marginBottom = xAxisLabel ? 48 : 34;
  $: innerWidth = Math.max(30, chartWidth - marginLeft - marginRight);
  $: innerHeight = Math.max(30, chartHeight - marginTop - marginBottom);
  $: minTs = points[0]?.ts ?? 0;
  $: maxTs = points[points.length - 1]?.ts ?? minTs + 1;
  $: spanMs = Math.max(1, maxTs - minTs);
  $: yRange = Math.max(0.0001, yMax - yMin);
  $: xForIndex = (index: number) =>
    points.length <= 1
      ? marginLeft + innerWidth / 2
      : marginLeft + (index / (points.length - 1)) * innerWidth;
  $: yForValue = (value: number) => marginTop + ((yMax - value) / yRange) * innerHeight;
  $: baselineY = marginTop + innerHeight;
  $: downloadCoords = points.map((point, index) => ({
    x: xForIndex(index),
    y: yForValue(point.download)
  }));
  $: uploadCoords = points.map((point, index) => ({ x: xForIndex(index), y: yForValue(point.upload) }));
  $: downloadPath = smoothCurves ? makeSmoothPath(downloadCoords) : '';
  $: uploadPath = smoothCurves ? makeSmoothPath(uploadCoords) : '';
  $: downloadAreaPath = smoothCurves
    ? makeSmoothAreaPath(downloadCoords, baselineY)
    : makeAreaPath(downloadCoords, baselineY);
  $: uploadAreaPath = smoothCurves
    ? makeSmoothAreaPath(uploadCoords, baselineY)
    : makeAreaPath(uploadCoords, baselineY);
  $: yTickValues = (() => {
    const count = Math.max(2, yTicks);
    const ticks: Array<{ value: number; y: number }> = [];
    for (let index = 0; index < count; index += 1) {
      const ratio = count === 1 ? 0 : index / (count - 1);
      const y = marginTop + ratio * innerHeight;
      const rawValue = yMax - ratio * yRange;
      const snappedValue = Number((Math.round(rawValue / yTickStep) * yTickStep).toFixed(8));
      ticks.push({ value: snappedValue, y });
    }
    return ticks;
  })();
  $: xTickItems = (() => {
    if (points.length === 0) return [];
    const baseIndices: number[] = [];
    for (let index = 0; index < points.length; index += xTickEvery) {
      baseIndices.push(index);
    }
    const lastIndex = points.length - 1;
    if (baseIndices[baseIndices.length - 1] !== lastIndex) {
      baseIndices.push(lastIndex);
    }
    return baseIndices.map((targetIndex) => {
      const point = points[targetIndex];
      const ts = point?.ts ?? minTs;
      return {
        x: xForIndex(targetIndex),
        label: formatDateTick(ts, spanMs, xTickFormat)
      };
    });
  })();

  onMount(() => {
    updateSize();
    if (!rootEl) return;
    resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(rootEl);
    const card = rootEl.closest('.card');
    if (card instanceof HTMLElement) {
      resizeObserver.observe(card);
    }
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
  });
</script>

{#if data.error}
  <p class="error-text">{data.error}</p>
{:else if points.length === 0}
  <div class="speedtest-empty">No speed test history available.</div>
{:else}
  <div
    class="speedtest-shell"
    bind:this={rootEl}
    style={`--axis-font:${axisFont};--axis-weight:${axisWeight};--axis-size:${axisSize}px;--axis-color:${axisColor};`}
  >
    <div class="speedtest-chart-wrap">
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" class="speedtest-chart">
        <defs>
          <linearGradient id={`download-fill-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color={downloadColor} stop-opacity="0.25" />
            <stop offset="100%" stop-color={downloadColor} stop-opacity="0.03" />
          </linearGradient>
          <linearGradient id={`upload-fill-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color={uploadColor} stop-opacity="0.24" />
            <stop offset="100%" stop-color={uploadColor} stop-opacity="0.03" />
          </linearGradient>
        </defs>

        {#if showGrid}
          {#each yTickValues as tick (tick.y)}
            <line class="grid-line" x1={marginLeft} x2={marginLeft + innerWidth} y1={tick.y} y2={tick.y} />
          {/each}
          {#each xTickItems as tick (tick.x)}
            <line class="grid-line vertical" x1={tick.x} x2={tick.x} y1={marginTop} y2={baselineY} />
          {/each}
        {/if}

        <path d={downloadAreaPath} fill={`url(#download-fill-${widget.id})`} />
        <path d={uploadAreaPath} fill={`url(#upload-fill-${widget.id})`} />
        {#if smoothCurves}
          <path d={downloadPath} class="series-line" style={`stroke:${downloadColor};stroke-width:${curveThickness};`} />
          <path d={uploadPath} class="series-line" style={`stroke:${uploadColor};stroke-width:${curveThickness};`} />
        {:else}
          <polyline
            points={downloadCoords.map((point) => `${point.x},${point.y}`).join(' ')}
            class="series-line"
            style={`stroke:${downloadColor};stroke-width:${curveThickness};`}
          />
          <polyline
            points={uploadCoords.map((point) => `${point.x},${point.y}`).join(' ')}
            class="series-line"
            style={`stroke:${uploadColor};stroke-width:${curveThickness};`}
          />
        {/if}

        {#if showPoints}
          {#each downloadCoords as point, index (`d-${index}`)}
            <circle cx={point.x} cy={point.y} r={pointSize} style={`fill:${downloadColor};`} />
          {/each}
          {#each uploadCoords as point, index (`u-${index}`)}
            <circle cx={point.x} cy={point.y} r={pointSize} style={`fill:${uploadColor};`} />
          {/each}
        {/if}

        {#each yTickValues as tick, index (tick.y)}
          <text class="axis-text y" x={marginLeft - 10} y={index === yTickValues.length - 1 ? tick.y - 2 : tick.y + 4}>
            {formatTickValue(tick.value, yTickLabels)}
          </text>
        {/each}
        {#each xTickItems as tick (`${tick.x}-${tick.label}`)}
          <text class="axis-text x" x={tick.x} y={baselineY + 20}>{tick.label}</text>
        {/each}
        {#if yAxisLabel}
          <text
            class="axis-title y"
            x="20"
            y={marginTop + innerHeight / 2}
            transform={`rotate(-90 20 ${marginTop + innerHeight / 2})`}
          >
            {yAxisLabel}
          </text>
        {/if}
        {#if xAxisLabel}
          <text class="axis-title x" x={marginLeft + innerWidth / 2} y={chartHeight - 8}>{xAxisLabel}</text>
        {/if}
      </svg>
    </div>

    {#if showTable}
      <div
        class="speedtest-table-wrap"
        style={`--table-header-color:${tableHeaderColor};--table-header-size:${tableHeaderSize}px;--table-header-font:${tableHeaderFont};--table-header-weight:${tableHeaderWeight};--table-body-color:${tableBodyColor};--table-body-size:${tableBodySize}px;--table-body-font:${tableBodyFont};--table-body-weight:${tableBodyWeight};--swatch-width:${Math.max(14, Math.round(tableBodySize * 1.6))}px;--swatch-height:${Math.max(4, Math.round(tableBodySize * 0.4))}px;`}
      >
        <table class="speedtest-table">
          <thead>
            <tr>
              <th>{nameHeader}</th>
              {#each tableColumnsEffective as column (column.key)}
                <th>{column.label}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each tableRows as row (row.key)}
              <tr>
                <td class="row-name">
                  <span class="series-swatch" style={`--swatch:${row.color};`}></span>
                  {row.label}
                </td>
                {#each tableColumnsEffective as column (column.key)}
                  <td>
                    {#if column.key === 'mean'}
                      {formatMbps(row.summary.mean)}
                    {:else if column.key === 'last'}
                      {formatMbps(row.summary.last)}
                    {:else if column.key === 'min'}
                      {formatMbps(row.summary.min)}
                    {:else}
                      {formatMbps(row.summary.max)}
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
{/if}

<style>
  .speedtest-shell {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .speedtest-chart-wrap {
    flex: 1 1 auto;
    min-height: 160px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    background: rgba(6, 10, 18, 0.58);
    overflow: hidden;
  }

  .speedtest-chart {
    width: 100%;
    height: 100%;
    display: block;
  }

  .grid-line {
    stroke: rgba(255, 255, 255, 0.07);
    stroke-width: 1;
    shape-rendering: crispEdges;
  }

  .grid-line.vertical {
    stroke: rgba(255, 255, 255, 0.05);
  }

  .series-line {
    fill: none;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .axis-text {
    fill: var(--axis-color, #b3c7e4);
    font-size: var(--axis-size, 11px);
    font-family: var(--axis-font, var(--font-body));
    font-weight: var(--axis-weight, 500);
  }

  .axis-text.y {
    text-anchor: end;
  }

  .axis-text.x {
    text-anchor: middle;
  }

  .axis-title {
    fill: var(--axis-color, #8ea9ce);
    font-size: var(--axis-size, 11px);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-family: var(--axis-font, var(--font-body));
    font-weight: var(--axis-weight, 500);
  }

  .axis-title.x {
    text-anchor: middle;
  }

  .speedtest-table-wrap {
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    overflow: hidden;
    background: rgba(8, 14, 24, 0.62);
  }

  .speedtest-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .speedtest-table th,
  .speedtest-table td {
    padding: 8px 10px;
    text-align: left;
    font-size: var(--table-body-size, 15px);
    color: var(--table-body-color, #d9e6fb);
    font-family: var(--table-body-font, var(--font-body));
    font-weight: var(--table-body-weight, 500);
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    white-space: nowrap;
  }

  .speedtest-table th {
    color: var(--table-header-color, #6fa9ff);
    font-size: var(--table-header-size, 15px);
    font-family: var(--table-header-font, var(--font-body));
    font-weight: var(--table-header-weight, 600);
    letter-spacing: 0.02em;
  }

  .speedtest-table th:first-child {
    padding-left: calc(10px + var(--swatch-width, 24px) + 10px);
  }

  .speedtest-table tr:last-child td {
    border-bottom: 0;
  }

  .row-name {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
  }

  .series-swatch {
    width: var(--swatch-width, 24px);
    height: var(--swatch-height, 6px);
    border-radius: 999px;
    background: var(--swatch, #6aa8ff);
    display: inline-block;
  }

  .speedtest-empty,
  .error-text {
    color: var(--muted);
    font-size: 0.9rem;
  }
</style>
