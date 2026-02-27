<script lang="ts">
  import type { WidgetInstance } from '$widgets/types';

  type SeerrRequestItem = {
    id: string;
    title: string;
    mediaType: 'movie' | 'tv';
    mediaLabel: 'Movie' | 'TV';
    status: 'pending' | 'processing' | 'partial' | 'available' | 'declined' | 'deleted' | 'unknown';
    statusText: string;
    requestedBy: string;
    posterUrl?: string;
    backdropUrl?: string;
    href?: string;
  };

  type SeerrRequestsPayload = {
    items: SeerrRequestItem[];
    metrics?: Array<{
      key?: string;
      value: number | string;
      label: string;
      unit?: string;
    }>;
    error?: string;
  };

  export let widget: WidgetInstance<SeerrRequestsPayload>;

  let items: SeerrRequestItem[] = [];
  let listHeight = 450;
  let titleSize = 13;
  let titleColor = '#eef4ff';
  let titleFont = '';
  let titleWeight = 600;
  let mediaSize = 11;
  let mediaColor = '#9dbad0';
  let mediaFont = '';
  let mediaWeight = 600;
  let statusSize = 11;
  let statusScale = 1;
  let statusColor = '#d9ecff';
  let statusFont = '';
  let statusWeight = 600;
  let userSize = 11;
  let userColor = '#a8c7df';
  let userFont = '';
  let userWeight = 500;
  let metrics: Array<{ key?: string; value: number | string; label: string; unit?: string }> = [];
  let showMetrics = false;
  let showMetricBoxes = true;
  let metricBoxWidth = 0;
  let metricBoxHeight = 46;
  let metricBoxBorder = true;
  let metricBoxBackgroundColor = '#0a1018';
  let metricBoxBorderColor = '#6aa8ff';
  let metricFont = '';
  let metricFontWeight = 600;
  let metricFontSize = 13;
  let metricFontColor = '#eef4ff';
  let metricLabelFont = '';
  let metricLabelFontWeight = 600;
  let metricLabelFontSize = 12;
  let metricLabelFontColor = '#eef4ff';
  const metricLabelByKey: Record<string, string> = {
    pending: 'Pending',
    approved: 'Approved',
    available: 'Available',
    processing: 'Processing',
    unavailable: 'Unavailable'
  };

  const normalizeHexColor = (value: unknown, fallback: string) =>
    typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value)
      ? value
      : fallback;

  $: items = Array.isArray(widget.data?.items) ? widget.data.items : [];
  $: listHeight = Math.max(
    220,
    Number(widget.layout?.height ?? widget.options?.height ?? 450)
  );
  $: titleSize = Math.min(48, Math.max(9, Number(widget.options?.titleSize ?? 13)));
  $: titleColor = normalizeHexColor(widget.options?.titleColor, '#eef4ff');
  $: titleFont =
    typeof widget.options?.titleFont === 'string' ? widget.options.titleFont.trim() : '';
  $: titleWeight = Math.min(900, Math.max(300, Number(widget.options?.titleWeight ?? 600)));
  $: mediaSize = Math.min(36, Math.max(8, Number(widget.options?.mediaSize ?? 11)));
  $: mediaColor = normalizeHexColor(widget.options?.mediaColor, '#9dbad0');
  $: mediaFont =
    typeof widget.options?.mediaFont === 'string' ? widget.options.mediaFont.trim() : '';
  $: mediaWeight = Math.min(900, Math.max(300, Number(widget.options?.mediaWeight ?? 600)));
  $: statusSize = Math.min(36, Math.max(8, Number(widget.options?.statusSize ?? 11)));
  $: statusScale = Math.min(1.8, Math.max(0.7, Number(widget.options?.statusScale ?? 1)));
  $: statusColor = normalizeHexColor(widget.options?.statusColor, '#d9ecff');
  $: statusFont =
    typeof widget.options?.statusFont === 'string' ? widget.options.statusFont.trim() : '';
  $: statusWeight = Math.min(900, Math.max(300, Number(widget.options?.statusWeight ?? 600)));
  $: userSize = Math.min(40, Math.max(9, Number(widget.options?.userSize ?? 11)));
  $: userColor = normalizeHexColor(widget.options?.userColor, '#a8c7df');
  $: userFont =
    typeof widget.options?.userFont === 'string' ? widget.options.userFont.trim() : '';
  $: userWeight = Math.min(900, Math.max(300, Number(widget.options?.userWeight ?? 500)));
  $: showMetricBoxes = widget.options?.metricBoxes !== false;
  $: metricBoxWidth = Math.min(600, Math.max(0, Number(widget.options?.metricBoxWidth ?? 0)));
  $: metricBoxHeight = Math.min(220, Math.max(24, Number(widget.options?.metricBoxHeight ?? 46)));
  $: metricBoxBorder = widget.options?.metricBoxBorder !== false;
  $: metricBoxBackgroundColor = normalizeHexColor(widget.options?.metricBoxBackgroundColor, '#0a1018');
  $: metricBoxBorderColor = normalizeHexColor(widget.options?.metricBoxBorderColor, '#6aa8ff');
  $: metricFont = typeof widget.options?.metricFont === 'string' ? widget.options.metricFont.trim() : '';
  $: metricFontWeight = Math.min(900, Math.max(300, Number(widget.options?.metricFontWeight ?? 600)));
  $: metricFontSize = Math.min(48, Math.max(8, Number(widget.options?.metricFontSize ?? 13)));
  $: metricFontColor =
    typeof widget.options?.metricFontColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.metricFontColor)
      ? widget.options.metricFontColor
      : '#eef4ff';
  $: metricLabelFont =
    typeof widget.options?.metricLabelFont === 'string' ? widget.options.metricLabelFont.trim() : '';
  $: metricLabelFontWeight = Math.min(900, Math.max(300, Number(widget.options?.metricLabelFontWeight ?? 600)));
  $: metricLabelFontSize = Math.min(
    48,
    Math.max(8, Number(widget.options?.metricLabelFontSize ?? 12))
  );
  $: metricLabelFontColor =
    typeof widget.options?.metricLabelFontColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.metricLabelFontColor)
      ? widget.options.metricLabelFontColor
      : '#eef4ff';
  $: {
    const rawMetrics = Array.isArray(widget.data?.metrics) ? widget.data.metrics.slice(0, 4) : [];
    const selectedKeys = Array.isArray(widget.options?.metrics)
      ? widget.options.metrics.filter((item): item is string => typeof item === 'string').slice(0, 4)
      : ['pending', 'approved', 'available'];
    if (selectedKeys.length > 0) {
      const byKey = new Map(
        rawMetrics
          .filter((metric) => typeof metric.key === 'string' && metric.key)
          .map((metric) => [String(metric.key), metric])
      );
      metrics = selectedKeys.map((key) => {
        const existing = byKey.get(key);
        if (existing) return existing;
        return { key, value: 0, label: metricLabelByKey[key] ?? key };
      });
    } else {
      metrics = rawMetrics;
    }
  }
  $: showMetrics = widget.options?.showMetrics === true;
</script>

{#if widget.data?.error}
  <p class="error-text">{widget.data.error}</p>
{:else}
  <div
    class="requests-list"
    style={`max-height: ${listHeight}px; --request-title-size: ${titleSize}px; --request-title-color: ${titleColor}; --request-title-weight: ${titleWeight}; --request-media-size: ${mediaSize}px; --request-media-color: ${mediaColor}; --request-media-weight: ${mediaWeight}; --request-status-size: ${statusSize}px; --request-status-scale: ${statusScale}; --request-status-color: ${statusColor}; --request-status-weight: ${statusWeight}; --request-user-size: ${userSize}px; --request-user-color: ${userColor}; --request-user-weight: ${userWeight}; --metric-box-width:${metricBoxWidth > 0 ? `${metricBoxWidth}px` : '100%'}; --metric-box-height:${metricBoxHeight}px; --metric-box-bg:${metricBoxBackgroundColor}; --metric-box-border:${metricBoxBorder ? '1px solid' : '0 solid transparent'}; --metric-box-border-color:${metricBoxBorderColor}; --metric-font-size:${metricFontSize}px; --metric-font-weight:${metricFontWeight}; --metric-font-color:${metricFontColor}; --metric-label-font-size:${metricLabelFontSize}px; --metric-label-font-weight:${metricLabelFontWeight}; --metric-label-font-color:${metricLabelFontColor}; ${titleFont ? `--request-title-font: ${titleFont};` : ''} ${mediaFont ? `--request-media-font: ${mediaFont};` : ''} ${statusFont ? `--request-status-font: ${statusFont};` : ''} ${userFont ? `--request-user-font: ${userFont};` : ''} ${metricFont ? `--metric-font:${metricFont};` : ''} ${metricLabelFont ? `--metric-label-font:${metricLabelFont};` : ''}`}
  >
    {#if showMetrics && metrics.length > 0}
      <div class={`requests-metrics ${showMetricBoxes ? 'boxed' : 'plain'}`}>
        {#each metrics as metric}
          <div class={`requests-metric-box ${showMetricBoxes ? 'is-boxed' : 'is-plain'}`}>
            <div class="requests-metric-value">{metric.value}{metric.unit ? ` ${metric.unit}` : ''}</div>
            <div class="requests-metric-label">{metric.label}</div>
          </div>
        {/each}
      </div>
    {/if}
    {#each items as item (item.id)}
      <article
        class="request-card"
        style={`${
          item.backdropUrl
            ? `background-image: linear-gradient(rgba(0, 0, 0, 0.44), rgba(0, 0, 0, 0.82)), url('${item.backdropUrl}');`
            : ''
        }`}
      >
        <div class="request-media">
          {#if item.posterUrl}
            <img src={item.posterUrl} alt={item.title} loading="lazy" />
          {:else}
            <div class="poster-fallback">{item.mediaLabel}</div>
          {/if}
        </div>

        <div class="request-content">
          {#if item.href}
            <a class="request-title" href={item.href} target="_blank" rel="noreferrer">{item.title}</a>
          {:else}
            <div class="request-title">{item.title}</div>
          {/if}

          <div class="request-meta-row">
            <span class="request-type">{item.mediaLabel}</span>
            <span class="request-dot">•</span>
            <span class={`request-status status-${item.status}`}>{item.statusText}</span>
          </div>

          <div class="request-user">{item.requestedBy}</div>
        </div>
      </article>
    {/each}
  </div>
{/if}

<style>
  .requests-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    padding-right: 6px;
  }

  .requests-list::-webkit-scrollbar {
    width: 8px;
  }

  .requests-list::-webkit-scrollbar-thumb {
    background: rgba(106, 168, 255, 0.55);
    border-radius: 999px;
  }

  .requests-list::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 999px;
  }

  .request-card {
    border-radius: 14px;
    border: 1px solid rgba(106, 168, 255, 0.28);
    background-color: rgba(16, 22, 30, 0.85);
    background-size: cover;
    background-position: center;
    overflow: hidden;
    min-height: 108px;
    display: flex;
    align-items: stretch;
  }

  .request-media {
    width: 72px;
    min-width: 72px;
    background: rgba(7, 11, 17, 0.72);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .request-media img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .poster-fallback {
    font-size: 0.58rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    text-align: center;
    padding: 0 6px;
  }

  .request-content {
    flex: 1;
    min-width: 0;
    padding: 10px 14px;
    display: grid;
    grid-template-rows: repeat(3, minmax(0, 1fr));
    align-items: stretch;
    min-height: 100%;
    gap: 0;
  }

  .request-title {
    margin: 0;
    color: var(--request-title-color, var(--text));
    font-family: var(--request-title-font, var(--font-heading, var(--font-body)));
    font-size: var(--request-title-size, 16px);
    font-weight: var(--request-title-weight, 600);
    line-height: 1.18;
    letter-spacing: -0.01em;
    text-decoration: none;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    align-self: start;
  }

  .request-meta-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: var(--request-media-size, 11px);
    font-family: var(--request-media-font, var(--font-body));
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--request-media-color, var(--muted));
    font-weight: var(--request-media-weight, 600);
    flex-wrap: wrap;
    align-self: center;
  }

  .request-dot {
    opacity: 0.7;
  }

  .request-status {
    padding: calc(3px * var(--request-status-scale, 1)) calc(8px * var(--request-status-scale, 1));
    border-radius: calc(9px * var(--request-status-scale, 1));
    font-size: var(--request-status-size, 11px);
    font-family: var(--request-status-font, var(--font-body));
    border: 1px solid rgba(255, 255, 255, 0.14);
    text-transform: none;
    letter-spacing: 0;
    color: var(--request-status-color, #d9ecff);
    font-weight: var(--request-status-weight, 600);
    background: rgba(14, 36, 56, 0.85);
    line-height: 1;
  }

  .status-pending {
    background: rgba(161, 118, 38, 0.34);
    border-color: rgba(255, 196, 98, 0.45);
  }

  .status-processing {
    background: rgba(40, 105, 152, 0.35);
    border-color: rgba(104, 187, 248, 0.45);
  }

  .status-partial,
  .status-available {
    background: rgba(35, 93, 133, 0.5);
    border-color: rgba(106, 168, 255, 0.52);
  }

  .status-declined,
  .status-deleted {
    background: rgba(132, 42, 48, 0.4);
    border-color: rgba(255, 107, 107, 0.5);
  }

  .request-user {
    color: var(--request-user-color, #a8c7df);
    font-family: var(--request-user-font, var(--font-body));
    font-size: var(--request-user-size, 14px);
    font-weight: var(--request-user-weight, 500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    align-self: end;
  }

  .error-text {
    color: var(--danger);
    font-size: 0.9rem;
  }

  .requests-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
    gap: 8px;
    margin-bottom: 4px;
  }

  .requests-metric-box.is-boxed {
    border-radius: 10px;
    border: var(--metric-box-border, 1px solid rgba(106, 168, 255, 0.3));
    border-color: var(--metric-box-border-color, rgba(106, 168, 255, 0.3));
    background: var(--metric-box-bg, rgba(9, 14, 22, 0.76));
    min-height: var(--metric-box-height, 46px);
    display: grid;
    place-items: center;
    align-content: center;
    gap: 1px;
    text-align: center;
    padding: 4px 6px;
    width: var(--metric-box-width, 100%);
    max-width: 100%;
    justify-self: center;
  }

  .requests-metric-box.is-plain {
    border: none;
    background: transparent;
    min-height: 38px;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 1px;
    text-align: center;
    padding: 2px 4px;
  }

  .requests-metric-value {
    color: var(--text);
    font-family: var(--metric-font, var(--font-heading));
    font-size: var(--metric-font-size, 0.9rem);
    color: var(--metric-font-color, var(--text));
    font-weight: var(--metric-font-weight, 600);
    line-height: 1;
    white-space: nowrap;
  }

  .requests-metric-label {
    color: var(--metric-label-font-color, var(--metric-font-color, #9dbad0));
    font-family: var(--metric-label-font, var(--metric-font, var(--font-body)));
    font-size: var(--metric-label-font-size, calc(var(--metric-font-size, 0.9rem) * 0.56));
    text-transform: uppercase;
    letter-spacing: 0.07em;
    line-height: 1.05;
    opacity: 0.88;
    font-weight: var(--metric-label-font-weight, 600);
  }

  @media (max-width: 720px) {
    .request-card {
      min-height: 96px;
    }

    .request-media {
      width: 62px;
      min-width: 62px;
    }

    .request-content {
      padding: 9px 11px;
      gap: 5px;
    }

    .request-title {
      font-size: 0.74rem;
    }

    .request-user {
      font-size: 0.86rem;
    }
  }
</style>
