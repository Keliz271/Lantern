import { env } from '$env/dynamic/private';
import { fetchJson } from './http';
import { canFallbackToEnvSecret } from '$serverlib/security';

type SabnzbdQueuePayload = {
  queue?: {
    speed?: string;
    kbpersec?: string | number;
    noofslots?: string | number;
    timeleft?: string;
    status?: string;
    slots?: Array<Record<string, unknown>>;
  };
};

type SabnzbdHistoryPayload = {
  history?: {
    slots?: Array<Record<string, unknown>>;
  };
};

type SabnzbdMetricResult = {
  value: number | string;
  label: string;
};
type SabnzbdMetricMap = Record<SabnzbdMetricType, SabnzbdMetricResult>;

type SabnzbdOptions = {
  baseUrl?: string;
  apiKey?: string;
};

export type SabnzbdMetricType = 'rate' | 'queue' | 'timeleft';

export type SabnzbdQueueItem = {
  id: string;
  name: string;
  status: string;
  progress: number;
  eta: string;
};

export type SabnzbdHistoryItem = {
  id: string;
  name: string;
  status: 'success' | 'failed' | 'unknown';
  duration: string;
  completedAt: string;
};

export type SabnzbdOverview = {
  speed: string;
  elapsed: string;
  queue: SabnzbdQueueItem[];
  history: SabnzbdHistoryItem[];
};

const normalizeBase = (value?: string) => {
  if (!value) return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const toNumber = (value: unknown) => {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
};

const toString = (value: unknown) => String(value ?? '').trim();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatTimeAgo = (isoOrEpoch: unknown) => {
  const value = toString(isoOrEpoch);
  if (!value) return 'Unknown';
  const asEpoch = Number(value);
  const date = Number.isFinite(asEpoch) && asEpoch > 0 ? new Date(asEpoch * 1000) : new Date(value);
  const time = date.getTime();
  if (!Number.isFinite(time)) return value;
  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
};

const deriveDuration = (slot: Record<string, unknown>) => {
  const direct = toString(slot.download_time);
  if (direct) return direct;
  const seconds = Number(slot.download_time_seconds ?? slot.time_downloaded ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Unknown';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
};

export const fetchSabnzbdStats = async (
  options: SabnzbdOptions = {}
): Promise<SabnzbdMetricMap> => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(env.SABNZBD_URL);
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? String(env.SABNZBD_API_KEY ?? '').trim() : '');

  if (!baseUrl || !apiKey) {
    throw new Error('SABnzbd base URL or API key is missing');
  }

  const payload = await fetchJson<SabnzbdQueuePayload>(
    `${baseUrl}/api/?apikey=${encodeURIComponent(apiKey)}&output=json&mode=queue`,
    {
      headers: { Accept: 'application/json' }
    }
  );
  const queue = payload.queue ?? {};

  const speed = typeof queue.speed === 'string' && queue.speed.trim() ? queue.speed : '';
  const kbps = toNumber(queue.kbpersec);
  return {
    rate: { value: speed || `${kbps.toFixed(1)} KB/s`, label: 'Rate' },
    queue: { value: toNumber(queue.noofslots), label: 'Queue' },
    timeleft: { value: queue.timeleft ?? '0:00:00', label: 'Time Left' }
  };
};

export const fetchSabnzbdOverview = async (
  options: SabnzbdOptions = {}
): Promise<SabnzbdOverview> => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(env.SABNZBD_URL);
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? String(env.SABNZBD_API_KEY ?? '').trim() : '');

  if (!baseUrl || !apiKey) {
    throw new Error('SABnzbd base URL or API key is missing');
  }

  const [queuePayload, historyPayload] = await Promise.all([
    fetchJson<SabnzbdQueuePayload>(
      `${baseUrl}/api/?apikey=${encodeURIComponent(apiKey)}&output=json&mode=queue`,
      { headers: { Accept: 'application/json' } }
    ),
    fetchJson<SabnzbdHistoryPayload>(
      `${baseUrl}/api/?apikey=${encodeURIComponent(apiKey)}&output=json&mode=history`,
      { headers: { Accept: 'application/json' } }
    )
  ]);

  const queue = queuePayload.queue ?? {};
  const queueSlots = Array.isArray(queue.slots) ? queue.slots : [];
  const historySlots = Array.isArray(historyPayload.history?.slots) ? historyPayload.history?.slots : [];

  const speed = toString(queue.speed) || `${toNumber(queue.kbpersec).toFixed(1)} KB/s`;
  const elapsed = toString(queue.timeleft) || '0:00:00';

  const queueItems: SabnzbdQueueItem[] = queueSlots.map((slot, index) => {
    const percentRaw = Number(slot.percentage ?? slot.percent ?? slot.progress ?? 0);
    const progress = clamp(Number.isFinite(percentRaw) ? percentRaw : 0, 0, 100);
    return {
      id: toString(slot.nzo_id) || `queue-${index}`,
      name: toString(slot.filename || slot.name) || 'Unknown',
      status: toString(slot.status) || 'Queued',
      progress,
      eta: toString(slot.timeleft || slot.eta) || 'Unknown'
    };
  });

  const historyItems: SabnzbdHistoryItem[] = historySlots.map((slot, index) => {
    const statusText = toString(slot.status).toLowerCase();
    const status: 'success' | 'failed' | 'unknown' = statusText.includes('completed')
      ? 'success'
      : statusText.includes('fail')
        ? 'failed'
        : 'unknown';
    return {
      id: toString(slot.nzo_id) || `history-${index}`,
      name: toString(slot.name || slot.filename) || 'Unknown',
      status,
      duration: deriveDuration(slot),
      completedAt: formatTimeAgo(slot.completed || slot.completed_at || slot.completedat)
    };
  });

  return {
    speed,
    elapsed,
    queue: queueItems,
    history: historyItems
  };
};

export const fetchSabnzbdMetric = async (
  metric: SabnzbdMetricType,
  options: SabnzbdOptions = {}
): Promise<SabnzbdMetricResult> => {
  const stats = await fetchSabnzbdStats(options);
  return stats[metric];
};
