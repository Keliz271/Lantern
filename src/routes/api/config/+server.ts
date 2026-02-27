import { json } from '@sveltejs/kit';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSettings, getWidgets, updateWidgetConfig } from '$serverlib/state';
import type { WidgetInstance, DashboardSettings } from '$widgets/types';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readJsonBodyWithLimit, RequestBodyTooLargeError } from '$serverlib/request';
import { readPrivateEnv } from '$serverlib/env';
import {
  mergeIncomingWidgetsWithStoredSecrets,
  redactSnapshotForClient,
  stripRuntimeWidgetFields
} from '$serverlib/configSanitizer';
import { createDefaultDashboardSettings } from '$lib/shared/dashboardSettings';

const resolveConfigPath = () => {
  const override = String(readPrivateEnv('LANTERN_CONFIG_PATH', 'DASHBOARD_CONFIG_PATH') ?? '').trim();
  if (override) return override;
  // docker-compose commonly mounts the config at /config/widgets.json, so prefer it when present.
  const dockerMounted = '/config/widgets.json';
  if (existsSync(dockerMounted)) return dockerMounted;
  // Use cwd so Docker/adapter-node builds don't accidentally point at /app/build/config/...
  return path.resolve(process.cwd(), 'config/widgets.json');
};

const resolveMaxConfigBytes = () => {
  const mb = Number(readPrivateEnv('LANTERN_MAX_CONFIG_MB', 'DASHBOARD_MAX_CONFIG_MB') ?? 2);
  const safeMb = Number.isFinite(mb) ? Math.min(32, Math.max(1, mb)) : 2;
  return Math.floor(safeMb * 1024 * 1024);
};

const readConfig = async () => {
  const raw = await readFile(resolveConfigPath(), 'utf-8');
  const parsed = JSON.parse(raw) as { widgets?: WidgetInstance[]; settings?: DashboardSettings };
  return {
    widgets: stripRuntimeWidgetFields(Array.isArray(parsed.widgets) ? parsed.widgets : []),
    settings: parsed.settings
  };
};

const writeConfig = async (payload: { widgets: WidgetInstance[]; settings?: DashboardSettings }) => {
  const configPath = resolveConfigPath();
  const serialized = JSON.stringify(payload, null, 2);
  const tempPath = `${configPath}.tmp-${randomUUID()}`;
  try {
    await writeFile(tempPath, serialized);
    await rename(tempPath, configPath);
  } catch {
    // Some container setups mount only /config/widgets.json (file), not the parent directory.
    // In that case, writing a sibling temp file can fail even though direct writes work.
    await writeFile(configPath, serialized);
    await unlink(tempPath).catch(() => {});
  }
};

let configWriteLock: Promise<void> = Promise.resolve();

const withConfigWriteLock = async <T>(run: () => Promise<T>) => {
  const previous = configWriteLock;
  let release!: () => void;
  configWriteLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous.catch(() => {});
  try {
    return await run();
  } finally {
    release();
  }
};

const ensureUniqueWidgetIds = (widgets: WidgetInstance[]) => {
  const seen = new Set<string>();
  const makeId = () => {
    try {
      return randomUUID();
    } catch {
      return `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  };
  return widgets.map((widget) => {
    const raw = typeof widget?.id === 'string' ? widget.id.trim() : '';
    const id = raw && !seen.has(raw) ? raw : makeId();
    seen.add(id);
    return { ...widget, id };
  });
};

export const GET = async () => {
  const data = await readConfig().catch(() => ({
    widgets: getWidgets(),
    settings: getSettings()
  }));
  return json(redactSnapshotForClient(data), {
    headers: {
      'Cache-Control': 'no-store'
    }
  });
};

export const POST = async ({ request }) => {
  let payload: { widgets?: WidgetInstance[]; settings?: DashboardSettings } = {};
  const maxBodyBytes = resolveMaxConfigBytes();
  try {
    payload = await readJsonBodyWithLimit(request, maxBodyBytes, {});
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json(
        {
          error: `Config payload is too large. Maximum size is ${Math.round(maxBodyBytes / (1024 * 1024))}MB.`
        },
        { status: 413 }
      );
    }
    return json({ error: 'Invalid request body.' }, { status: 400 });
  }
  await withConfigWriteLock(async () => {
    const incomingWidgets = ensureUniqueWidgetIds(payload.widgets ?? []);
    const widgets = stripRuntimeWidgetFields(
      mergeIncomingWidgetsWithStoredSecrets(incomingWidgets, getWidgets())
    );
    const requestedConfig = {
      widgets,
      settings: payload.settings ?? createDefaultDashboardSettings()
    };
    await writeConfig(requestedConfig);
    await updateWidgetConfig(requestedConfig);
  });
  const runtimeSnapshot = {
    widgets: getWidgets(),
    settings: getSettings()
  };
  return json(redactSnapshotForClient(runtimeSnapshot), {
    headers: {
      'Cache-Control': 'no-store'
    }
  });
};
