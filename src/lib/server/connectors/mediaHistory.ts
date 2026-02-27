import { env } from '$env/dynamic/private';
import { fetchJson } from './http';
import { canFallbackToEnvSecret } from '$serverlib/security';

export type MediaHistoryProvider = 'plex' | 'jellyfin';

export type MediaHistoryItem = {
  id: string;
  title: string;
  subtitle?: string;
  user?: string;
  playedAt: string;
  playedAtKey?: string;
  thumbnailUrl?: string;
  href?: string;
  type?: string;
};

export type MediaHistoryPayload = {
  provider: MediaHistoryProvider;
  items: MediaHistoryItem[];
  metrics?: PlexNowPlayingMetric[];
};

export type PlexNowPlayingField = {
  label: string;
  value: string;
};

export type PlexNowPlayingSession = {
  id: string;
  title: string;
  year?: number;
  user: string;
  posterUrl?: string;
  backgroundUrl?: string;
  progressPercent: number;
  elapsed: string;
  duration: string;
  eta?: string;
  details: PlexNowPlayingField[];
};

export type PlexNowPlayingMetric = {
  key: string;
  value: number | string;
  label: string;
  unit?: string;
};

export type PlexNowPlayingPayload = {
  sessions: PlexNowPlayingSession[];
  fallbackMetrics?: PlexNowPlayingMetric[];
  fallbackHistory?: MediaHistoryItem[];
};

type MediaHistoryOptions = {
  widgetId?: string;
  provider?: MediaHistoryProvider;
  baseUrl?: string;
  apiKey?: string;
  userName?: string;
  limit?: number;
  mediaTypes?: string;
};

type PlexHistoryPayload = {
  MediaContainer?: {
    Metadata?: Array<{
      ratingKey?: string | number;
      type?: string;
      title?: string;
      grandparentTitle?: string;
      parentTitle?: string;
      parentIndex?: string | number;
      index?: string | number;
      thumb?: string;
      parentThumb?: string;
      accountID?: string | number;
      viewedAt?: string | number;
      year?: string | number;
    }>;
  };
};

type PlexAccountsPayload = {
  MediaContainer?: {
    Account?: Array<{
      id?: string | number;
      name?: string;
      username?: string;
    }>;
  };
};

type JellyfinUser = {
  Id?: string;
  Name?: string;
};

type JellyfinItem = {
  Id?: string;
  Name?: string;
  Type?: string;
  SeriesName?: string;
  ParentIndexNumber?: string | number;
  IndexNumber?: string | number;
  Year?: string | number;
  UserData?: {
    LastPlayedDate?: string;
  };
};

type JellyfinItemsPayload = {
  Items?: JellyfinItem[];
};

type PlexSessionStream = {
  streamType?: number;
  selected?: number | boolean;
  language?: string;
  languageTag?: string;
  displayTitle?: string;
  title?: string;
  codec?: string;
  channels?: number | string;
};

type PlexSessionPart = {
  Container?: string;
  container?: string;
  Stream?: PlexSessionStream[];
};

type PlexSessionMedia = {
  bitrate?: number | string;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: number | string;
  videoResolution?: string;
  Part?: PlexSessionPart[];
};

type PlexNowPlayingRawItem = {
  ratingKey?: string | number;
  sessionKey?: string | number;
  title?: string;
  year?: string | number;
  type?: string;
  thumb?: string;
  grandparentThumb?: string;
  art?: string;
  grandparentArt?: string;
  viewOffset?: string | number;
  duration?: string | number;
  bitrate?: string | number;
  User?: {
    title?: string;
    username?: string;
  };
  Player?: {
    product?: string;
    platform?: string;
    title?: string;
    state?: string;
    address?: string;
    local?: number | boolean;
  };
  Session?: {
    location?: string;
    bandwidth?: string | number;
  };
  TranscodeSession?: {
    videoDecision?: string;
    audioDecision?: string;
    subtitleDecision?: string;
    container?: string;
    videoCodec?: string;
    audioCodec?: string;
    transcodeHwDecoding?: string;
    transcodeHwEncoding?: string;
    throttled?: string | number | boolean;
  };
  Media?: PlexSessionMedia[];
};

type PlexNowPlayingResponse = {
  MediaContainer?: {
    Metadata?: PlexNowPlayingRawItem[];
  };
};

const normalizeBase = (value?: string) => {
  if (!value) return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const buildMediaImageProxyUrl = (
  widgetId: string | undefined,
  provider: MediaHistoryProvider,
  path: string | undefined
) => {
  const safePath = typeof path === 'string' ? path.trim() : '';
  if (!widgetId || !safePath) return undefined;
  const params = new URLSearchParams({
    widgetId,
    provider,
    path: safePath
  });
  return `/api/media-image?${params.toString()}`;
};

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toRelativeTime = (dateValue: Date) => {
  const diffMs = Date.now() - dateValue.getTime();
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return dateValue.toLocaleString();
};

const toPlayedAtLabelFromUnix = (value: unknown) => {
  const unix = toNumber(value);
  if (!unix) return 'Unknown';
  return toRelativeTime(new Date(unix * 1000));
};

const toPlayedAtLabelFromIso = (value: string | undefined) => {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return toRelativeTime(parsed);
};

const formatBitrateMbps = (value: unknown) => {
  const raw = toNumber(value);
  if (!raw) return undefined;
  return `${(raw / 1000).toFixed(1)} Mbps`;
};

const formatDuration = (value: unknown) => {
  const totalMs = toNumber(value);
  if (!totalMs) return '0:00';
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const formatEta = (remainingMs: number) => {
  if (!remainingMs || remainingMs <= 0) return undefined;
  const eta = new Date(Date.now() + remainingMs);
  return eta.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const toDecisionLabel = (value: string | undefined, fallback = 'Direct') => {
  const decision = (value ?? '').trim().toLowerCase();
  if (!decision) return fallback;
  if (decision === 'directplay' || decision === 'direct play' || decision === 'direct_play') return 'Direct';
  if (decision === 'copy') return 'Direct Stream';
  return decision
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
};

const joinParts = (...values: Array<string | undefined>) =>
  values.filter((value): value is string => Boolean(value && value.trim())).join(' ');

const normalizeToken = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const toPlayerProductLabel = (product?: string, platform?: string) => {
  const productLabel = (product ?? '').trim();
  const platformLabel = (platform ?? '').trim();
  if (!productLabel) {
    return platformLabel ? `Plex for ${platformLabel}` : '';
  }
  if (!platformLabel) return productLabel;

  const normalizedProduct = normalizeToken(productLabel);
  const normalizedPlatform = normalizeToken(platformLabel);
  return normalizedProduct.includes(normalizedPlatform)
    ? productLabel
    : `${productLabel} for ${platformLabel}`;
};

const toDisplayLanguage = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 'Unknown';
  if (trimmed.length <= 3) {
    return trimmed[0]?.toUpperCase() + trimmed.slice(1).toLowerCase();
  }
  return trimmed
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const toAudioChannelLabel = (channels: number) => {
  if (!channels) return '';
  const rounded = Math.round(channels * 10) / 10;
  if (Math.abs(rounded - 6) < 0.05) return '5.1';
  if (Math.abs(rounded - 8) < 0.05) return '7.1';
  if (Math.abs(rounded - 2) < 0.05) return '2.0';
  if (Math.abs(rounded - 1) < 0.05) return '1.0';
  return `${rounded.toFixed(1).replace('.0', '')}`;
};

const fetchPlexHistory = async (
  widgetId: string | undefined,
  baseUrl: string,
  token: string,
  limit: number
): Promise<MediaHistoryItem[]> => {
  const headers = { Accept: 'application/json', 'X-Plex-Token': token };
  const historyPayload = await fetchJson<PlexHistoryPayload>(
    `${baseUrl}/status/sessions/history/all?limit=${limit}&sort=viewedAt:desc`,
    { headers }
  );
  const accountsPayload = await fetchJson<PlexAccountsPayload>(`${baseUrl}/accounts`, { headers });
  const accountMap = new Map<string, string>();
  (accountsPayload.MediaContainer?.Account ?? []).forEach((account) => {
    const id = String(account.id ?? '').trim();
    if (!id) return;
    accountMap.set(id, account.name || account.username || 'Unknown');
  });

  const entries = historyPayload.MediaContainer?.Metadata ?? [];
  return entries.slice(0, limit).map((entry, index) => {
    const type = (entry.type ?? '').toLowerCase();
    const isEpisode = type === 'episode';
    const isTrack = type === 'track';
    const thumb = isEpisode || isTrack ? entry.parentThumb : entry.thumb;
    const thumbnailUrl = buildMediaImageProxyUrl(widgetId, 'plex', thumb);

    const showSeason = toNumber(entry.parentIndex);
    const showEpisode = toNumber(entry.index);
    const year = toNumber(entry.year);
    const title = isEpisode
      ? `${entry.grandparentTitle ?? 'Episode'} · S${showSeason || 0}E${showEpisode || 0}`
      : entry.title ?? `Item ${index + 1}`;
    const subtitle = isEpisode
      ? entry.title ?? ''
      : isTrack
        ? `${entry.grandparentTitle ?? ''}${entry.parentTitle ? ` · ${entry.parentTitle}` : ''}`
        : year > 0
          ? String(year)
          : undefined;

    const accountId = String(entry.accountID ?? '').trim();
    const user = accountMap.get(accountId) ?? undefined;
    const id = String(entry.ratingKey ?? `${type}-${index}`);
    return {
      id,
      title,
      subtitle,
      user,
      playedAt: toPlayedAtLabelFromUnix(entry.viewedAt),
      playedAtKey: entry.viewedAt != null ? String(entry.viewedAt) : undefined,
      thumbnailUrl,
      href: id ? `${baseUrl}/web/index.html#!/server//details?key=%2Flibrary%2Fmetadata%2F${id}` : undefined,
      type
    };
  });
};

const fetchJellyfinHistory = async (
  widgetId: string | undefined,
  baseUrl: string,
  token: string,
  userName: string | undefined,
  limit: number,
  mediaTypes: string
): Promise<MediaHistoryItem[]> => {
  const users = await fetchJson<JellyfinUser[]>(`${baseUrl}/Users?api_key=${encodeURIComponent(token)}`, {
    headers: { Accept: 'application/json' }
  });
  const resolvedUserName =
    userName?.trim() ||
    env.JELLYFIN_USER?.trim() ||
    users[0]?.Name ||
    '';
  const user = users.find((candidate) => candidate.Name === resolvedUserName);
  if (!user?.Id) {
    throw new Error(`Jellyfin user "${resolvedUserName || 'unknown'}" not found`);
  }

  const params = new URLSearchParams({
    api_key: token,
    Limit: String(limit),
    IncludeItemTypes: mediaTypes,
    Recursive: 'true',
    isPlayed: 'true',
    sortBy: 'DatePlayed',
    sortOrder: 'Descending',
    Fields: 'UserDataLastPlayedDate'
  });
  const payload = await fetchJson<JellyfinItemsPayload>(
    `${baseUrl}/Users/${encodeURIComponent(user.Id)}/Items?${params.toString()}`,
    { headers: { Accept: 'application/json' } }
  );

  return (payload.Items ?? []).slice(0, limit).map((item, index) => {
    const type = (item.Type ?? '').toLowerCase();
    const isEpisode = type === 'episode';
    const season = toNumber(item.ParentIndexNumber);
    const episode = toNumber(item.IndexNumber);
    const title = isEpisode
      ? `${item.SeriesName ?? 'Episode'} · S${season || 0}E${episode || 0}`
      : item.Name ?? `Item ${index + 1}`;
    const subtitle = isEpisode ? item.Name ?? '' : undefined;
    const id = item.Id ?? `${type}-${index}`;
    const thumbnailUrl = item.Id
      ? buildMediaImageProxyUrl(
          widgetId,
          'jellyfin',
          `/Items/${encodeURIComponent(String(item.Id))}/Images/Primary`
        )
      : undefined;
    return {
      id,
      title,
      subtitle,
      user: resolvedUserName || undefined,
      playedAt: toPlayedAtLabelFromIso(item.UserData?.LastPlayedDate),
      playedAtKey:
        typeof item.UserData?.LastPlayedDate === 'string' ? item.UserData.LastPlayedDate : undefined,
      thumbnailUrl,
      href: item.Id ? `${baseUrl}/web/index.html#!/details?id=${encodeURIComponent(item.Id)}` : undefined,
      type
    };
  });
};

export const fetchMediaHistory = async (
  options: MediaHistoryOptions = {}
): Promise<MediaHistoryPayload> => {
  const provider: MediaHistoryProvider =
    options.provider === 'jellyfin' ? 'jellyfin' : 'plex';
  const limit = Math.min(30, Math.max(1, Number(options.limit ?? 10)));

  if (provider === 'jellyfin') {
    const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
    const envBaseUrl = normalizeBase(env.JELLYFIN_URL);
    const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
    const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
    const apiKey =
      apiKeyOverride ||
      (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? String(env.JELLYFIN_TOKEN ?? '').trim() : '');
    if (!baseUrl || !apiKey) {
      throw new Error('Jellyfin base URL or token is missing');
    }
    const items = await fetchJellyfinHistory(
      options.widgetId,
      baseUrl,
      apiKey,
      options.userName,
      limit,
      options.mediaTypes ?? 'Movie,Episode'
    );
    return { provider, items };
  }

  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(env.PLEX_URL);
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? String(env.PLEX_TOKEN ?? '').trim() : '');
  if (!baseUrl || !apiKey) {
    throw new Error('Plex base URL or token is missing');
  }
  const items = await fetchPlexHistory(options.widgetId, baseUrl, apiKey, limit);
  return { provider, items };
};

type PlexNowPlayingOptions = {
  widgetId?: string;
  provider?: MediaHistoryProvider;
  baseUrl?: string;
  apiKey?: string;
  sessionLimit?: number;
};

type JellyfinNowPlayingItem = {
  Id?: string;
  Name?: string;
  Type?: string;
  SeriesName?: string;
  ProductionYear?: string | number;
  RunTimeTicks?: string | number;
};

type JellyfinNowPlayingSession = {
  Id?: string;
  UserName?: string;
  Client?: string;
  DeviceName?: string;
  RemoteEndPoint?: string;
  NowPlayingItem?: JellyfinNowPlayingItem;
  PlayState?: {
    PositionTicks?: string | number;
  };
};

const ticksToMs = (value: unknown) => {
  const ticks = toNumber(value);
  if (!ticks) return 0;
  return Math.max(0, Math.floor(ticks / 10000));
};

const fetchJellyfinNowPlaying = async (
  widgetId: string | undefined,
  baseUrl: string,
  apiKey: string,
  sessionLimit: number
): Promise<PlexNowPlayingPayload> => {
  const sessionsPayload = await fetchJson<JellyfinNowPlayingSession[]>(
    `${baseUrl}/Sessions?api_key=${encodeURIComponent(apiKey)}`,
    { headers: { Accept: 'application/json' } }
  );

  const active = (Array.isArray(sessionsPayload) ? sessionsPayload : [])
    .filter((session) => session?.NowPlayingItem?.Id)
    .slice(0, sessionLimit)
    .map((session, index) => {
      const item = session.NowPlayingItem ?? {};
      const runtimeMs = ticksToMs(item.RunTimeTicks);
      const elapsedMs = Math.min(runtimeMs || 0, ticksToMs(session.PlayState?.PositionTicks));
      const remainingMs = Math.max(0, runtimeMs - elapsedMs);
      const progressPercent = runtimeMs > 0 ? Math.min(100, Math.max(0, (elapsedMs / runtimeMs) * 100)) : 0;
      const itemId = String(item.Id ?? `jellyfin-${index}`);
      const posterUrl = item.Id
        ? buildMediaImageProxyUrl(
            widgetId,
            'jellyfin',
            `/Items/${encodeURIComponent(itemId)}/Images/Primary`
          )
        : undefined;
      const backgroundUrl = item.Id
        ? buildMediaImageProxyUrl(
            widgetId,
            'jellyfin',
            `/Items/${encodeURIComponent(itemId)}/Images/Backdrop/0`
          )
        : undefined;
      const title =
        (item.Type ?? '').toLowerCase() === 'episode' && item.SeriesName
          ? `${item.SeriesName} · ${item.Name ?? 'Episode'}`
          : item.Name ?? `Session ${index + 1}`;

      return {
        id: String(session.Id ?? itemId),
        title,
        year: toNumber(item.ProductionYear) || undefined,
        user: session.UserName?.trim() || 'Unknown user',
        posterUrl,
        backgroundUrl,
        progressPercent,
        elapsed: formatDuration(elapsedMs),
        duration: formatDuration(runtimeMs),
        eta: formatEta(remainingMs),
        details: [
          { label: 'Product', value: session.Client?.trim() || 'Jellyfin' },
          { label: 'Player', value: session.DeviceName?.trim() || session.RemoteEndPoint?.trim() || 'Unknown' },
          { label: 'Quality', value: 'Direct' }
        ]
      };
    });

  return { sessions: active };
};

export const fetchPlexNowPlaying = async (
  options: PlexNowPlayingOptions = {}
): Promise<PlexNowPlayingPayload> => {
  const provider: MediaHistoryProvider =
    options.provider === 'jellyfin' ? 'jellyfin' : 'plex';
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(provider === 'jellyfin' ? env.JELLYFIN_URL : env.PLEX_URL);
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl)
      ? String((provider === 'jellyfin' ? env.JELLYFIN_TOKEN : env.PLEX_TOKEN) ?? '').trim()
      : '');
  const sessionLimit = Math.min(6, Math.max(1, Number(options.sessionLimit ?? 1)));
  if (!baseUrl || !apiKey) {
    throw new Error(
      provider === 'jellyfin'
        ? 'Jellyfin base URL or token is missing'
        : 'Plex base URL or token is missing'
    );
  }

  if (provider === 'jellyfin') {
    return fetchJellyfinNowPlaying(options.widgetId, baseUrl, apiKey, sessionLimit);
  }

  const headers = { Accept: 'application/json', 'X-Plex-Token': apiKey };
  const payload = await fetchJson<PlexNowPlayingResponse>(
    `${baseUrl}/status/sessions?X-Plex-Container-Start=0&X-Plex-Container-Size=50`,
    { headers }
  );
  const metadata = payload.MediaContainer?.Metadata ?? [];

  const sessions = metadata.slice(0, sessionLimit).map((item, index) => {
    const ratingKey = String(item.ratingKey ?? item.sessionKey ?? index);
    const title = item.title?.trim() || `Session ${index + 1}`;
    const user = item.User?.title?.trim() || item.User?.username?.trim() || 'Unknown user';
    const year = toNumber(item.year) || undefined;
    const durationMs = toNumber(item.duration);
    const viewOffsetMs = Math.min(durationMs || 0, toNumber(item.viewOffset));
    const remainingMs = Math.max(0, durationMs - viewOffsetMs);
    const progressPercent = durationMs > 0 ? Math.min(100, Math.max(0, (viewOffsetMs / durationMs) * 100)) : 0;

    const media = item.Media?.[0];
    const part = media?.Part?.[0];
    const streams = part?.Stream ?? [];
    const selectedAudio = streams.find((stream) => Number(stream.streamType) === 2 && Number(stream.selected ?? 0) === 1);
    const selectedSubtitle = streams.find((stream) => Number(stream.streamType) === 3 && Number(stream.selected ?? 0) === 1);
    const transcode = item.TranscodeSession;

    const videoDecision = toDecisionLabel(transcode?.videoDecision, 'Direct');
    const audioDecision = toDecisionLabel(transcode?.audioDecision, 'Direct');
    const subtitleDecision = toDecisionLabel(transcode?.subtitleDecision, selectedSubtitle ? 'Direct' : 'None');
    const hasTranscodeSession = Boolean(transcode);
    const hasDirectStream =
      !hasTranscodeSession &&
      [videoDecision, audioDecision, subtitleDecision].some((decision) => decision === 'Direct Stream');
    const streamDecision = hasTranscodeSession
      ? toNumber(transcode?.throttled) > 0 || transcode?.throttled === true
        ? 'Transcode (Throttled)'
        : 'Transcode'
      : hasDirectStream
        ? 'Direct Stream'
        : 'Direct';

    const originalBitrateLabel = formatBitrateMbps(media?.bitrate ?? item.bitrate);
    const bandwidthLabel = formatBitrateMbps(item.Session?.bandwidth);
    const qualityLabel = `Original${
      originalBitrateLabel ? ` (${originalBitrateLabel})` : ''
    }`;

    const videoCodec = (transcode?.videoCodec || media?.videoCodec || '').toUpperCase();
    const videoResolution = media?.videoResolution ? String(media.videoResolution).toUpperCase() : '';
    const videoFormat = joinParts(videoCodec || undefined, videoResolution || undefined);
    const videoLabel = `${videoDecision}${videoFormat ? ` (${videoFormat})` : ''}`;
    const audioCodec = (transcode?.audioCodec || media?.audioCodec || selectedAudio?.codec || '').toUpperCase();
    const audioChannels = toNumber(media?.audioChannels ?? selectedAudio?.channels);
    const audioLang =
      selectedAudio?.languageTag ||
      selectedAudio?.language ||
      selectedAudio?.displayTitle ||
      selectedAudio?.title ||
      'Unknown';
    const audioChannelLabel = audioChannels ? toAudioChannelLabel(audioChannels) : '';
    const audioLabel = `${audioDecision} (${toDisplayLanguage(audioLang)}${audioCodec ? ` - ${audioCodec}` : ''}${audioChannelLabel ? ` ${audioChannelLabel}` : ''})`;
    const subtitleLabel =
      selectedSubtitle?.displayTitle ||
      selectedSubtitle?.title ||
      (selectedSubtitle ? subtitleDecision : 'None');

    const sourceContainerRaw = part?.Container || part?.container || media?.container;
    const targetContainerRaw = transcode?.container;
    const sourceContainer = sourceContainerRaw ? String(sourceContainerRaw).toUpperCase() : '';
    const targetContainer = targetContainerRaw ? String(targetContainerRaw).toUpperCase() : '';
    const containerLabel = hasTranscodeSession
      ? sourceContainer && targetContainer && sourceContainer !== targetContainer
        ? `Converting (${sourceContainer} -> ${targetContainer})`
        : targetContainer
          ? `Transcode (${targetContainer})`
          : sourceContainer
            ? `Transcode (${sourceContainer})`
            : 'Transcode'
      : `${streamDecision}${sourceContainer ? ` (${sourceContainer})` : ''}`;

    const playerProduct = toPlayerProductLabel(item.Player?.product, item.Player?.platform);
    const locationPrefix = item.Player?.local === true || Number(item.Player?.local ?? 0) === 1 ? 'LAN' : 'WAN';
    const locationLabel = item.Player?.address ? `${locationPrefix}: ${item.Player.address}` : locationPrefix;

    const posterPath =
      item.type === 'episode'
        ? item.grandparentThumb || item.thumb
        : item.thumb || item.grandparentThumb;
    const backgroundPath = item.art || item.grandparentArt;

    const details: PlexNowPlayingField[] = [
      { label: 'Product', value: playerProduct || 'Unknown' },
      { label: 'Player', value: item.Player?.title || 'Unknown' },
      { label: 'Quality', value: qualityLabel },
      { label: 'Stream', value: streamDecision },
      { label: 'Container', value: containerLabel },
      { label: 'Video', value: videoLabel || videoDecision },
      { label: 'Audio', value: audioLabel },
      { label: 'Subtitle', value: subtitleLabel || 'None' },
      { label: 'Location', value: locationLabel },
      { label: 'Bandwidth', value: bandwidthLabel || originalBitrateLabel || 'Unknown' }
    ];

    return {
      id: ratingKey,
      title,
      year,
      user,
      posterUrl: buildMediaImageProxyUrl(options.widgetId, 'plex', posterPath),
      backgroundUrl: buildMediaImageProxyUrl(options.widgetId, 'plex', backgroundPath),
      progressPercent,
      elapsed: formatDuration(viewOffsetMs),
      duration: formatDuration(durationMs),
      eta: formatEta(remainingMs),
      details
    };
  });

  return { sessions };
};
