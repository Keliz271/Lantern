import { env } from '$env/dynamic/private';
import { canFallbackToEnvSecret } from '$serverlib/security';

type QbittorrentTorrent = {
  hash?: string;
  name?: string;
  state?: string;
  progress?: number;
  dlspeed?: number;
  upspeed?: number;
  eta?: number;
  added_on?: number;
  completion_on?: number;
  time_active?: number;
};

type QbittorrentMetricResult = {
  value: number | string;
  label: string;
  unit?: string;
};
type QbittorrentMetricMap = Record<QbittorrentMetricType, QbittorrentMetricResult>;

type QbittorrentOptions = {
  baseUrl?: string;
  username?: string;
  password?: string;
};

type QbittorrentConnection = {
  baseUrl: string;
  username?: string;
  password?: string;
};

export type QbittorrentMetricType = 'leech' | 'download' | 'seed' | 'upload';

export type QbittorrentQueueItem = {
  id: string;
  name: string;
  status: string;
  progress: number;
  eta: string;
};

export type QbittorrentHistoryItem = {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'unknown';
  duration: string;
  completedAt: string;
};

export type QbittorrentOverview = {
  speed: string;
  elapsed: string;
  queue: QbittorrentQueueItem[];
  history: QbittorrentHistoryItem[];
};

const normalizeBase = (value?: string) => {
  if (!value) return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const normalizeOptional = (value?: string) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || undefined;
};

const formatByteRate = (value: number) => {
  const safe = Math.max(0, Number(value ?? 0));
  if (safe === 0) return '0 B/s';
  const units = ['B/s', 'KiB/s', 'MiB/s', 'GiB/s'];
  let size = safe;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2).replace(/\.00$/, '')} ${units[unitIndex]}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatDurationSeconds = (totalSeconds: number) => {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

const formatEta = (seconds: number | undefined) => {
  const safe = Number(seconds ?? -1);
  if (!Number.isFinite(safe) || safe < 0) return 'Unknown';
  if (safe === 0) return 'Done';
  if (safe >= 8640000) return '∞';
  return formatDurationSeconds(safe);
};

const formatTimeAgo = (epochSeconds: number | undefined) => {
  const safe = Number(epochSeconds ?? 0);
  if (!Number.isFinite(safe) || safe <= 0) return 'Unknown';
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000 - safe));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
};

const formatState = (state: string | undefined) => {
  const raw = String(state ?? '').trim();
  if (!raw) return 'Queued';
  const spaced = raw.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

const isCompletedState = (state: string) =>
  [
    'uploading',
    'stalledup',
    'forcedup',
    'pausedup',
    'checkingup',
    'queuedup'
  ].includes(state);

const isErrorState = (state: string) =>
  ['error', 'missingfiles'].includes(state);

const isQueueState = (state: string) =>
  [
    'downloading',
    'forceddl',
    'metadl',
    'stalleddl',
    'pauseddl',
    'queueddl',
    'checkingdl',
    'allocating'
  ].includes(state);

const withTimeout = async <T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const login = async (baseUrl: string, username: string, password: string) => {
  const body = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

  const response = await withTimeout((signal) =>
    fetch(`${baseUrl}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'manual',
      cache: 'no-store',
      signal
    })
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`qBittorrent login failed with status ${response.status}`);
  }
  if (text.trim() !== 'Ok.') {
    throw new Error('qBittorrent rejected credentials');
  }

  const cookieHeader = response.headers.get('set-cookie');
  if (!cookieHeader) {
    throw new Error('qBittorrent login did not return a session cookie');
  }

  return cookieHeader.split(';')[0] ?? '';
};

const fetchTorrents = async (baseUrl: string, cookie?: string) => {
  const response = await withTimeout((signal) =>
    fetch(`${baseUrl}/api/v2/torrents/info`, {
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        Accept: 'application/json'
      },
      redirect: 'manual',
      cache: 'no-store',
      signal
    })
  );

  if (!response.ok) {
    throw new Error(`qBittorrent API error (${response.status})`);
  }

  return (await response.json()) as QbittorrentTorrent[];
};

const resolveConnection = (options: QbittorrentOptions = {}): QbittorrentConnection => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(env.QBITTORRENT_URL);
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);

  const usernameOverride = normalizeOptional(options.username);
  const passwordOverride = normalizeOptional(options.password);
  const allowEnvSecrets = canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl);
  const username =
    usernameOverride ?? (allowEnvSecrets ? normalizeOptional(env.QBITTORRENT_USERNAME) : undefined);
  const password =
    passwordOverride ?? (allowEnvSecrets ? normalizeOptional(env.QBITTORRENT_PASSWORD) : undefined);
  if (!baseUrl) {
    throw new Error('qBittorrent base URL is missing');
  }
  return { baseUrl, username, password };
};

const fetchAccessibleTorrents = async ({
  baseUrl,
  username,
  password
}: QbittorrentConnection): Promise<QbittorrentTorrent[]> => {
  if (username && password) {
    const cookie = await login(baseUrl, username, password);
    return fetchTorrents(baseUrl, cookie);
  }
  try {
    return await fetchTorrents(baseUrl);
  } catch {
    throw new Error(
      `qBittorrent auth required or endpoint unreachable at ${baseUrl}. Set username/password in widget or .env.`
    );
  }
};

export const fetchQbittorrentStats = async (
  options: QbittorrentOptions = {}
): Promise<QbittorrentMetricMap> => {
  const connection = resolveConnection(options);
  const torrents = await fetchAccessibleTorrents(connection);

  let completed = 0;
  let rateDl = 0;
  let rateUl = 0;

  torrents.forEach((torrent) => {
    const progress = Number(torrent.progress ?? 0);
    if (progress >= 1) completed += 1;
    rateDl += Number(torrent.dlspeed ?? 0);
    rateUl += Number(torrent.upspeed ?? 0);
  });

  const leech = Math.max(0, torrents.length - completed);

  return {
    leech: { value: leech, label: 'Leech' },
    download: { value: formatByteRate(rateDl), label: 'Download' },
    seed: { value: completed, label: 'Seed' },
    upload: { value: formatByteRate(rateUl), label: 'Upload' }
  };
};

export const fetchQbittorrentOverview = async (
  options: QbittorrentOptions = {}
): Promise<QbittorrentOverview> => {
  const connection = resolveConnection(options);
  const torrents = await fetchAccessibleTorrents(connection);

  const queueCandidates = torrents.filter((torrent) => {
    const state = String(torrent.state ?? '').toLowerCase();
    return isQueueState(state);
  });
  const queue = queueCandidates.map((torrent, index) => {
    const progressPct = clamp(Math.round(Number(torrent.progress ?? 0) * 100), 0, 100);
    return {
      id: String(torrent.hash ?? `queue-${index}`),
      name: String(torrent.name ?? 'Unknown'),
      status: formatState(torrent.state),
      progress: progressPct,
      eta: formatEta(Number(torrent.eta))
    };
  });

  const historyCandidates = torrents.filter((torrent) => {
    const state = String(torrent.state ?? '').toLowerCase();
    return isCompletedState(state) || isErrorState(state);
  });
  const history = historyCandidates
    .map((torrent, index) => {
      const state = String(torrent.state ?? '').toLowerCase();
      const status: 'success' | 'failed' | 'unknown' = isCompletedState(state)
        ? 'success'
        : isErrorState(state)
          ? 'failed'
          : 'unknown';
      const completionOn = Number(torrent.completion_on ?? 0);
      const activeSeconds = Number(torrent.time_active ?? 0);
      const addedOn = Number(torrent.added_on ?? 0);
      const derivedDuration =
        activeSeconds > 0
          ? activeSeconds
          : completionOn > 0 && addedOn > 0
            ? Math.max(0, completionOn - addedOn)
            : 0;
      return {
        id: String(torrent.hash ?? `history-${index}`),
        name: String(torrent.name ?? 'Unknown'),
        status,
        duration: derivedDuration > 0 ? formatDurationSeconds(derivedDuration) : 'Unknown',
        completedAt: formatTimeAgo(completionOn)
      };
    })
    .sort((a, b) => {
      const left = Number(historyCandidates.find((torrent) => String(torrent.hash ?? '') === a.id)?.completion_on ?? 0);
      const right = Number(historyCandidates.find((torrent) => String(torrent.hash ?? '') === b.id)?.completion_on ?? 0);
      return right - left;
    });

  const totalDownloadSpeed = queueCandidates.reduce(
    (sum, torrent) => sum + Number(torrent.dlspeed ?? 0),
    0
  );
  const activeStart = queueCandidates.reduce((minValue, torrent) => {
    const addedOn = Number(torrent.added_on ?? 0);
    if (!Number.isFinite(addedOn) || addedOn <= 0) return minValue;
    if (minValue <= 0) return addedOn;
    return Math.min(minValue, addedOn);
  }, 0);
  const elapsedSeconds =
    activeStart > 0 ? Math.max(0, Math.floor(Date.now() / 1000 - activeStart)) : 0;

  return {
    speed: formatByteRate(totalDownloadSpeed),
    elapsed: formatDurationSeconds(elapsedSeconds),
    queue,
    history
  };
};

export const fetchQbittorrentMetric = async (
  metric: QbittorrentMetricType,
  options: QbittorrentOptions = {}
): Promise<QbittorrentMetricResult> => {
  const stats = await fetchQbittorrentStats(options);
  return stats[metric];
};
