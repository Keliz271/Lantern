<script lang="ts">
  import type { WidgetInstance } from '$widgets/types';
  import { getSourceIconUrl } from '$lib/shared/dashboardIcons';
  import type {
    MediaHistoryItem,
    MediaHistoryPayload,
    PlexNowPlayingMetric,
    PlexNowPlayingPayload,
    PlexNowPlayingSession
  } from '$serverlib/connectors/mediaHistory';

  type PlexSubtype = 'history' | 'now-playing';

  export let widget: WidgetInstance<MediaHistoryPayload | PlexNowPlayingPayload>;

  let subtype: PlexSubtype = 'history';
  let historyItems: MediaHistoryItem[] = [];
  let nowPlayingSessions: PlexNowPlayingSession[] = [];
  let nowPlayingFallbackMetrics: PlexNowPlayingMetric[] = [];
  let historyMetrics: PlexNowPlayingMetric[] = [];
  let displayFallbackMetrics: PlexNowPlayingMetric[] = [];
  let nowPlayingFallbackHistory: MediaHistoryItem[] = [];
  let nowPlayingFallbackHistoryKeys: string[] = [];
  let historyItemKeys: string[] = [];
  let listHeight = 360;
  let showThumbnail = true;
  let showUser = true;
  let compact = true;
  let showStatus = true;
  let showFallbackMetrics = true;
  let showFallbackHistory = true;
  let nowPlayingPosterTextGap = 2;
  let nowPlayingMetadataVerticalOffset = 0;
  let nowPlayingAutoMetadata = true;
  let showMetricBoxes = true;
  let metricBoxWidth = 0;
  let metricBoxHeight = 52;
  let metricBoxBorder = true;
  let metricBoxBackgroundColor = '#0a1018';
  let metricBoxBorderColor = '#6aa8ff';
  let metricFont = '';
  let metricFontWeight = 600;
  let metricFontSize = 14;
  let metricFontColor = '#eef4ff';
  let metricLabelFont = '';
  let metricLabelFontWeight = 600;
  let metricLabelFontSize = 12;
  let metricLabelFontColor = '#eef4ff';
  let sessionMetaFont = '';
  let sessionMetaWeight = 0;
  let sessionMetaSize = 0;
  let sessionMetaColor = '';
  let sessionLabelFont = '';
  let sessionLabelWeight = 0;
  let sessionLabelSize = 0;
  let sessionLabelColor = '';
  let playbackStatusFont = '';
  let playbackStatusWeight = 0;
  let playbackStatusSize = 0;
  let playbackStatusColor = '';
  let nowPlayingTitleTextFont = '';
  let nowPlayingTitleTextWeight = 0;
  let nowPlayingTitleTextSize = 0;
  let nowPlayingTitleTextColor = '';
  let nowPlayingUserTextFont = '';
  let nowPlayingUserTextWeight = 0;
  let nowPlayingUserTextSize = 0;
  let nowPlayingUserTextColor = '';
  let payloadError = '';
  const metricLabelByKey: Record<string, string> = {
    streams: 'Streams',
    albums: 'Albums',
    movies: 'Movies',
    tv: 'TV'
  };
  const plexIconUrl = getSourceIconUrl('plex') ?? '';
  let showIdleIcon = false;

  const hasHistory = (value: unknown): value is MediaHistoryPayload =>
    Boolean(value) &&
    typeof value === 'object' &&
    Array.isArray((value as MediaHistoryPayload).items);

  const hasNowPlaying = (value: unknown): value is PlexNowPlayingPayload =>
    Boolean(value) &&
    typeof value === 'object' &&
    Array.isArray((value as PlexNowPlayingPayload).sessions);

  const getPayloadError = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    const error = (value as { error?: unknown }).error;
    return typeof error === 'string' ? error : '';
  };

  const buildHistoryKeys = (items: MediaHistoryItem[], prefix: string): string[] => {
    const seen = new Map<string, number>();
    return items.map((item) => {
      const idPart = String(item.id ?? '').trim() || 'no-id';
      const playedAtPart = String(item.playedAtKey ?? '').trim();
      const hrefPart = String(item.href ?? '').trim();
      const titlePart = String(item.title ?? '').trim();
      const typePart = String(item.type ?? '').trim();
      const base = `${prefix}-${idPart}-${playedAtPart || hrefPart || `${typePart}-${titlePart}` || 'entry'}`;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return count > 0 ? `${base}-${count}` : base;
    });
  };

  $: subtype = (widget.options?.subtype as PlexSubtype) === 'now-playing' ? 'now-playing' : 'history';
  $: historyItems = subtype === 'history' && hasHistory(widget.data) ? widget.data.items : [];
  $: nowPlayingSessions =
    subtype === 'now-playing' && hasNowPlaying(widget.data) ? widget.data.sessions : [];
  $: nowPlayingFallbackMetrics =
    subtype === 'now-playing' && hasNowPlaying(widget.data) && Array.isArray(widget.data.fallbackMetrics)
      ? widget.data.fallbackMetrics
      : [];
  $: historyMetrics =
    subtype === 'history' &&
    hasHistory(widget.data) &&
    Array.isArray((widget.data as MediaHistoryPayload).metrics)
      ? (((widget.data as MediaHistoryPayload).metrics ?? []) as PlexNowPlayingMetric[])
      : [];
  $: nowPlayingFallbackHistory =
    subtype === 'now-playing' && hasNowPlaying(widget.data) && Array.isArray(widget.data.fallbackHistory)
      ? widget.data.fallbackHistory
      : [];
  $: nowPlayingFallbackHistoryKeys = buildHistoryKeys(nowPlayingFallbackHistory, 'idle');
  $: historyItemKeys = buildHistoryKeys(historyItems, 'history');
  $: listHeight = Math.max(
    180,
    Number(widget.layout?.height ?? widget.options?.height ?? 360)
  );
  $: showThumbnail = widget.options?.showThumbnail !== false;
  $: showUser = widget.options?.showUser !== false;
  $: compact = widget.options?.compact !== false;
  $: showStatus = widget.options?.showStatus !== false;
  $: showFallbackMetrics = widget.options?.showFallbackMetrics !== false;
  $: showFallbackHistory = widget.options?.showFallbackHistory !== false;
  $: nowPlayingPosterTextGap = Math.min(
    40,
    Math.max(-40, Number(widget.options?.nowPlayingPosterTextGap ?? 2))
  );
  $: nowPlayingMetadataVerticalOffset = Math.min(
    40,
    Math.max(-40, Number(widget.options?.nowPlayingMetadataVerticalOffset ?? 0))
  );
  $: nowPlayingAutoMetadata = widget.options?.nowPlayingAutoMetadata !== false;
  $: showIdleIcon = widget.options?.hideTitle === true;
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
  $: sessionMetaFont =
    typeof widget.options?.sessionMetaFont === 'string' ? widget.options.sessionMetaFont.trim() : '';
  $: {
    const value = Number(widget.options?.sessionMetaWeight ?? 0);
    sessionMetaWeight = Number.isFinite(value) && value > 0 ? Math.min(900, Math.max(300, value)) : 0;
  }
  $: {
    const value = Number(widget.options?.sessionMetaSize ?? 0);
    sessionMetaSize = Number.isFinite(value) && value > 0 ? Math.min(36, Math.max(8, value)) : 0;
  }
  $: sessionMetaColor =
    typeof widget.options?.sessionMetaColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.sessionMetaColor)
      ? widget.options.sessionMetaColor
      : '';
  $: sessionLabelFont =
    typeof widget.options?.sessionLabelFont === 'string' ? widget.options.sessionLabelFont.trim() : '';
  $: {
    const value = Number(widget.options?.sessionLabelWeight ?? 0);
    sessionLabelWeight = Number.isFinite(value) && value > 0 ? Math.min(900, Math.max(300, value)) : 0;
  }
  $: {
    const value = Number(widget.options?.sessionLabelSize ?? 0);
    sessionLabelSize = Number.isFinite(value) && value > 0 ? Math.min(36, Math.max(8, value)) : 0;
  }
  $: sessionLabelColor =
    typeof widget.options?.sessionLabelColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.sessionLabelColor)
      ? widget.options.sessionLabelColor
      : '';
  $: playbackStatusFont =
    typeof widget.options?.playbackStatusFont === 'string' ? widget.options.playbackStatusFont.trim() : '';
  $: {
    const value = Number(widget.options?.playbackStatusWeight ?? 0);
    playbackStatusWeight = Number.isFinite(value) && value > 0 ? Math.min(900, Math.max(300, value)) : 0;
  }
  $: {
    const value = Number(widget.options?.playbackStatusSize ?? 0);
    playbackStatusSize = Number.isFinite(value) && value > 0 ? Math.min(42, Math.max(8, value)) : 0;
  }
  $: playbackStatusColor =
    typeof widget.options?.playbackStatusColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.playbackStatusColor)
      ? widget.options.playbackStatusColor
      : '';
  $: nowPlayingTitleTextFont =
    typeof widget.options?.nowPlayingTitleTextFont === 'string'
      ? widget.options.nowPlayingTitleTextFont.trim()
      : '';
  $: {
    const value = Number(widget.options?.nowPlayingTitleTextWeight ?? 0);
    nowPlayingTitleTextWeight = Number.isFinite(value) && value > 0 ? Math.min(900, Math.max(300, value)) : 0;
  }
  $: {
    const value = Number(widget.options?.nowPlayingTitleTextSize ?? 0);
    nowPlayingTitleTextSize = Number.isFinite(value) && value > 0 ? Math.min(56, Math.max(8, value)) : 0;
  }
  $: nowPlayingTitleTextColor =
    typeof widget.options?.nowPlayingTitleTextColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.nowPlayingTitleTextColor)
      ? widget.options.nowPlayingTitleTextColor
      : '';
  $: nowPlayingUserTextFont =
    typeof widget.options?.nowPlayingUserTextFont === 'string'
      ? widget.options.nowPlayingUserTextFont.trim()
      : '';
  $: {
    const value = Number(widget.options?.nowPlayingUserTextWeight ?? 0);
    nowPlayingUserTextWeight = Number.isFinite(value) && value > 0 ? Math.min(900, Math.max(300, value)) : 0;
  }
  $: {
    const value = Number(widget.options?.nowPlayingUserTextSize ?? 0);
    nowPlayingUserTextSize = Number.isFinite(value) && value > 0 ? Math.min(42, Math.max(8, value)) : 0;
  }
  $: nowPlayingUserTextColor =
    typeof widget.options?.nowPlayingUserTextColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.nowPlayingUserTextColor)
      ? widget.options.nowPlayingUserTextColor
      : '';
  $: payloadError = getPayloadError(widget.data);
  $: {
    const selectedMetricKeys = Array.isArray(widget.options?.metrics)
      ? widget.options.metrics.filter((item): item is string => typeof item === 'string').slice(0, 4)
      : [];
    const sourceMetrics = subtype === 'history' ? historyMetrics : nowPlayingFallbackMetrics;
    if (selectedMetricKeys.length > 0 && sourceMetrics.length > 0) {
      const byKey = new Map(
        sourceMetrics
          .filter((metric) => typeof metric.key === 'string' && metric.key)
          .map((metric) => [String(metric.key), metric])
      );
      displayFallbackMetrics = selectedMetricKeys.map((key) => {
        const existing = byKey.get(key);
        if (existing) return existing;
        return { key, value: 0, label: metricLabelByKey[key] ?? key };
      });
    } else {
      displayFallbackMetrics = sourceMetrics;
    }
  }
</script>

{#if payloadError}
  <p class="error-text">{payloadError}</p>
{:else if subtype === 'now-playing'}
  <div
    class="now-playing-list"
    style={`--metric-box-width:${metricBoxWidth > 0 ? `${metricBoxWidth}px` : '100%'};--metric-box-height:${metricBoxHeight}px;--metric-box-border-width:${metricBoxBorder ? '1px' : '0px'};--metric-box-border-color:${metricBoxBorderColor};--metric-box-bg:${metricBoxBackgroundColor};--metric-font-size:${metricFontSize}px;--metric-font-weight:${metricFontWeight};--metric-font-color:${metricFontColor};--metric-label-font-size:${metricLabelFontSize}px;--metric-label-font-weight:${metricLabelFontWeight};--metric-label-font-color:${metricLabelFontColor};--now-playing-column-gap:${Math.max(2, 2 + nowPlayingPosterTextGap)}px;--now-playing-detail-offset:${nowPlayingPosterTextGap}px;--now-playing-detail-vertical-offset:${nowPlayingMetadataVerticalOffset}px;--now-playing-auto-align-factor:${nowPlayingAutoMetadata ? 0.13 : 0};--now-playing-small-align-extra:${nowPlayingAutoMetadata ? '12px' : '0px'};${sessionMetaSize > 0 ? `--session-meta-size:${sessionMetaSize}px;` : ''}${sessionMetaColor ? `--session-meta-color:${sessionMetaColor};` : ''}${sessionMetaWeight > 0 ? `--session-meta-weight:${sessionMetaWeight};` : ''}${sessionLabelSize > 0 ? `--session-label-size:${sessionLabelSize}px;` : ''}${sessionLabelColor ? `--session-label-color:${sessionLabelColor};` : ''}${sessionLabelWeight > 0 ? `--session-label-weight:${sessionLabelWeight};` : ''}${metricFont ? `--metric-font:${metricFont};` : ''}${metricLabelFont ? `--metric-label-font:${metricLabelFont};` : ''}${sessionMetaFont ? `--session-meta-font:${sessionMetaFont};` : ''}${sessionLabelFont ? `--session-label-font:${sessionLabelFont};` : ''}${playbackStatusSize > 0 ? `--playback-status-size:${playbackStatusSize}px;` : ''}${playbackStatusColor ? `--playback-status-color:${playbackStatusColor};` : ''}${playbackStatusWeight > 0 ? `--playback-status-weight:${playbackStatusWeight};` : ''}${playbackStatusFont ? `--playback-status-font:${playbackStatusFont};` : ''}${nowPlayingTitleTextSize > 0 ? `--now-playing-title-size:${nowPlayingTitleTextSize}px;` : ''}${nowPlayingTitleTextColor ? `--now-playing-title-color:${nowPlayingTitleTextColor};` : ''}${nowPlayingTitleTextWeight > 0 ? `--now-playing-title-weight:${nowPlayingTitleTextWeight};` : ''}${nowPlayingTitleTextFont ? `--now-playing-title-font:${nowPlayingTitleTextFont};` : ''}${nowPlayingUserTextSize > 0 ? `--now-playing-user-size:${nowPlayingUserTextSize}px;` : ''}${nowPlayingUserTextColor ? `--now-playing-user-color:${nowPlayingUserTextColor};` : ''}${nowPlayingUserTextWeight > 0 ? `--now-playing-user-weight:${nowPlayingUserTextWeight};` : ''}${nowPlayingUserTextFont ? `--now-playing-user-font:${nowPlayingUserTextFont};` : ''}`}
  >
    {#if nowPlayingSessions.length === 0}
        <div class="idle-title-row">
          {#if showIdleIcon && plexIconUrl}
          <img class="idle-title-icon" src={plexIconUrl} alt="Plex" loading="eager" decoding="async" />
          {/if}
          <div class="idle-title">No active streams</div>
        </div>
      {#if showFallbackMetrics && displayFallbackMetrics.length > 0}
        <div class={`idle-metrics ${showMetricBoxes ? 'boxed' : 'plain'}`}>
          {#each displayFallbackMetrics as metric}
            <div
              class={`idle-metric-card ${showMetricBoxes ? 'is-boxed' : 'is-plain'}`}
              style={showMetricBoxes
                ? `border-color:${metricBoxBorderColor};border-width:${metricBoxBorder ? 1 : 0}px;border-style:solid;`
                : undefined}
            >
              <div class="idle-metric-value">{metric.value}{metric.unit ? ` ${metric.unit}` : ''}</div>
              <div class="idle-metric-label">{metric.label}</div>
            </div>
          {/each}
        </div>
      {/if}
      {#if showFallbackHistory && nowPlayingFallbackHistory.length > 0}
        <div class="idle-history-list">
          {#each nowPlayingFallbackHistory as item, index (nowPlayingFallbackHistoryKeys[index] ?? `idle-${index}`)}
            <article
              class={`history-item ${compact ? 'compact' : ''} ${item.subtitle?.trim() ? 'has-subtitle' : ''}`}
              style={`border-color:${metricBoxBorderColor};`}
            >
              {#if showThumbnail}
                <div class="history-thumb">
                  {#if item.thumbnailUrl}
                    <img src={item.thumbnailUrl} alt={item.title} loading={index < 6 ? 'eager' : 'lazy'} decoding="async" />
                  {:else}
                    <div class="thumb-fallback">{item.type ?? 'Media'}</div>
                  {/if}
                </div>
              {/if}
              <div class="history-copy">
                {#if item.href}
                  <a class="history-title" href={item.href} target="_blank" rel="noreferrer">{item.title}</a>
                {:else}
                  <div class="history-title">{item.title}</div>
                {/if}
                {#if item.subtitle}
                  <div class="history-subtitle">{item.subtitle}</div>
                {/if}
                <div class="history-meta">
                  {#if showUser && item.user}
                    <span>{item.user}</span>
                    <span class="dot">•</span>
                  {/if}
                  <span>{item.playedAt}</span>
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
      {#if (!showFallbackMetrics || displayFallbackMetrics.length === 0) && (!showFallbackHistory || nowPlayingFallbackHistory.length === 0)}
        <div class="history-empty">Enable idle metrics or idle history in the Info tab.</div>
      {/if}
    {/if}
    {#each nowPlayingSessions as session}
      <article class="now-playing-card">
        <div
          class="now-playing-top"
          style={session.backgroundUrl ? `--np-bg: url('${session.backgroundUrl}');` : undefined}
        >
          <div class="now-playing-overlay"></div>
          <div class="now-playing-poster-wrap">
            {#if session.posterUrl}
              <img src={session.posterUrl} alt={session.title} class="now-playing-poster" loading="eager" decoding="async" />
            {:else}
              <div class="now-playing-poster-fallback">No Poster</div>
            {/if}
          </div>
          <div class="now-playing-details">
            {#if showStatus}
              {#each session.details as detail}
                <div class={`detail-row ${['quality', 'subtitle'].includes(detail.label.toLowerCase()) ? 'detail-break' : ''}`}>
                  <span class="detail-label">{detail.label}</span>
                  <span class="detail-value">{detail.value}</span>
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <div class="now-playing-progress-wrap">
          <div class="progress-detail-stack">
            {#if session.eta}
              <span class="progress-eta">ETA: {session.eta}</span>
            {/if}
            <span class="progress-time">{session.elapsed} / {session.duration}</span>
          </div>
          <div class="now-playing-progress">
            <span class="now-playing-progress-fill" style={`width: ${session.progressPercent}%;`}></span>
          </div>
        </div>

        <div class="now-playing-footer">
          <div class="now-playing-title">{session.title}</div>
          {#if showUser}
            <div class="now-playing-user">{session.user}</div>
          {/if}
        </div>
      </article>
    {/each}
  </div>
{:else}
  <div
    class="history-list"
    style={`height:min(100%, ${listHeight}px);max-height:${listHeight}px;--metric-box-width:${metricBoxWidth > 0 ? `${metricBoxWidth}px` : '100%'};--metric-box-height:${metricBoxHeight}px;--metric-box-border-width:${metricBoxBorder ? '1px' : '0px'};--metric-box-border-color:${metricBoxBorderColor};--metric-box-bg:${metricBoxBackgroundColor};--metric-font-size:${metricFontSize}px;--metric-font-weight:${metricFontWeight};--metric-font-color:${metricFontColor};--metric-label-font-size:${metricLabelFontSize}px;--metric-label-font-weight:${metricLabelFontWeight};--metric-label-font-color:${metricLabelFontColor};${sessionMetaSize > 0 ? `--session-meta-size:${sessionMetaSize}px;` : ''}${sessionMetaColor ? `--session-meta-color:${sessionMetaColor};` : ''}${sessionMetaWeight > 0 ? `--session-meta-weight:${sessionMetaWeight};` : ''}${sessionMetaFont ? `--session-meta-font:${sessionMetaFont};` : ''}${sessionLabelSize > 0 ? `--session-label-size:${sessionLabelSize}px;` : ''}${sessionLabelColor ? `--session-label-color:${sessionLabelColor};` : ''}${sessionLabelWeight > 0 ? `--session-label-weight:${sessionLabelWeight};` : ''}${sessionLabelFont ? `--session-label-font:${sessionLabelFont};` : ''}${metricFont ? `--metric-font:${metricFont};` : ''}${metricLabelFont ? `--metric-label-font:${metricLabelFont};` : ''}`}
  >
    {#if showFallbackMetrics && displayFallbackMetrics.length > 0}
      <div class={`idle-metrics ${showMetricBoxes ? 'boxed' : 'plain'}`}>
        {#each displayFallbackMetrics as metric}
          <div
            class={`idle-metric-card ${showMetricBoxes ? 'is-boxed' : 'is-plain'}`}
            style={showMetricBoxes
              ? `border-color:${metricBoxBorderColor};border-width:${metricBoxBorder ? 1 : 0}px;border-style:solid;`
              : undefined}
          >
            <div class="idle-metric-value">{metric.value}{metric.unit ? ` ${metric.unit}` : ''}</div>
            <div class="idle-metric-label">{metric.label}</div>
          </div>
        {/each}
      </div>
    {/if}
    {#if historyItems.length === 0}
      <div class="history-empty">No media history yet.</div>
    {/if}
    {#each historyItems as item, index (historyItemKeys[index] ?? `history-${index}`)}
      <article
        class={`history-item ${compact ? 'compact' : ''} ${item.subtitle?.trim() ? 'has-subtitle' : ''}`}
        style={`border-color:${metricBoxBorderColor};`}
      >
        {#if showThumbnail}
          <div class="history-thumb">
            {#if item.thumbnailUrl}
              <img src={item.thumbnailUrl} alt={item.title} loading={index < 6 ? 'eager' : 'lazy'} decoding="async" />
            {:else}
              <div class="thumb-fallback">{item.type ?? 'Media'}</div>
            {/if}
          </div>
        {/if}
        <div class="history-copy">
          {#if item.href}
            <a class="history-title" href={item.href} target="_blank" rel="noreferrer">{item.title}</a>
          {:else}
            <div class="history-title">{item.title}</div>
          {/if}
          {#if item.subtitle}
            <div class="history-subtitle">{item.subtitle}</div>
          {/if}
          <div class="history-meta">
            {#if showUser && item.user}
              <span>{item.user}</span>
              <span class="dot">•</span>
            {/if}
            <span>{item.playedAt}</span>
          </div>
        </div>
      </article>
    {/each}
  </div>
{/if}

<style>
  .history-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow-y: auto;
    padding-right: 4px;
  }

  .history-list::-webkit-scrollbar {
    width: 8px;
  }

  .history-list::-webkit-scrollbar-thumb {
    background: rgba(106, 168, 255, 0.55);
    border-radius: 999px;
  }

  .history-list::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 999px;
  }

  .history-item {
    --history-copy-padding-y: 8px;
    --history-row-gap: 4px;
    --history-title-size: calc(var(--session-meta-size, var(--card-title-size, 17.6px)) * 0.75);
    --history-label-size: var(--session-label-size, 14px);
    --history-base-min-height: calc(
      (var(--history-copy-padding-y) * 2) +
      (var(--history-title-size) * 1.18) +
      (var(--history-label-size) * 1.2) +
      var(--history-row-gap)
    );
    border-radius: 12px;
    border: 1px solid var(--metric-box-border-color, rgba(106, 168, 255, 0.28));
    background: rgba(10, 16, 24, 0.6);
    min-height: max(74px, var(--history-base-min-height));
    display: flex;
    align-items: stretch;
    overflow: hidden;
  }

  .history-item.compact {
    min-height: max(66px, calc(var(--history-base-min-height) - 8px));
  }

  .history-item.has-subtitle {
    min-height: max(
      86px,
      calc(var(--history-base-min-height) + (var(--history-label-size) * 1.2) + var(--history-row-gap))
    );
  }

  .history-item.compact.has-subtitle {
    min-height: max(
      76px,
      calc(var(--history-base-min-height) + (var(--history-label-size) * 1.2) + var(--history-row-gap) - 8px)
    );
  }

  .history-thumb {
    width: 72px;
    min-width: 72px;
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(6, 10, 16, 0.7);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .history-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumb-fallback {
    font-size: 0.6rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    text-align: center;
    padding: 0 6px;
  }

  .history-copy {
    min-width: 0;
    flex: 1;
    padding: var(--history-copy-padding-y) 12px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--history-row-gap);
  }

  .history-title {
    color: var(--session-meta-color, var(--card-title-color, var(--text)));
    text-decoration: none;
    font-family: var(--session-meta-font, var(--card-title-font-family, var(--font-heading)));
    font-size: calc(var(--session-meta-size, var(--card-title-size, 17.6px)) * 0.75);
    font-weight: var(--session-meta-weight, var(--card-title-font-weight, 600));
    line-height: 1.18;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .history-title:hover {
    text-decoration: underline;
  }

  .history-subtitle {
    color: var(--session-label-color, var(--card-header-color, #9aa8ba));
    font-family: var(--session-label-font, var(--card-header-font-family, var(--font-body)));
    font-size: var(--session-label-size, 14px);
    font-weight: var(--session-label-weight, var(--card-header-font-weight, 600));
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .history-meta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--session-label-size, 14px);
    color: var(--session-label-color, var(--card-header-color, #9aa8ba));
    font-family: var(--session-label-font, var(--card-header-font-family, var(--font-body)));
    font-weight: var(--session-label-weight, var(--card-header-font-weight, 600));
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .dot {
    opacity: 0.7;
  }

  .now-playing-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    padding-right: 4px;
  }

  .idle-title {
    font-size: 0.94rem;
    color: var(--text);
    font-family: var(--font-heading);
    font-weight: 600;
  }

  .idle-title-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }

  .idle-title-icon {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    object-fit: contain;
    flex: 0 0 auto;
  }

  .idle-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
  }

  .idle-metric-card.is-boxed {
    border-width: var(--metric-box-border-width, 1px);
    border-style: solid;
    border-color: var(--metric-box-border-color, rgba(106, 168, 255, 0.3));
    background: var(--metric-box-bg, rgba(9, 14, 22, 0.76));
    border-radius: 10px;
    padding: 7px 6px;
    text-align: center;
    min-height: var(--metric-box-height, 52px);
    display: grid;
    align-content: center;
    gap: 3px;
    width: var(--metric-box-width, 100%);
    max-width: 100%;
    justify-self: center;
  }

  .idle-metric-card.is-plain {
    border: none;
    background: transparent;
    border-radius: 0;
    padding: 4px 2px;
    min-height: 40px;
    display: grid;
    align-content: center;
    gap: 1px;
    text-align: center;
    justify-items: center;
  }

  .idle-metric-value {
    color: var(--text);
    font-family: var(--metric-font, var(--font-heading));
    font-size: var(--metric-font-size, 0.98rem);
    color: var(--metric-font-color, var(--text));
    font-weight: var(--metric-font-weight, 600);
    line-height: 1;
  }

  .idle-metric-label {
    color: var(--metric-label-font-color, var(--metric-font-color, #9dbad0));
    font-family: var(--metric-label-font, var(--metric-font, var(--font-body)));
    font-size: var(--metric-label-font-size, calc(var(--metric-font-size, 0.98rem) * 0.56));
    font-weight: var(--metric-label-font-weight, 600);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    opacity: 0.88;
  }

  .idle-history-list {
    display: grid;
    gap: 8px;
  }

  .now-playing-list::-webkit-scrollbar {
    width: 8px;
  }

  .now-playing-list::-webkit-scrollbar-thumb {
    background: rgba(106, 168, 255, 0.55);
    border-radius: 999px;
  }

  .now-playing-list::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 999px;
  }

  .now-playing-card {
    display: grid;
    grid-template-rows: minmax(0, 1fr) 18px minmax(34px, auto);
    border-radius: 12px;
    border: 1px solid rgba(106, 168, 255, 0.28);
    background: rgba(10, 16, 24, 0.72);
    overflow: hidden;
    min-height: 0;
    height: 100%;
    container-type: inline-size;
  }

  .now-playing-top {
    position: relative;
    display: grid;
    grid-template-columns: clamp(190px, 36%, 300px) minmax(0, 1fr);
    column-gap: var(--now-playing-column-gap, 2px);
    min-height: 0;
    overflow: hidden;
    background-image: var(--np-bg);
    background-size: cover;
    background-position: center;
  }

  .now-playing-overlay {
    position: absolute;
    inset: 0;
    background: rgba(7, 12, 19, 0.62);
    backdrop-filter: blur(4px);
    z-index: 0;
  }

  .now-playing-poster-wrap,
  .now-playing-details {
    position: relative;
    z-index: 1;
  }

  .now-playing-poster-wrap {
    padding: clamp(6px, 0.9vw, 10px) 0 clamp(6px, 0.9vw, 10px)
      clamp(6px, 0.9vw, 10px);
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }

  .now-playing-poster {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.22);
  }

  .now-playing-poster-fallback {
    width: 100%;
    height: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
    font-size: 0.8rem;
  }

  .now-playing-details {
    margin-left: clamp(
      -90px,
      calc(var(--now-playing-detail-offset, 0px) + ((100cqw - 460px) * var(--now-playing-auto-align-factor, 0))),
      130px
    );
    margin-top: var(--now-playing-detail-vertical-offset, 0px);
    padding: 8px 4px 8px 0;
    display: grid;
    gap: 5px;
    align-content: start;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
  }

  @container (max-width: 560px) {
    .now-playing-details {
      margin-left: calc(
        clamp(
          -90px,
          calc(var(--now-playing-detail-offset, 0px) + ((100cqw - 460px) * var(--now-playing-auto-align-factor, 0))),
          130px
        ) - var(--now-playing-small-align-extra, 0px)
      );
    }
  }

  .now-playing-details::-webkit-scrollbar {
    width: 6px;
  }

  .now-playing-details::-webkit-scrollbar-thumb {
    background: rgba(106, 168, 255, 0.45);
    border-radius: 999px;
  }

  .now-playing-details::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 999px;
  }

  .detail-row {
    display: grid;
    grid-template-columns: minmax(78px, 98px) minmax(0, 1fr);
    gap: 4px;
    align-items: baseline;
  }

  .detail-row.detail-break {
    margin-bottom: 8px;
  }

  .detail-label {
    color: var(--session-label-color, var(--card-header-color, #9aa8ba));
    font-family: var(--session-label-font, var(--card-header-font-family, var(--font-body)));
    font-weight: var(--session-label-weight, var(--card-header-font-weight, 600));
    text-transform: uppercase;
    font-size: var(--session-label-size, 14px);
    letter-spacing: 0.06em;
    text-align: right;
    justify-self: end;
  }

  .detail-value {
    color: var(--session-meta-color, var(--card-title-color, var(--text)));
    font-family: var(--session-meta-font, var(--card-title-font-family, var(--font-body)));
    font-size: calc(var(--session-meta-size, var(--card-title-above-size, 12px)) * 0.67);
    line-height: 1.25;
    font-weight: var(--session-meta-weight, var(--card-title-font-weight, 600));
    overflow-wrap: anywhere;
    text-align: left;
  }

  .now-playing-progress-wrap {
    position: relative;
    background: rgba(9, 14, 22, 0.92);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding: 0;
    min-height: 18px;
    overflow: visible;
  }

  .now-playing-progress {
    width: 100%;
    height: 8px;
    background: rgba(255, 255, 255, 0.08);
    align-self: end;
  }

  .now-playing-progress-fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #f5c04f, #ffa142);
  }

  .progress-detail-stack {
    position: absolute;
    right: 12px;
    top: -30px;
    display: inline-flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }

  .progress-eta,
  .progress-time {
    font-size: var(--playback-status-size, calc(var(--session-meta-size, var(--card-title-above-size, 12px)) * 0.56));
    color: var(--playback-status-color, var(--card-header-color, #fff));
    font-family: var(--playback-status-font, var(--card-header-font-family, var(--font-body)));
    font-weight: var(--playback-status-weight, var(--card-header-font-weight, 600));
    line-height: 1;
    white-space: nowrap;
  }

  .progress-time {
    color: var(--playback-status-color, var(--card-header-color, #cadbec));
  }

  .now-playing-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    min-height: 34px;
    padding: 4px 12px 7px;
    background: rgba(9, 14, 22, 0.94);
  }

  .now-playing-title {
    color: var(--now-playing-title-color, var(--card-title-color, #f4f8ff));
    font-family: var(--now-playing-title-font, var(--card-title-font-family, var(--font-heading)));
    font-weight: var(--now-playing-title-weight, var(--card-title-font-weight, 600));
    font-size: var(--now-playing-title-size, calc(var(--session-meta-size, var(--card-title-size, 17.6px)) * 0.8));
    line-height: 1.15;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
  }

  .now-playing-user {
    font-size: var(--now-playing-user-size, calc(var(--session-meta-size, var(--card-title-above-size, 12px)) * 0.65));
    font-family: var(--now-playing-user-font, var(--card-header-font-family, var(--font-body)));
    font-weight: var(--now-playing-user-weight, var(--card-header-font-weight, 600));
    color: var(--now-playing-user-color, var(--card-header-color, #cadbec));
    text-transform: lowercase;
  }

  .history-empty {
    padding: 10px;
    border-radius: 10px;
    border: 1px dashed var(--card-border);
    color: var(--muted);
    font-size: 0.78rem;
  }

  .error-text {
    color: var(--danger);
    font-size: 0.9rem;
  }

  @media (max-width: 900px) {
    .now-playing-top {
      grid-template-columns: clamp(138px, 31%, 186px) minmax(0, 1fr);
    }

    .detail-row {
      grid-template-columns: minmax(72px, 90px) minmax(0, 1fr);
    }

  }

  @container (min-width: 980px) {
    .now-playing-top {
      grid-template-columns: clamp(230px, 40%, 420px) minmax(0, 1fr);
    }

    .detail-row {
      grid-template-columns: minmax(96px, 116px) minmax(0, 1fr);
    }
  }
</style>
