import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

const LANTERN_REALM = 'Lantern';

const readPrivateEnv = (key: string, legacyKey?: string) =>
  privateEnv[key] ?? (legacyKey ? privateEnv[legacyKey] : undefined);

const splitCsv = (raw: string) =>
  raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const firstCsvValue = (raw: string) => raw.split(',')[0]?.trim() ?? '';

const stripTrailingDot = (value: string) => value.replace(/\.+$/, '');

const normalizeHost = (value: string) => stripTrailingDot(value.trim().toLowerCase());

const normalizeHostWithOptionalPort = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return { host: '', port: '' };

  if (trimmed.startsWith('[')) {
    const closeIndex = trimmed.indexOf(']');
    if (closeIndex < 0) return { host: '', port: '' };
    const host = normalizeHost(trimmed.slice(1, closeIndex));
    const portPart = trimmed.slice(closeIndex + 1).trim();
    const port = portPart.startsWith(':') ? portPart.slice(1).trim() : '';
    return { host, port };
  }

  const parts = trimmed.split(':');
  if (parts.length === 1) return { host: normalizeHost(trimmed), port: '' };
  if (parts.length === 2) return { host: normalizeHost(parts[0] ?? ''), port: (parts[1] ?? '').trim() };
  // IPv6 without brackets is invalid for host:port usage here.
  return { host: '', port: '' };
};
const stripIPv6Brackets = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return trimmed.slice(1, -1);
  return trimmed;
};

const isIPv4 = (host: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(host);

const parseIPv4 = (host: string) => {
  if (!isIPv4(host)) return null;
  const octets = host.split('.').map((part) => Number(part));
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return octets;
};

const parseIPv6ToWords = (host: string) => {
  const raw = stripIPv6Brackets(normalizeHost(host));
  if (isIP(raw) !== 6) return null;

  const zoneIndex = raw.indexOf('%');
  const withoutZone = zoneIndex >= 0 ? raw.slice(0, zoneIndex) : raw;
  const collapsed = withoutZone.toLowerCase();
  const [leftRaw, rightRaw = ''] = collapsed.split('::');
  const left = leftRaw ? leftRaw.split(':').filter((part) => part.length > 0) : [];
  const right = rightRaw ? rightRaw.split(':').filter((part) => part.length > 0) : [];

  const parsePart = (part: string): number[] | null => {
    if (part.includes('.')) {
      const octets = parseIPv4(part);
      if (!octets) return null;
      return [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
    }
    const parsed = Number.parseInt(part, 16);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0xffff) return null;
    return [parsed];
  };

  const leftWords: number[] = [];
  for (const part of left) {
    const parsed = parsePart(part);
    if (!parsed) return null;
    leftWords.push(...parsed);
  }

  const rightWords: number[] = [];
  for (const part of right) {
    const parsed = parsePart(part);
    if (!parsed) return null;
    rightWords.push(...parsed);
  }

  if (leftWords.length + rightWords.length > 8) return null;
  const gap = 8 - (leftWords.length + rightWords.length);
  if (!collapsed.includes('::') && gap !== 0) return null;

  return [...leftWords, ...new Array(gap).fill(0), ...rightWords];
};

const isPrivateIPv4 = (host: string) => {
  const octets = parseIPv4(host);
  if (!octets) return false;
  if (octets[0] === 10) return true;
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;
  return false;
};

const isPrivateIPv6Literal = (host: string) => {
  const words = parseIPv6ToWords(host);
  if (!words) return false;
  const first = words[0] ?? 0;
  // fc00::/7
  if ((first & 0xfe00) === 0xfc00) return true;
  // fe80::/10
  if ((first & 0xffc0) === 0xfe80) return true;
  // ::1/128
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return true;
  // IPv4-mapped IPv6 ::ffff:x.x.x.x
  if (
    words[0] === 0 &&
    words[1] === 0 &&
    words[2] === 0 &&
    words[3] === 0 &&
    words[4] === 0 &&
    words[5] === 0xffff
  ) {
    const octets = [
      (words[6] >> 8) & 0xff,
      words[6] & 0xff,
      (words[7] >> 8) & 0xff,
      words[7] & 0xff
    ];
    const mapped = `${octets[0]}.${octets[1]}.${octets[2]}.${octets[3]}`;
    if (isBlockedHost(mapped) || isPrivateIPv4(mapped)) return true;
  }
  return false;
};

const isPrivateLiteralHost = (host: string) =>
  isPrivateIPv4(host) || isPrivateIPv6Literal(host);

const isBlockedHost = (host: string) => {
  const normalized = normalizeHost(stripIPv6Brackets(host));
  if (!normalized) return true;
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (normalized === '::1' || normalized === '::') return true;
  if (isPrivateIPv6Literal(normalized)) return true;

  const octets = parseIPv4(normalized);
  if (!octets) return false;

  // Keep local/private service monitoring intact while blocking local-loopback and metadata ranges.
  if (octets[0] === 127) return true;
  if (octets[0] === 0) return true;
  if (octets[0] === 169 && octets[1] === 254) return true;
  return false;
};

const parseHostsFromExecutionNodes = (raw: string) => {
  const hosts: string[] = [];
  for (const entry of splitCsv(raw)) {
    const [, , host = ''] = entry.split('|').map((part) => part.trim());
    if (!host) continue;
    hosts.push(normalizeHost(host));
  }
  return hosts;
};

const parseHostsFromDockerServers = (raw: string) => {
  const hosts: string[] = [];
  for (const entry of splitCsv(raw)) {
    const [, ...rest] = entry.split('=');
    const rawUrl = rest.join('=').trim();
    if (!rawUrl) continue;
    const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(rawUrl) ? rawUrl : `http://${rawUrl}`;
    try {
      const parsed = new URL(withScheme);
      hosts.push(normalizeHost(parsed.hostname));
    } catch {
      continue;
    }
  }
  return hosts;
};

const hostMatches = (requestedHost: string, allowedHost: string) => {
  if (!allowedHost) return false;
  const normalizedRequested = normalizeHost(requestedHost);
  const normalizedAllowed = normalizeHost(allowedHost).replace(/^\*\./, '');
  if (!normalizedRequested || !normalizedAllowed) return false;
  if (normalizedRequested === normalizedAllowed) return true;
  return normalizedRequested.endsWith(`.${normalizedAllowed}`);
};

const getAllowedProbeHosts = () => {
  const explicit = splitCsv(
    readPrivateEnv('LANTERN_ALLOWED_PROBE_HOSTS', 'DASHBOARD_ALLOWED_PROBE_HOSTS') ?? ''
  ).map(normalizeHost);
  if (explicit.length > 0) return explicit;

  const derived = [
    ...parseHostsFromExecutionNodes(publicEnv.PUBLIC_EXECUTION_NODES ?? ''),
    ...parseHostsFromDockerServers(privateEnv.DOCKER_SERVERS ?? '')
  ];
  return derived.filter(Boolean);
};

const shouldAllowUnlistedProbeHosts = () =>
  String(readPrivateEnv('LANTERN_ALLOW_UNLISTED_PROBE_HOSTS', 'DASHBOARD_ALLOW_UNLISTED_PROBE_HOSTS') ?? '')
    .trim()
    .toLowerCase() === 'true';

const buildProbeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
};

const parseHttpHostPort = (value: string) => {
  const parsed = buildProbeUrl(value);
  if (!parsed) return null;
  const hostname = normalizeHost(stripIPv6Brackets(parsed.hostname));
  if (!hostname) return null;
  const protocol = parsed.protocol;
  const portRaw = parsed.port ? Number(parsed.port) : NaN;
  const port =
    Number.isFinite(portRaw) && portRaw > 0 && portRaw <= 65535
      ? portRaw
      : protocol === 'https:'
        ? 443
        : 80;
  return { hostname, port };
};

export const canFallbackToEnvSecret = (overrideBaseUrl: string, envBaseUrl: string) => {
  const overrideTrimmed = overrideBaseUrl.trim();
  if (!overrideTrimmed) return true;
  const envTrimmed = envBaseUrl.trim();
  if (!envTrimmed) return false;
  const override = parseHttpHostPort(overrideTrimmed);
  const env = parseHttpHostPort(envTrimmed);
  if (!override || !env) return false;
  return override.hostname === env.hostname && override.port === env.port;
};

export const validateProbeUrl = (value: string) => {
  const parsed = buildProbeUrl(value);
  if (!parsed) {
    return { ok: false as const, message: 'Probe URL must be a valid http(s) URL.' };
  }

  if (isBlockedHost(parsed.hostname)) {
    return { ok: false as const, message: 'Probe URL host is not allowed.' };
  }

  const allowedHosts = getAllowedProbeHosts();
  if (allowedHosts.length === 0) {
    if (!shouldAllowUnlistedProbeHosts() && !isPrivateLiteralHost(parsed.hostname)) {
      return {
        ok: false as const,
        message:
          'Probe URL host is outside the configured allowlist. Add host to LANTERN_ALLOWED_PROBE_HOSTS or set LANTERN_ALLOW_UNLISTED_PROBE_HOSTS=true.'
      };
    }
  } else if (!allowedHosts.some((allowedHost) => hostMatches(parsed.hostname, allowedHost))) {
    return {
      ok: false as const,
      message:
        'Probe URL host is outside the configured allowlist. Add host to LANTERN_ALLOWED_PROBE_HOSTS.'
    };
  }

  return { ok: true as const, url: parsed.toString() };
};

const readConfiguredAuth = () => {
  const user = String(readPrivateEnv('LANTERN_AUTH_USER', 'DASHBOARD_AUTH_USER') ?? '').trim();
  const password = String(readPrivateEnv('LANTERN_AUTH_PASSWORD', 'DASHBOARD_AUTH_PASSWORD') ?? '').trim();
  return user && password ? { user, password } : null;
};

const decodeBasicAuth = (header: string) => {
  if (!header.startsWith('Basic ')) return null;
  const encoded = header.slice('Basic '.length).trim();
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const index = decoded.indexOf(':');
    if (index < 0) return null;
    return {
      user: decoded.slice(0, index),
      password: decoded.slice(index + 1)
    };
  } catch {
    return null;
  }
};

const safeEquals = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  const maxLength = Math.max(leftBuffer.length, rightBuffer.length, 1);
  const paddedLeft = Buffer.alloc(maxLength);
  const paddedRight = Buffer.alloc(maxLength);
  leftBuffer.copy(paddedLeft);
  rightBuffer.copy(paddedRight);
  const equal = timingSafeEqual(paddedLeft, paddedRight);
  return equal && leftBuffer.length === rightBuffer.length;
};

export const isLanternAuthEnabled = () => Boolean(readConfiguredAuth());

export const isLanternRequestAuthorized = (authorizationHeader: string | null) => {
  const configured = readConfiguredAuth();
  if (!configured) return true;
  if (!authorizationHeader) return false;
  const decoded = decodeBasicAuth(authorizationHeader);
  if (!decoded) return false;
  return (
    safeEquals(decoded.user, configured.user) && safeEquals(decoded.password, configured.password)
  );
};

export const buildLanternUnauthorizedResponse = () =>
  new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${LANTERN_REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store'
    }
  });

const getConfiguredAllowedHosts = () =>
  splitCsv(readPrivateEnv('LANTERN_ALLOWED_HOSTS', 'DASHBOARD_ALLOWED_HOSTS') ?? '')
    .map((entry) => normalizeHostWithOptionalPort(entry).host)
    .filter(Boolean);

const resolveRequestHostHeader = (request: Request) => {
  const hostHeader = request.headers.get('host');
  if (hostHeader?.trim()) return firstCsvValue(hostHeader);
  try {
    const parsed = new URL(request.url);
    return parsed.host;
  } catch {
    return '';
  }
};

const hostMatchesAllowedHost = (requestHost: string, allowedHost: string) => {
  if (!requestHost || !allowedHost) return false;
  const normalizedRequest = normalizeHost(requestHost);
  if (allowedHost.startsWith('*.')) {
    const base = normalizeHost(allowedHost.slice(2));
    if (!base) return false;
    return normalizedRequest.length > base.length && normalizedRequest.endsWith(`.${base}`);
  }
  return normalizedRequest === normalizeHost(allowedHost);
};

export const validateRequestHost = (request: Request) => {
  const allowedHosts = getConfiguredAllowedHosts();
  if (allowedHosts.length === 0) return { ok: true as const };

  const hostHeader = resolveRequestHostHeader(request);
  const { host } = normalizeHostWithOptionalPort(hostHeader);
  if (!host) return { ok: false as const, message: 'Request host is not allowed.' };
  if (allowedHosts.some((allowedHost) => hostMatchesAllowedHost(host, allowedHost))) {
    return { ok: true as const };
  }

  return { ok: false as const, message: 'Request host is not allowed.' };
};

const isCsrfOriginCheckEnabled = () =>
  String(readPrivateEnv('LANTERN_CSRF_ORIGIN_CHECK_ENABLED', 'DASHBOARD_CSRF_ORIGIN_CHECK_ENABLED') ?? '')
    .trim()
    .toLowerCase() === 'true';

const shouldAllowMissingCsrfOrigin = () =>
  String(readPrivateEnv('LANTERN_CSRF_ALLOW_MISSING_ORIGIN', 'DASHBOARD_CSRF_ALLOW_MISSING_ORIGIN') ?? '')
    .trim()
    .toLowerCase() === 'true';

const normalizeOrigin = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.origin.toLowerCase();
  } catch {
    return '';
  }
};

const resolveConfiguredCsrfOrigins = () =>
  splitCsv(readPrivateEnv('LANTERN_CSRF_ALLOWED_ORIGINS', 'DASHBOARD_CSRF_ALLOWED_ORIGINS') ?? '')
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);

const resolveRequestOrigin = (request: Request) => {
  const hostHeader = resolveRequestHostHeader(request);
  const { host, port } = normalizeHostWithOptionalPort(hostHeader);
  if (!host) return '';
  const forwardedProto = firstCsvValue(request.headers.get('x-forwarded-proto') ?? '').toLowerCase();
  const protocol =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? `${forwardedProto}:`
      : (() => {
          try {
            return new URL(request.url).protocol;
          } catch {
            return '';
          }
        })();
  if (protocol !== 'http:' && protocol !== 'https:') return '';
  const hostPort = port ? `${host}:${port}` : host;
  return `${protocol}//${hostPort}`.toLowerCase();
};

const resolveRequestSourceOrigin = (request: Request) => {
  const originHeader = request.headers.get('origin');
  if (originHeader?.trim()) {
    const normalizedOrigin = normalizeOrigin(originHeader);
    return normalizedOrigin || null;
  }
  const refererHeader = request.headers.get('referer');
  if (refererHeader?.trim()) {
    const normalizedOrigin = normalizeOrigin(refererHeader);
    return normalizedOrigin || null;
  }
  return '';
};

export const validateCsrfRequestOrigin = (request: Request) => {
  if (!isCsrfOriginCheckEnabled()) return { ok: true as const };

  const sourceOrigin = resolveRequestSourceOrigin(request);
  if (sourceOrigin === '') {
    if (shouldAllowMissingCsrfOrigin()) return { ok: true as const };
    return {
      ok: false as const,
      message: 'Request origin is required.'
    };
  }
  if (sourceOrigin === null) {
    return {
      ok: false as const,
      message: 'Request origin is invalid.'
    };
  }

  const allowedOrigins = resolveConfiguredCsrfOrigins();
  if (allowedOrigins.length > 0) {
    if (allowedOrigins.includes(sourceOrigin)) return { ok: true as const };
    return {
      ok: false as const,
      message: 'Request origin is not allowed.'
    };
  }

  const requestOrigin = resolveRequestOrigin(request);
  if (!requestOrigin) {
    return {
      ok: false as const,
      message: 'Request origin is not allowed.'
    };
  }
  if (sourceOrigin !== requestOrigin) {
    return {
      ok: false as const,
      message: 'Request origin is not allowed.'
    };
  }
  return { ok: true as const };
};
