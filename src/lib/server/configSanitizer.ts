import type { DashboardSettings, WidgetInstance } from '$widgets/types';

const MAX_CONFIG_TRAVERSAL_DEPTH = 64;

const SECRET_OPTION_KEYS = new Set(['apikey', 'apisecret', 'token', 'password']);
const SECRET_OPTION_SUFFIXES = [
  'apikey',
  'apisecret',
  'token',
  'password',
  'passwd',
  'passphrase',
  'secret',
  'clientsecret',
  'privatekey'
];
const SECRET_OPTION_EXACT_KEYS = new Set([
  'authorization',
  'authorizationheader',
  'authheader',
  'sessiontoken',
  'sessionid',
  'cookie'
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isUnsafeKey = (key: string) => key === '__proto__' || key === 'prototype' || key === 'constructor';
const hasOwn = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

const normalizeSecretKey = (key: string) => key.toLowerCase().replace(/[^a-z]/g, '');

const isSecretKey = (key: string) => {
  const normalized = normalizeSecretKey(key);
  if (SECRET_OPTION_KEYS.has(normalized)) return true;
  if (SECRET_OPTION_EXACT_KEYS.has(normalized)) return true;
  return SECRET_OPTION_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
};

const redactSecrets = (value: unknown, depth = 0): unknown => {
  if (depth >= MAX_CONFIG_TRAVERSAL_DEPTH) {
    if (Array.isArray(value)) return [];
    if (isRecord(value)) return {};
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSecrets(entry, depth + 1));
  }
  if (!isRecord(value)) {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isUnsafeKey(key)) continue;
    if (isSecretKey(key)) continue;
    redacted[key] = redactSecrets(entry, depth + 1);
  }
  return redacted;
};

const mergeMissingSecrets = (incoming: unknown, existing: unknown, depth = 0): unknown => {
  if (depth >= MAX_CONFIG_TRAVERSAL_DEPTH) {
    if (Array.isArray(incoming)) {
      return [...incoming];
    }

    if (!isRecord(incoming)) {
      return incoming;
    }

    const mergedAtDepthLimit: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(incoming)) {
      if (isUnsafeKey(key)) continue;
      mergedAtDepthLimit[key] = value;
    }

    const previousAtDepthLimit = isRecord(existing) ? existing : null;
    if (!previousAtDepthLimit) return mergedAtDepthLimit;

    for (const [key, previousValue] of Object.entries(previousAtDepthLimit)) {
      if (isUnsafeKey(key)) continue;
      if (isSecretKey(key) && !hasOwn(incoming, key)) {
        mergedAtDepthLimit[key] = previousValue;
      }
    }

    return mergedAtDepthLimit;
  }

  if (Array.isArray(incoming)) {
    const previousList = Array.isArray(existing) ? existing : [];
    return incoming.map((entry, index) => mergeMissingSecrets(entry, previousList[index], depth + 1));
  }

  if (!isRecord(incoming)) {
    return incoming;
  }

  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (isUnsafeKey(key)) continue;
    merged[key] = value;
  }
  const previous = isRecord(existing) ? existing : null;
  if (!previous) return merged;

  for (const [key, previousValue] of Object.entries(previous)) {
    if (isUnsafeKey(key)) continue;
    if (isSecretKey(key)) {
      if (!hasOwn(incoming, key)) {
        merged[key] = previousValue;
      }
      continue;
    }

    if (!hasOwn(incoming, key)) continue;
    merged[key] = mergeMissingSecrets(incoming[key], previousValue, depth + 1);
  }

  return merged;
};

export const stripRuntimeWidgetFields = (widgets: WidgetInstance[]): WidgetInstance[] =>
  widgets.map((widget) => {
    const { data, health, ...rest } = widget;
    void data;
    void health;
    return rest;
  });

export const redactWidgetsForClient = (widgets: WidgetInstance[]): WidgetInstance[] =>
  widgets.map((widget) => {
    if (!isRecord(widget.options)) return widget;
    return {
      ...widget,
      options: redactSecrets(widget.options) as Record<string, unknown>
    };
  });

export const mergeIncomingWidgetsWithStoredSecrets = (
  incomingWidgets: WidgetInstance[],
  existingWidgets: WidgetInstance[]
) => {
  const existingById = new Map(existingWidgets.map((widget) => [widget.id, widget] as const));
  return incomingWidgets.map((widget) => {
    const existing = existingById.get(widget.id);
    if (!existing || !isRecord(widget.options) || !isRecord(existing.options)) {
      return widget;
    }
    return {
      ...widget,
      options: mergeMissingSecrets(widget.options, existing.options) as Record<string, unknown>
    };
  });
};

export const redactSnapshotForClient = (snapshot: {
  widgets: WidgetInstance[];
  settings: DashboardSettings;
}) => ({
  ...snapshot,
  widgets: redactWidgetsForClient(snapshot.widgets)
});
