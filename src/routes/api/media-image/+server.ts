import { env } from '$env/dynamic/private';
import { getWidgets } from '$serverlib/state';
import type { WidgetInstance } from '$widgets/types';
import { canFallbackToEnvSecret } from '$serverlib/security';

const normalizeBaseUrl = (value: unknown) => {
  const input = String(value ?? '').trim();
  if (!input) return '';
  return input.endsWith('/') ? input.slice(0, -1) : input;
};

const normalizeHttpOrigin = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.origin;
  } catch {
    return '';
  }
};

const resolveProvider = (value: string) =>
  value === 'jellyfin' || value === 'plex' ? value : null;

const ALLOWED_IMAGE_QUERY_KEYS = new Set([
  'width',
  'height',
  'maxwidth',
  'maxheight',
  'quality',
  'tag',
  'fillwidth',
  'fillheight',
  'upscale',
  'minsize',
  'blur'
]);

const isMediaWidget = (widget: WidgetInstance | undefined) =>
  Boolean(
    widget &&
      (widget.kind === 'plex' || widget.kind === 'history' || widget.source === 'media-history')
  );

const resolveWidgetProvider = (widget: WidgetInstance) =>
  widget.options?.provider === 'jellyfin' ? 'jellyfin' : 'plex';

const resolveWidgetImageAuth = (widgetId: string, provider: 'plex' | 'jellyfin') => {
  const widget = getWidgets().find((entry) => entry.id === widgetId);
  if (!isMediaWidget(widget)) return null;
  if (!widget || resolveWidgetProvider(widget) !== provider) return null;

  const options = widget.options ?? {};
  const overrideBaseUrl = normalizeHttpOrigin(
    normalizeBaseUrl(typeof options.baseUrl === 'string' ? options.baseUrl : '')
  );
  const envBaseUrl = normalizeHttpOrigin(
    normalizeBaseUrl(provider === 'jellyfin' ? env.JELLYFIN_URL : env.PLEX_URL)
  );
  const baseUrl = overrideBaseUrl || envBaseUrl;

  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const envApiKeyRaw = provider === 'jellyfin' ? env.JELLYFIN_TOKEN : env.PLEX_TOKEN;
  const envApiKey = String(envApiKeyRaw ?? '').trim();
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? envApiKey : '');
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
};

const parseAssetRequest = (value: string) => {
  if (!value.startsWith('/')) return null;
  if (value.includes('\\')) return null;
  try {
    const parsed = new URL(value, 'http://lantern.local');
    if (parsed.origin !== 'http://lantern.local') return null;
    return parsed;
  } catch {
    return null;
  }
};

const hasOnlyAllowedImageQueryKeys = (requestUrl: URL) => {
  for (const key of requestUrl.searchParams.keys()) {
    if (!ALLOWED_IMAGE_QUERY_KEYS.has(key.toLowerCase())) return false;
  }
  return true;
};

const isAllowedPlexAssetPath = (requestUrl: URL) =>
  /^\/library\/metadata\/[^/]+\/(?:thumb|art)(?:\/[^/]+)*$/i.test(requestUrl.pathname) &&
  hasOnlyAllowedImageQueryKeys(requestUrl);

const isAllowedJellyfinAssetPath = (requestUrl: URL) =>
  /^\/Items\/[^/]+\/Images\/(?:Primary|Backdrop(?:\/\d+)?)$/i.test(requestUrl.pathname) &&
  hasOnlyAllowedImageQueryKeys(requestUrl);

const isAllowedAssetRequest = (provider: 'plex' | 'jellyfin', requestUrl: URL) => {
  if (provider === 'plex') return isAllowedPlexAssetPath(requestUrl);
  return isAllowedJellyfinAssetPath(requestUrl);
};

export const GET = async ({ url }) => {
  const widgetId = url.searchParams.get('widgetId')?.trim() ?? '';
  const providerRaw = url.searchParams.get('provider')?.trim() ?? '';
  const provider = resolveProvider(providerRaw);
  const assetPath = url.searchParams.get('path')?.trim() ?? '';
  const assetRequest = parseAssetRequest(assetPath);

  if (!widgetId || !provider || !assetPath || !assetRequest) {
    return new Response('Invalid media image request.', { status: 400 });
  }
  if (!isAllowedAssetRequest(provider, assetRequest)) {
    return new Response('Media image path is not allowed.', { status: 400 });
  }

  const auth = resolveWidgetImageAuth(widgetId, provider);
  if (!auth) {
    return new Response('Media source credentials are missing.', { status: 400 });
  }
  const { baseUrl, apiKey } = auth;

  const remoteUrl = `${baseUrl}${assetRequest.pathname}${assetRequest.search}`;
  const requestHeaders: Record<string, string> = {
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
  };
  if (provider === 'plex') {
    requestHeaders['X-Plex-Token'] = apiKey;
  } else {
    requestHeaders['X-Emby-Token'] = apiKey;
  }

  let upstream: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    upstream = await fetch(remoteUrl, {
      method: 'GET',
      headers: requestHeaders,
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal
    });
  } catch {
    return new Response('Failed to fetch media image.', { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  if (!upstream.ok) {
    return new Response('Media image unavailable.', { status: upstream.status });
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) responseHeaders.set('content-type', contentType);
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) responseHeaders.set('content-length', contentLength);
  responseHeaders.set('cache-control', 'private, no-store');
  responseHeaders.set('x-robots-tag', 'noindex');

  return new Response(upstream.body, {
    status: 200,
    headers: responseHeaders
  });
};
