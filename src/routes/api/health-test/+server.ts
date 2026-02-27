import { json } from '@sveltejs/kit';
import {
  fetchDockerContainers,
  getDockerServers,
  resolveContainerHealth
} from '$lib/server/connectors/docker';
import { validateProbeUrl } from '$serverlib/security';
import { readPrivateEnv } from '$serverlib/env';
import { readJsonBodyWithLimit, RequestBodyTooLargeError } from '$serverlib/request';

const resolveMaxTestBodyBytes = () => {
  const kb = Number(readPrivateEnv('LANTERN_MAX_TEST_BODY_KB', 'DASHBOARD_MAX_TEST_BODY_KB') ?? 64);
  const safeKb = Number.isFinite(kb) ? Math.min(512, Math.max(8, kb)) : 64;
  return Math.floor(safeKb * 1024);
};

export const POST = async ({ request }) => {
  let payload: Record<string, unknown> = {};
  const maxBodyBytes = resolveMaxTestBodyBytes();
  try {
    payload = await readJsonBodyWithLimit<Record<string, unknown>>(request, maxBodyBytes, {});
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json(
        {
          ok: false,
          message: `Request body is too large. Maximum size is ${Math.round(maxBodyBytes / 1024)}KB.`
        },
        { status: 413 }
      );
    }
    return json({ ok: false, message: 'Invalid request body.' }, { status: 400 });
  }

  const dockerServers = getDockerServers();
  const healthServerRaw = String(payload.healthServer ?? '').trim();
  const healthContainerRaw = String(payload.healthContainer ?? '').trim();
  const baseUrlRaw = String(payload.baseUrl ?? '').trim();
  let normalizedBaseUrl = '';
  if (baseUrlRaw) {
    const validatedProbe = validateProbeUrl(baseUrlRaw);
    if (!validatedProbe.ok) {
      return json({ ok: false, message: validatedProbe.message }, { status: 400 });
    }
    normalizedBaseUrl = validatedProbe.url;
  }
  const hasServerSelection = healthServerRaw.length > 0;
  const hasContainerName = healthContainerRaw.length > 0;
  const serverKnown = hasServerSelection && Boolean(dockerServers[healthServerRaw]);
  const serverUrl = serverKnown ? dockerServers[healthServerRaw] : '';
  const missingParts: string[] = [];
  if (!hasServerSelection) missingParts.push('Execution Node');
  if (!hasContainerName) missingParts.push('Container Name');

  const testBaseUrlReachable = async (target: string) => {
    if (!target) {
      return { checked: false as const, ok: null as null, message: 'Base URL not set' };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(target, {
        method: 'GET',
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (response.status === 401 || response.status === 403) {
        return { checked: true as const, ok: true as const, message: `Base URL reachable (${response.status})` };
      }
      if (response.status >= 300 && response.status < 400) {
        return { checked: true as const, ok: true as const, message: `Base URL reachable (${response.status})` };
      }
      return {
        checked: true as const,
        ok: response.status >= 200 && response.status < 300,
        message: response.status >= 200 && response.status < 300
          ? `Base URL reachable (${response.status})`
          : `Base URL error (${response.status})`
      };
    } catch {
      clearTimeout(timeout);
      return { checked: true as const, ok: false as const, message: 'Base URL unreachable' };
    }
  };

  try {
    let containerOk: boolean | null = null;
    let containerMessage = 'Container not checked';
    let health: 'healthy' | 'unhealthy' | 'unknown' = 'unknown';

    if (missingParts.length > 0) {
      containerOk = false;
      containerMessage = `Container check missing: ${missingParts.join(' + ')}`;
    } else if (!serverKnown || !serverUrl) {
      containerOk = false;
      containerMessage = `Unknown execution node: ${healthServerRaw}`;
    } else {
      const containers = await fetchDockerContainers(serverUrl);
      health = resolveContainerHealth(containers, healthContainerRaw);
      if (health === 'healthy') {
        containerOk = true;
        containerMessage = `Container healthy (${healthContainerRaw})`;
      } else if (health === 'unhealthy') {
        containerOk = false;
        containerMessage = `Container unhealthy (${healthContainerRaw})`;
      } else {
        containerOk = false;
        containerMessage = `Container not found or unknown (${healthContainerRaw})`;
      }
    }

    const urlResult = await testBaseUrlReachable(normalizedBaseUrl);
    const checks = [
      `Container: ${containerMessage}`,
      ...(urlResult.checked ? [`URL: ${urlResult.message}`] : [])
    ];

    const ok = containerOk === true && (!urlResult.checked || urlResult.ok === true);

    return json({
      ok,
      status: health,
      message: checks.length > 0 ? checks.join(' | ') : ok ? 'Healthy' : 'Failed'
    });
  } catch {
    return json({ ok: false, message: 'Health check failed.' }, { status: 502 });
  }
};
