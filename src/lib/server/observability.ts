import { env } from '$env/dynamic/private';
import * as Sentry from '@sentry/node';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const toSafeString = (value: unknown, fallback: string) => {
  const parsed = String(value ?? '').trim().toLowerCase();
  return parsed || fallback;
};

const readPrivateEnv = (key: string, legacyKey?: string) =>
  env[key] ?? (legacyKey ? env[legacyKey] : undefined);

const configuredLogLevel = (() => {
  const configured = toSafeString(readPrivateEnv('LANTERN_LOG_LEVEL', 'DASHBOARD_LOG_LEVEL'), 'info');
  return configured in LOG_LEVEL_WEIGHT ? (configured as LogLevel) : 'info';
})();

const parseCsv = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const configuredQuietRequestPaths = (() => {
  const raw = String(
    readPrivateEnv('LANTERN_LOG_QUIET_PATHS', 'DASHBOARD_LOG_QUIET_PATHS') ?? ''
  ).trim();
  const defaults = ['/api/stream', '/api/media-image'];
  const paths = raw ? parseCsv(raw) : defaults;
  return new Set(paths);
})();

const configuredRequestSampleRate = (() => {
  const raw = Number(
    readPrivateEnv('LANTERN_LOG_REQUEST_SAMPLE_RATE', 'DASHBOARD_LOG_REQUEST_SAMPLE_RATE') ?? 1
  );
  if (!Number.isFinite(raw)) return 1;
  return Math.min(1, Math.max(0, raw));
})();

const shouldLog = (level: LogLevel) =>
  LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[configuredLogLevel];

const normalizeLogValue = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return '[truncated]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeLogValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const normalized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      normalized[key] = normalizeLogValue(entry, depth + 1);
    }
    return normalized;
  }
  return String(value);
};

export const logEvent = (level: LogLevel, event: string, details?: Record<string, unknown>) => {
  if (!shouldLog(level)) return;
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    details: normalizeLogValue(details ?? {})
  };
  const line = `${JSON.stringify(payload)}\n`;
  if (level === 'error') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
};

export const shouldLogHttpRequest = (path: string, status: number) => {
  if (status >= 400) return true;
  if (configuredQuietRequestPaths.has(path)) return false;
  if (configuredRequestSampleRate >= 1) return true;
  return Math.random() < configuredRequestSampleRate;
};

const resolveSentryDsn = () =>
  String(readPrivateEnv('LANTERN_SENTRY_DSN', 'DASHBOARD_SENTRY_DSN') ?? '').trim();

const resolveTracesSampleRate = () => {
  const raw = Number(
    readPrivateEnv('LANTERN_SENTRY_TRACES_SAMPLE_RATE', 'DASHBOARD_SENTRY_TRACES_SAMPLE_RATE') ?? 0
  );
  if (!Number.isFinite(raw)) return 0;
  return Math.min(1, Math.max(0, raw));
};

let observabilityInitialized = false;
let sentryEnabled = false;

export const initObservability = () => {
  if (observabilityInitialized) return;
  observabilityInitialized = true;

  const dsn = resolveSentryDsn();
  if (!dsn) {
    logEvent('info', 'observability.sentry.disabled');
    return;
  }

  sentryEnabled = true;
  Sentry.init({
    dsn,
    environment: String(
      readPrivateEnv('LANTERN_SENTRY_ENVIRONMENT', 'DASHBOARD_SENTRY_ENVIRONMENT') ??
        env.NODE_ENV ??
        'production'
    ),
    release:
      String(readPrivateEnv('LANTERN_SENTRY_RELEASE', 'DASHBOARD_SENTRY_RELEASE') ?? '').trim() ||
      undefined,
    tracesSampleRate: resolveTracesSampleRate()
  });
  logEvent('info', 'observability.sentry.enabled', {
    tracesSampleRate: resolveTracesSampleRate()
  });
};

export const captureServerException = (error: unknown, context?: Record<string, unknown>) => {
  const normalizedError =
    error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');

  if (sentryEnabled) {
    Sentry.captureException(normalizedError, {
      extra: context
    });
  }

  logEvent('error', 'server.exception', {
    ...context,
    error: normalizedError
  });
};
