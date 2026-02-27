import { env } from '$env/dynamic/private';
import { fetchJson } from './http';
import { getStackIconUrl } from '$lib/shared/dashboardIcons';
import { canFallbackToEnvSecret } from '$serverlib/security';

type KomodoStack = {
  id?: string;
  name?: string;
  info?: {
    state?: string;
    server_id?: string;
  };
};

type KomodoServer = {
  id?: string;
  name?: string;
};

type KomodoServiceData = {
  summary: {
    total: number;
    running: number;
    issues: number;
    stopped: number;
    down: number;
    unhealthy: number;
    unknown: number;
    servers: number;
  };
  items: Array<{
    name: string;
    status: 'ok' | 'warn' | 'down';
    detail?: string;
    href?: string;
    icon?: string;
  }>;
};

type KomodoCredentials = {
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
};

const mapState = (state: string | undefined): 'ok' | 'warn' | 'down' => {
  switch ((state ?? '').toLowerCase()) {
    case 'running':
    case 'deploying':
    case 'created':
      return 'ok';
    case 'paused':
      return 'warn';
    case 'down':
    case 'stopped':
      return 'warn';
    case 'unhealthy':
      return 'down';
    case 'unknown':
      return 'down';
    default:
      return 'down';
  }
};

const resolveOverrideIcon = (name: string | undefined, overrides?: Record<string, string>) => {
  if (!name || !overrides) return '';
  const direct = overrides[name];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const lower = name.toLowerCase();
  const match = Object.entries(overrides).find(
    ([key, value]) => key.toLowerCase() === lower && typeof value === 'string' && value.trim()
  );
  return match?.[1]?.trim() ?? '';
};

const postKomodo = async <T>(
  type: string,
  params: Record<string, unknown> = {},
  credentials?: KomodoCredentials
) => {
  const overrideBaseUrl = credentials?.baseUrl?.trim() ?? '';
  const envBaseUrl = String(env.KOMODO_URL ?? '').trim();
  const baseUrl = overrideBaseUrl || envBaseUrl;
  const allowEnvSecrets = canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl);
  const apiKey =
    credentials?.apiKey?.trim() ||
    (allowEnvSecrets ? String(env.KOMODO_API_KEY ?? '').trim() : '');
  const apiSecret =
    credentials?.apiSecret?.trim() ||
    (allowEnvSecrets ? String(env.KOMODO_API_SECRET ?? '').trim() : '');

  if (!baseUrl || !apiKey || !apiSecret) {
    throw new Error('Komodo environment variables are missing');
  }

  const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const url = `${trimmedBase}/read`;
  return fetchJson<T>(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'X-Api-Secret': apiSecret
    },
    body: JSON.stringify({ type, params })
  });
};

export const fetchKomodoStacks = async (
  iconOverrides?: Record<string, string>,
  credentials?: KomodoCredentials
): Promise<KomodoServiceData> => {
  const rawBase = credentials?.baseUrl?.trim() || env.KOMODO_URL || '';
  const baseUrl = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;
  const stacks = await postKomodo<KomodoStack[]>('ListStacks', {}, credentials);
  const servers = await postKomodo<KomodoServer[]>('ListServers', {}, credentials);

  const serverMap = new Map<string, string>();
  const seenServerIds = new Set<string>();
  servers.forEach((server) => {
    if (server.id && server.name) {
      serverMap.set(server.id, server.name);
    }
  });

  let running = 0;
  let stopped = 0;
  let down = 0;
  let unhealthy = 0;
  let unknown = 0;
  let issues = 0;

  const items = stacks.map((stack) => {
    const rawState = (stack.info?.state ?? '').toLowerCase();
    if (['running', 'deploying', 'created'].includes(rawState)) {
      running += 1;
    } else if (['stopped', 'paused'].includes(rawState)) {
      stopped += 1;
    } else if (rawState === 'down') {
      down += 1;
    } else if (rawState === 'unhealthy') {
      unhealthy += 1;
    } else {
      unknown += 1;
    }

    const status = mapState(stack.info?.state);
    const serverName = stack.info?.server_id ? serverMap.get(stack.info.server_id) : '';
    if (stack.info?.server_id) {
      seenServerIds.add(stack.info.server_id);
    }
    const overrideIcon = resolveOverrideIcon(stack.name, iconOverrides);
    return {
      name: stack.name ?? 'Unnamed',
      status,
      detail: serverName ? `Server: ${serverName}` : undefined,
      href: stack.id ? `${baseUrl}/stacks/${stack.id}` : undefined,
      icon: overrideIcon || getStackIconUrl(stack.name)
    };
  });

  return {
    summary: {
      total: stacks.length,
      running,
      issues: stopped + down + unhealthy,
      stopped,
      down,
      unhealthy,
      unknown,
      servers: seenServerIds.size
    },
    items
  };
};
