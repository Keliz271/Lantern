const DASHBOARD_ICON_BASE = 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/svg';

const SOURCE_ICON_SLUG: Record<string, string> = {
  radarr: 'radarr',
  sonarr: 'sonarr',
  readarr: 'readarr',
  audiobookshelf: 'audiobookshelf',
  sabnzbd: 'sabnzbd',
  qbittorrent: 'qbittorrent',
  technitium: 'technitium',
  'home-assistant': 'home-assistant',
  scrutiny: 'scrutiny',
  tandoor: 'tandoor-recipes',
  'speedtest-tracker': 'speedtest-tracker',
  prowlarr: 'prowlarr',
  profilarr: 'profilarr',
  grafana: 'grafana',
  plex: 'plex',
  seerr: 'jellyseerr',
  'seerr-requests': 'jellyseerr',
  'media-history': 'plex',
  komodo: 'komodo',
  'service-hub': 'uptime-kuma'
};

const SOURCE_ICON_URL_OVERRIDE: Record<string, string> = {
  technitium: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/technitium.png',
  'speedtest-tracker': 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/ookla-speedtest.svg'
};

const SOURCE_SUBTITLE: Record<string, string> = {
  radarr: 'Movie management',
  sonarr: 'TV management',
  readarr: 'Book management',
  audiobookshelf: 'Audio library',
  sabnzbd: 'Usenet downloads',
  qbittorrent: 'Torrent activity',
  technitium: 'DNS server',
  'home-assistant': 'Home automation',
  scrutiny: 'Drive health',
  tandoor: 'Recipe manager',
  'speedtest-tracker': 'Network speed',
  prowlarr: 'Indexer manager',
  profilarr: 'Profile sync manager',
  grafana: 'Lantern graphs',
  plex: 'Media server',
  seerr: 'Media requests',
  'seerr-requests': 'Latest requests',
  'media-history': 'Watch history',
  komodo: 'Stack monitoring',
  'service-hub': 'Endpoint monitoring'
};

const STACK_ICON_OVERRIDES: Record<string, string> = {
  'ha-time-machine': 'home-assistant',
  databasus: 'postgresql',
  'dovi-convert': 'docker'
};

const toSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const getDashboardIconUrlBySlug = (slug?: string) => {
  if (!slug) return undefined;
  return `${DASHBOARD_ICON_BASE}/${slug}.svg`;
};

export const getSourceIconUrl = (source?: string) => {
  if (!source) return undefined;
  const overrideUrl = SOURCE_ICON_URL_OVERRIDE[source];
  if (overrideUrl) return overrideUrl;
  const slug = SOURCE_ICON_SLUG[source];
  return getDashboardIconUrlBySlug(slug);
};

export const getSourceSubtitle = (source?: string) => {
  if (!source) return '';
  return SOURCE_SUBTITLE[source] ?? '';
};

export const getStackIconUrl = (stackName?: string) => {
  if (!stackName) return undefined;
  const trimmed = stackName.trim().toLowerCase();
  const preferred = STACK_ICON_OVERRIDES[trimmed];
  if (preferred) return getDashboardIconUrlBySlug(preferred);

  const base = toSlug(stackName);
  if (!base) return undefined;

  const candidates = [
    base,
    base.replace(/_/g, '-'),
    base.replace(/-/g, ''),
    `${base}-icon`
  ];

  const slug = candidates.find((candidate) => candidate.length > 0);
  return getDashboardIconUrlBySlug(slug);
};
