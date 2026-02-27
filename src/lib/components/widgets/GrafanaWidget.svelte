<script context="module" lang="ts">
  const grafanaIframeCache = new Map<string, HTMLIFrameElement>();
  const grafanaPreconnectedOrigins = new Set<string>();
  const grafanaRenderedImageCache = new Map<string, string>();

  const ensureGrafanaOriginPreconnect = (origin: string) => {
    if (!origin || typeof document === 'undefined' || grafanaPreconnectedOrigins.has(origin)) return;
    grafanaPreconnectedOrigins.add(origin);

    const dnsPrefetch = document.createElement('link');
    dnsPrefetch.rel = 'dns-prefetch';
    dnsPrefetch.href = origin;
    document.head.appendChild(dnsPrefetch);

    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = origin;
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);
  };
</script>

<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { WidgetInstance } from '$widgets/types';

  type GrafanaPayload = {
    error?: string;
  };

  export let widget: WidgetInstance<GrafanaPayload>;

  let rootEl: HTMLDivElement | null = null;
  let iframeHostEl: HTMLDivElement | null = null;
  let resizeObserver: ResizeObserver | null = null;

  let panelUrl = '';
  let baseUrl = '';
  let theme: 'dark' | 'light' | 'current' = 'dark';
  let mode: 'interactive' | 'image' = 'interactive';
  let timeframe = '24h';
  let customFrom = 'now-24h';
  let customTo = 'now';
  let refreshSec = 60;

  let width = 900;
  let height = 360;
  let embedUrl = '';
  let renderUrlBase = '';
  let renderedImageUrl = '';
  let renderPollTimer: ReturnType<typeof setInterval> | null = null;
  let lastRenderLoadedUrl = '';
  let loadError = '';
  let frameReady = false;

  $: panelUrl = typeof widget.options?.panelUrl === 'string' ? widget.options.panelUrl.trim() : '';
  $: baseUrl = typeof widget.options?.grafanaBaseUrl === 'string' ? widget.options.grafanaBaseUrl.trim() : '';
  $: theme =
    widget.options?.grafanaTheme === 'light' || widget.options?.grafanaTheme === 'current'
      ? (widget.options.grafanaTheme as 'light' | 'current')
      : 'dark';
  $: mode = widget.options?.grafanaMode === 'image' ? 'image' : 'interactive';
  $: timeframe = typeof widget.options?.grafanaTimeframe === 'string' ? widget.options.grafanaTimeframe : '24h';
  $: customFrom =
    typeof widget.options?.grafanaFrom === 'string' && widget.options.grafanaFrom.trim()
      ? widget.options.grafanaFrom.trim()
      : 'now-24h';
  $: customTo =
    typeof widget.options?.grafanaTo === 'string' && widget.options.grafanaTo.trim()
      ? widget.options.grafanaTo.trim()
      : 'now';
  $: refreshSec = Math.min(3600, Math.max(5, Number(widget.options?.grafanaRefreshSec ?? 60)));

  const toAbsoluteUrl = (value: string) => {
    try {
      return new URL(value);
    } catch {
      if (!baseUrl) return null;
      try {
        return new URL(value, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
      } catch {
        return null;
      }
    }
  };

  const toEmbedPath = (url: URL) => {
    if (url.pathname.includes('/render/d-solo/')) {
      url.pathname = url.pathname.replace('/render/d-solo/', '/d-solo/');
      return;
    }
    if (url.pathname.includes('/render/d/')) {
      url.pathname = url.pathname.replace('/render/d/', '/d/');
      return;
    }
    if (url.pathname.includes('/d-solo/')) return;
    if (url.pathname.includes('/d/')) {
      url.pathname = url.pathname.replace('/d/', '/d-solo/');
    }
  };

  const toRenderPath = (url: URL) => {
    if (url.pathname.includes('/render/d-solo/')) return;
    if (url.pathname.includes('/render/d/')) {
      url.pathname = url.pathname.replace('/render/d/', '/render/d-solo/');
      return;
    }
    if (url.pathname.includes('/d-solo/')) {
      url.pathname = url.pathname.replace('/d-solo/', '/render/d-solo/');
      return;
    }
    if (url.pathname.includes('/d/')) {
      url.pathname = url.pathname.replace('/d/', '/render/d-solo/');
    }
  };

  const resolveTimeRange = () => {
    if (timeframe === 'custom') {
      return {
        from: customFrom || 'now-24h',
        to: customTo || 'now'
      };
    }
    return {
      from: `now-${timeframe}`,
      to: 'now'
    };
  };

  const rebuildEmbedUrl = () => {
    if (!panelUrl) {
      embedUrl = '';
      renderUrlBase = '';
      frameReady = false;
      return;
    }
    const absolute = toAbsoluteUrl(panelUrl);
    if (!absolute) {
      embedUrl = '';
      renderUrlBase = '';
      frameReady = false;
      loadError = 'Invalid Grafana panel URL';
      return;
    }

    const embedAbsolute = new URL(absolute.toString());
    toEmbedPath(embedAbsolute);
    const renderAbsolute = new URL(absolute.toString());
    toRenderPath(renderAbsolute);
    const range = resolveTimeRange();

    embedAbsolute.searchParams.set('from', range.from);
    embedAbsolute.searchParams.set('to', range.to);
    embedAbsolute.searchParams.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    embedAbsolute.searchParams.set('refresh', `${refreshSec}s`);
    embedAbsolute.searchParams.set('kiosk', 'tv');
    renderAbsolute.searchParams.set('from', range.from);
    renderAbsolute.searchParams.set('to', range.to);
    renderAbsolute.searchParams.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    renderAbsolute.searchParams.set('width', String(Math.max(400, width)));
    renderAbsolute.searchParams.set('height', String(Math.max(180, height)));
    if (theme !== 'current') {
      embedAbsolute.searchParams.set('theme', theme);
      renderAbsolute.searchParams.set('theme', theme);
    }
    loadError = '';
    embedUrl = embedAbsolute.toString();
    renderUrlBase = renderAbsolute.toString();
  };

  const getCacheKey = () => widget.id || `${widget.kind}:${widget.source || 'none'}`;

  const appendRefreshBuster = (url: string) => {
    const delimiter = url.includes('?') ? '&' : '?';
    return `${url}${delimiter}_dash_refresh=${Date.now()}`;
  };

  const loadRenderedImage = (url: string) =>
    new Promise<void>((resolve, reject) => {
      const probe = new Image();
      probe.onload = () => resolve();
      probe.onerror = () => reject(new Error('Failed to load Grafana panel'));
      probe.src = url;
    });

  const refreshRenderedImage = async (forceBust = false) => {
    if (!renderUrlBase || mode !== 'image') return;
    const nextUrl = forceBust || lastRenderLoadedUrl ? appendRefreshBuster(renderUrlBase) : renderUrlBase;
    try {
      await loadRenderedImage(nextUrl);
      renderedImageUrl = nextUrl;
      lastRenderLoadedUrl = nextUrl;
      grafanaRenderedImageCache.set(getCacheKey(), nextUrl);
      frameReady = true;
      loadError = '';
    } catch {
      loadError = 'Failed to load Grafana panel';
      frameReady = Boolean(renderedImageUrl);
    }
  };

  const stopRenderPolling = () => {
    if (renderPollTimer) {
      clearInterval(renderPollTimer);
      renderPollTimer = null;
    }
  };

  const startRenderPolling = () => {
    stopRenderPolling();
    if (mode !== 'image' || !renderUrlBase || typeof window === 'undefined') return;
    if (!renderedImageUrl) {
      const cached = grafanaRenderedImageCache.get(getCacheKey());
      if (cached) {
        renderedImageUrl = cached;
        lastRenderLoadedUrl = cached;
        frameReady = true;
      }
    }
    void refreshRenderedImage(false);
    renderPollTimer = setInterval(() => {
      void refreshRenderedImage(true);
    }, Math.max(5, refreshSec) * 1000);
  };

  const resolveGrafanaOrigin = () => {
    const panelAbsolute = toAbsoluteUrl(panelUrl);
    if (panelAbsolute) return panelAbsolute.origin;
    if (!baseUrl) return '';
    try {
      return new URL(baseUrl).origin;
    } catch {
      return '';
    }
  };

  const createIframe = () => {
    const iframe = document.createElement('iframe');
    iframe.title = 'Grafana panel';
    iframe.loading = 'eager';
    iframe.referrerPolicy = 'no-referrer';
    iframe.addEventListener('load', () => {
      iframe.dataset.loaded = '1';
      frameReady = true;
      loadError = '';
    });
    iframe.addEventListener('error', () => {
      iframe.dataset.loaded = '0';
      frameReady = false;
      loadError = 'Failed to load Grafana panel';
    });
    return iframe;
  };

  const attachCachedIframe = () => {
    if (!iframeHostEl || typeof window === 'undefined') return;
    if (mode !== 'interactive') {
      iframeHostEl.replaceChildren();
      return;
    }
    const cacheKey = getCacheKey();
    let iframe = grafanaIframeCache.get(cacheKey);
    if (!iframe) {
      iframe = createIframe();
      grafanaIframeCache.set(cacheKey, iframe);
    }
    if (iframe.parentElement !== iframeHostEl) {
      iframeHostEl.replaceChildren(iframe);
    }
    if (embedUrl && iframe.src !== embedUrl) {
      iframe.dataset.loaded = '0';
      frameReady = false;
      iframe.src = embedUrl;
      return;
    }
    frameReady = iframe.dataset.loaded === '1';
  };

  const updateSize = () => {
    if (!rootEl) return;
    width = Math.max(400, Math.floor(rootEl.clientWidth));
    height = Math.max(180, Math.floor(rootEl.clientHeight));
  };

  $: {
    panelUrl;
    baseUrl;
    const origin = resolveGrafanaOrigin();
    if (origin) {
      ensureGrafanaOriginPreconnect(origin);
    }
  }

  $: {
    panelUrl;
    baseUrl;
    theme;
    timeframe;
    customFrom;
    customTo;
    width;
    height;
    refreshSec;
    rebuildEmbedUrl();
  }

  $: {
    embedUrl;
    attachCachedIframe();
  }

  $: {
    mode;
    renderUrlBase;
    refreshSec;
    startRenderPolling();
  }

  onMount(() => {
    updateSize();
    if (!rootEl) return;
    resizeObserver = new ResizeObserver(() => updateSize());
    resizeObserver.observe(rootEl);
    const card = rootEl.closest('.card');
    if (card instanceof HTMLElement) {
      resizeObserver.observe(card);
    }
    attachCachedIframe();
    startRenderPolling();
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    stopRenderPolling();
    if (iframeHostEl) {
      iframeHostEl.replaceChildren();
    }
  });
</script>

{#if widget.data?.error}
  <p class="error-text">{widget.data.error}</p>
{:else if !panelUrl}
  <div class="grafana-empty">
    Add a Grafana Panel URL in widget settings.
  </div>
{:else}
  <div class="grafana-widget" bind:this={rootEl}>
    {#if mode === 'image'}
      <div class={`grafana-render-host ${frameReady ? 'ready' : 'loading'}`}>
        {#if renderedImageUrl}
          <img src={renderedImageUrl} alt="Grafana panel" class="grafana-rendered-image" />
        {/if}
      </div>
    {:else}
      <div class={`grafana-frame-host ${frameReady ? 'ready' : 'loading'}`} bind:this={iframeHostEl}></div>
    {/if}
    {#if loadError}
      <div class="grafana-error">{loadError}</div>
    {/if}
  </div>
{/if}

<style>
  .grafana-widget {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border-radius: 10px;
  }

  .grafana-frame-host :global(iframe) {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
    opacity: 0;
    transition: opacity 140ms ease;
  }

  .grafana-frame-host {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 10px;
    background: linear-gradient(
      120deg,
      rgba(255, 255, 255, 0.03),
      rgba(255, 255, 255, 0.07),
      rgba(255, 255, 255, 0.03)
    );
    background-size: 220% 100%;
    animation: grafana-loading 1.2s ease-in-out infinite;
  }

  .grafana-frame-host.ready {
    background: transparent;
    animation: none;
  }

  .grafana-frame-host.ready :global(iframe) {
    opacity: 1;
  }

  .grafana-render-host {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 10px;
    overflow: hidden;
    background: linear-gradient(
      120deg,
      rgba(255, 255, 255, 0.03),
      rgba(255, 255, 255, 0.07),
      rgba(255, 255, 255, 0.03)
    );
    background-size: 220% 100%;
    animation: grafana-loading 1.2s ease-in-out infinite;
  }

  .grafana-render-host.ready {
    background: transparent;
    animation: none;
  }

  .grafana-rendered-image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .grafana-empty,
  .grafana-error,
  .error-text {
    color: var(--muted);
    font-size: 0.88rem;
  }

  .grafana-error {
    position: absolute;
    left: 10px;
    bottom: 8px;
    padding: 4px 8px;
    border-radius: 6px;
    background: rgba(20, 27, 35, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  @keyframes grafana-loading {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -30% 0;
    }
  }
</style>
