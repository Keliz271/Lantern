import { spawn } from 'node:child_process';

const readEnv = (key, legacyKey) => process.env[key] ?? (legacyKey ? process.env[legacyKey] : undefined);

const container = String(readEnv('LANTERN_ALERT_CONTAINER', 'DASHBOARD_ALERT_CONTAINER') ?? 'lantern').trim() || 'lantern';
const webhookUrl = String(readEnv('LANTERN_ALERT_WEBHOOK_URL', 'DASHBOARD_ALERT_WEBHOOK_URL') ?? '').trim();
const cooldownSecRaw = Number(readEnv('LANTERN_ALERT_COOLDOWN_SEC', 'DASHBOARD_ALERT_COOLDOWN_SEC') ?? 30);
const cooldownMs = Number.isFinite(cooldownSecRaw)
  ? Math.max(0, Math.round(cooldownSecRaw * 1000))
  : 30_000;

const recentAlerts = new Map();

const eventKey = (eventName, action) => `${eventName}:${action}`;

const shouldSendAlert = (eventName, action) => {
  const key = eventKey(eventName, action);
  const now = Date.now();
  const previous = recentAlerts.get(key) ?? 0;
  if (now - previous < cooldownMs) return false;
  recentAlerts.set(key, now);
  return true;
};

const isOomSignal = (action, attributes) => {
  if (action === 'oom') return true;
  if (action !== 'die') return false;
  const exitCode = String(attributes.exitCode ?? '').trim();
  const oomKilled = String(attributes.oomKilled ?? attributes.oomkill ?? '')
    .trim()
    .toLowerCase();
  return exitCode === '137' || oomKilled === 'true';
};

const postWebhook = async (payload) => {
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        event: 'ops.alert.webhook_failed',
        details: { message }
      })}\n`
    );
  }
};

const printEvent = async (payload) => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  await postWebhook(payload);
};

const monitor = spawn(
  'docker',
  [
    'events',
    '--format',
    '{{json .}}',
    '--filter',
    'type=container',
    '--filter',
    `container=${container}`,
    '--filter',
    'event=oom',
    '--filter',
    'event=restart',
    '--filter',
    'event=die'
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] }
);

monitor.on('error', (error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'ops.alert.monitor_failed',
      details: { message }
    })}\n`
  );
  process.exit(1);
});

monitor.stderr.setEncoding('utf-8');
monitor.stderr.on('data', (chunk) => {
  const message = String(chunk).trim();
  if (!message) return;
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      event: 'ops.alert.monitor_stderr',
      details: { message }
    })}\n`
  );
});

monitor.stdout.setEncoding('utf-8');
let buffer = '';
monitor.stdout.on('data', async (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let event;
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const action = String(event.Action ?? '').trim().toLowerCase();
    const attributes = event.Actor?.Attributes ?? {};
    const containerName = String(attributes.name ?? container);
    const timestamp = new Date().toISOString();

    if (action === 'restart' && shouldSendAlert(containerName, action)) {
      await printEvent({
        timestamp,
        level: 'error',
        event: 'ops.alert.container_restart',
        details: {
          container: containerName,
          action,
          attributes
        }
      });
      continue;
    }

    if (isOomSignal(action, attributes) && shouldSendAlert(containerName, 'oom')) {
      await printEvent({
        timestamp,
        level: 'error',
        event: 'ops.alert.container_oom',
        details: {
          container: containerName,
          action,
          attributes
        }
      });
    }
  }
});

monitor.on('close', (code) => {
  if (code === 0) return;
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      event: 'ops.alert.monitor_exit',
      details: { code }
    })}\n`
  );
  process.exit(code ?? 1);
});
