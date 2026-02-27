import { env } from '$env/dynamic/private';
import { fetchJson } from './http';
import { canFallbackToEnvSecret } from '$serverlib/security';

type ProfilarrTask = {
  type?: string;
  last_run?: string;
  status?: string;
};

type ProfilarrCommit = {
  date?: string;
};

type ProfilarrCommitsPayload = {
  data?: {
    local_commits?: ProfilarrCommit[];
  };
};

type ProfilarrGitStatusPayload = {
  data?: {
    commits_ahead?: number;
    commits_behind?: number;
  };
};

type ProfilarrArrConfig = {
  data_to_sync?: {
    profiles?: string[];
  };
};

type ProfilarrArrConfigPayload = {
  data?: ProfilarrArrConfig[];
};

type ProfilarrCustomFormatPayload =
  | Array<unknown>
  | {
      data?: unknown[];
    };

type ProfilarrOptions = {
  baseUrl?: string;
  apiKey?: string;
};

export type ProfilarrMetricType =
  | 'lastRepoSync'
  | 'lastCommit'
  | 'syncedProfiles'
  | 'failedSyncTasks24h'
  | 'lastSyncStatus'
  | 'commitsBehindAhead'
  | 'customFormats';

type ProfilarrMetricResult = {
  value: number | string;
  label: string;
};

type ProfilarrMetricMap = Record<ProfilarrMetricType, ProfilarrMetricResult>;

const normalizeBase = (value?: string) => {
  if (!value) return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const normalizeDateDisplay = (value?: string) => {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Unknown';
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return raw;
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

const toHeaders = (apiKey: string) => ({
  Accept: 'application/json',
  'X-API-Key': apiKey
});

const normalizeStatus = (value?: string) => {
  const raw = String(value ?? '').trim();
  if (!raw) return 'Unknown';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
};

const toTimestamp = (value?: string) => {
  const raw = String(value ?? '').trim();
  if (!raw) return Number.NaN;
  const parsed = new Date(raw);
  return parsed.getTime();
};

export const fetchProfilarrStats = async (
  options: ProfilarrOptions = {}
): Promise<ProfilarrMetricMap> => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(env.PROFILARR_URL);
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const apiKeyOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const apiKey =
    apiKeyOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? String(env.PROFILARR_API_KEY ?? '').trim() : '');

  if (!baseUrl || !apiKey) {
    throw new Error('Profilarr base URL or API key is missing');
  }

  const [tasks, commitsPayload, gitStatusPayload, arrConfigPayload, customFormatsPayload] =
    await Promise.all([
    fetchJson<ProfilarrTask[]>(`${baseUrl}/api/tasks`, { headers: toHeaders(apiKey) }),
    fetchJson<ProfilarrCommitsPayload>(`${baseUrl}/api/git/commits`, {
      headers: toHeaders(apiKey)
    }),
    fetchJson<ProfilarrGitStatusPayload>(`${baseUrl}/api/git/status`, {
      headers: toHeaders(apiKey)
    }),
    fetchJson<ProfilarrArrConfigPayload>(`${baseUrl}/api/arr/config`, {
      headers: toHeaders(apiKey)
    }),
    fetchJson<ProfilarrCustomFormatPayload>(`${baseUrl}/api/data/custom_format`, {
      headers: toHeaders(apiKey)
    })
  ]);

  const syncTask = (Array.isArray(tasks) ? tasks : []).find(
    (task) => String(task.type ?? '').toLowerCase() === 'sync'
  );
  const lastRepoSync = normalizeDateDisplay(syncTask?.last_run);
  const lastSyncStatus = normalizeStatus(syncTask?.status);

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const failedSyncTasks24h = (Array.isArray(tasks) ? tasks : []).filter((task) => {
    if (String(task.type ?? '').toLowerCase() !== 'sync') return false;
    const status = String(task.status ?? '').toLowerCase();
    if (!status || status === 'success') return false;
    const timestamp = toTimestamp(task.last_run);
    if (!Number.isFinite(timestamp)) return false;
    return now - timestamp <= oneDayMs;
  }).length;

  const localCommits = Array.isArray(commitsPayload?.data?.local_commits)
    ? commitsPayload.data.local_commits
    : [];
  const latestCommitDate = normalizeDateDisplay(localCommits[0]?.date);
  const commitsAhead = Number(gitStatusPayload?.data?.commits_ahead ?? 0);
  const commitsBehind = Number(gitStatusPayload?.data?.commits_behind ?? 0);
  const commitsBehindAhead = `↓${Number.isFinite(commitsBehind) ? commitsBehind : 0} / ↑${Number.isFinite(commitsAhead) ? commitsAhead : 0}`;

  const arrConfigs = Array.isArray(arrConfigPayload?.data) ? arrConfigPayload.data : [];
  const syncedProfiles = arrConfigs.reduce((count, config) => {
    const profiles = Array.isArray(config.data_to_sync?.profiles)
      ? config.data_to_sync?.profiles
      : [];
    return count + profiles.length;
  }, 0);

  const customFormats = Array.isArray(customFormatsPayload)
    ? customFormatsPayload.length
    : Array.isArray(customFormatsPayload?.data)
      ? customFormatsPayload.data.length
      : 0;

  return {
    lastRepoSync: { value: lastRepoSync, label: 'Last Repo Sync' },
    lastCommit: { value: latestCommitDate, label: 'Last Commit' },
    syncedProfiles: { value: syncedProfiles, label: 'Synced Profiles' },
    failedSyncTasks24h: { value: failedSyncTasks24h, label: 'Failed Sync (24h)' },
    lastSyncStatus: { value: lastSyncStatus, label: 'Last Sync Status' },
    commitsBehindAhead: { value: commitsBehindAhead, label: 'Commits (Behind/Ahead)' },
    customFormats: { value: customFormats, label: 'Custom Formats' }
  };
};

export const fetchProfilarrMetric = async (
  metric: ProfilarrMetricType,
  options: ProfilarrOptions = {}
): Promise<ProfilarrMetricResult> => {
  const stats = await fetchProfilarrStats(options);
  return stats[metric];
};
