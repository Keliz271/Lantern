import { env } from '$env/dynamic/private';
import { fetchJson } from './http';

export type DockerServers = Record<string, string>;

export type DockerContainer = {
  Id?: string;
  Names?: string[];
  State?: string;
  Status?: string;
  Image?: string;
};

export const getDockerServers = (): DockerServers => {
  const raw = env.DOCKER_SERVERS ?? '';
  const servers: DockerServers = {};

  raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [key, ...rest] = entry.split('=');
      const name = key?.trim();
      const url = rest.join('=').trim();
      if (!name || !url) return;
      servers[name] = url.endsWith('/') ? url.slice(0, -1) : url;
    });

  return servers;
};

export const getDefaultDockerServer = (servers: DockerServers): string => {
  const preferred = env.DOCKER_DEFAULT_SERVER;
  if (preferred && servers[preferred]) return preferred;
  return Object.keys(servers)[0] ?? '';
};

export const fetchDockerContainers = async (baseUrl: string): Promise<DockerContainer[]> => {
  const normalized = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const url = `${normalized}/containers/json?all=1`;
  return fetchJson<DockerContainer[]>(url);
};

const normalizeName = (value: string) => value.replace(/^\//, '').toLowerCase();

const nameMatchesTarget = (name: string, target: string) => {
  if (!name || !target) return false;
  if (name === target) return true;

  if (name.startsWith(`${target}-`) || name.endsWith(`-${target}`)) return true;
  if (name.startsWith(`${target}_`) || name.endsWith(`_${target}`)) return true;

  const segments = name.split(/[-_.]/g).filter(Boolean);
  if (segments.includes(target)) return true;

  return false;
};

export const resolveContainerHealth = (
  containers: DockerContainer[],
  containerName: string
): 'healthy' | 'unhealthy' | 'unknown' => {
  const target = normalizeName(containerName);
  if (!target) return 'unknown';

  const match = containers.find((container) => {
    const names = (container.Names ?? []).map(normalizeName);
    return names.some((name) => nameMatchesTarget(name, target));
  });

  if (!match) return 'unknown';

  const status = (match.Status ?? '').toLowerCase();
  const state = (match.State ?? '').toLowerCase();

  if (status.includes('(unhealthy)')) return 'unhealthy';
  if (status.includes('(healthy)')) return 'healthy';
  if (state === 'running') return 'healthy';
  if (state) return 'unhealthy';

  return 'unknown';
};
