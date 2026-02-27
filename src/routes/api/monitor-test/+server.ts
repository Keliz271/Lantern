import { json } from '@sveltejs/kit';
import { fetchMonitorStatus, type MonitorTarget } from '$lib/server/connectors/monitor';
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

  const target: MonitorTarget = {
    name: String(payload.name ?? '').trim() || 'Target',
    url: '',
    icon: String(payload.icon ?? '').trim(),
    method: String(payload.method ?? '').toUpperCase() === 'POST' ? 'POST' : 'GET',
    dockerServer: String(payload.dockerServer ?? '').trim(),
    dockerContainer: String(payload.dockerContainer ?? '').trim()
  };

  const validatedProbe = validateProbeUrl(String(payload.url ?? ''));
  if (!validatedProbe.ok) {
    return json({ ok: false, message: validatedProbe.message }, { status: 400 });
  }

  target.url = validatedProbe.url;

  if (!target.url) {
    return json({ ok: false, message: 'URL is required.' }, { status: 400 });
  }

  const timeoutMs = Math.min(15000, Math.max(500, Number(payload.timeoutMs ?? 6000)));
  const result = await fetchMonitorStatus({
    fallbackTargets: [target],
    timeoutMs
  });
  const item = result.items[0];
  if (!item) {
    return json({ ok: false, message: 'No response.' }, { status: 502 });
  }

  const urlReachable = typeof item.latencyMs === 'number' && item.latencyMs > 0;
  const containerLabel =
    item.containerHealth === 'healthy'
      ? 'Container OK'
      : item.containerHealth === 'unhealthy'
        ? 'Container DOWN'
        : item.containerHealth === 'unknown'
          ? 'Container UNKNOWN'
          : '';
  const statusOk = item.status === 'ok' || item.status === 'warn';
  const success = urlReachable && statusOk;

  let message = '';
  if (!urlReachable) {
    message = containerLabel ? `${containerLabel} · URL DOWN` : 'URL DOWN';
  } else if (containerLabel) {
    message = `URL OK (${item.latencyMs}ms) · ${containerLabel}`;
  } else {
    message = `URL OK (${item.latencyMs}ms)`;
  }

  return json({
    ok: success,
    status: item.status,
    statusText: item.statusText,
    latencyMs: item.latencyMs,
    message
  });
};
