import type { ExecutionNode } from './executionNodes';
import type { WidgetInstance } from '$widgets/types';

export type MonitorEditorTarget = {
  name: string;
  url: string;
  icon: string;
  method: 'GET' | 'POST';
  dockerServer: string;
  dockerContainer: string;
};

export type MonitorSystemNode = {
  value: string;
  label: string;
  host: string;
  port?: number;
  baseUrl?: string;
  provider?: string;
  username?: string;
  password?: string;
};

export const normalizeMonitorMethod = (value: unknown): 'GET' | 'POST' => {
  const normalized = String(value ?? '').toUpperCase();
  return normalized === 'POST' ? 'POST' : 'GET';
};

export const toMonitorEditorTarget = (raw: unknown): MonitorEditorTarget | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  return {
    name: String(value.name ?? '').trim(),
    url: String(value.url ?? '').trim(),
    icon: String(value.icon ?? '').trim(),
    method: normalizeMonitorMethod(value.method),
    dockerServer: String(value.dockerServer ?? '').trim(),
    dockerContainer: String(value.dockerContainer ?? '').trim()
  };
};

export const parseMonitorTargetsText = (targetsText: string) =>
  targetsText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [name = '', url = '', icon = '', method = '', dockerServer = '', dockerContainer = ''] =
        line.split('|').map((part) => part.trim());
      return {
        name,
        url,
        icon,
        method: normalizeMonitorMethod(method),
        dockerServer,
        dockerContainer
      } satisfies MonitorEditorTarget;
    });

export const getMonitorTargetsForWidget = (widget: WidgetInstance | undefined) => {
  if (!widget) return [] as MonitorEditorTarget[];
  const fromArray = Array.isArray(widget.options?.targets)
    ? widget.options.targets
        .map((entry) => toMonitorEditorTarget(entry))
        .filter((entry): entry is MonitorEditorTarget => Boolean(entry))
    : [];
  if (fromArray.length > 0) return fromArray;
  const fromText =
    typeof widget.options?.targetsText === 'string' ? widget.options.targetsText.trim() : '';
  return fromText ? parseMonitorTargetsText(fromText) : [];
};

export const sanitizeMonitorTargets = (targets: MonitorEditorTarget[]) =>
  targets.map((target) => ({
    name: target.name.trim(),
    url: target.url.trim(),
    icon: target.icon.trim(),
    method: normalizeMonitorMethod(target.method),
    dockerServer: target.dockerServer.trim(),
    dockerContainer: target.dockerContainer.trim()
  }));

export const serializeMonitorTargetsText = (targets: MonitorEditorTarget[]) =>
  targets
    .map(
      (target) =>
        `${target.name}|${target.url}|${target.icon}|${target.method}|${target.dockerServer}|${target.dockerContainer}`
    )
    .join('\n');

export const toMonitorSystemNode = (raw: unknown): MonitorSystemNode | undefined => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const id = String(value.value ?? '').trim();
  const host = String(value.host ?? '').trim();
  if (!id || !host) return undefined;
  const label = String(value.label ?? id).trim() || id;
  const portRaw = Number(value.port ?? 61208);
  const port = Number.isFinite(portRaw) ? Math.min(65535, Math.max(1, Math.round(portRaw))) : 61208;
  const baseUrlRaw = String(value.baseUrl ?? '').trim();
  const baseUrl = baseUrlRaw
    ? (() => {
        const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(baseUrlRaw)
          ? baseUrlRaw
          : `http://${baseUrlRaw}`;
        try {
          return new URL(withScheme).origin;
        } catch {
          return '';
        }
      })()
    : '';
  const providerRaw = String(value.provider ?? '').trim().toLowerCase();
  const provider = providerRaw || 'glances';
  const username = String(value.username ?? '').trim();
  const password = String(value.password ?? '').trim();
  return {
    value: id,
    label,
    host,
    port,
    provider,
    username,
    password,
    ...(baseUrl ? { baseUrl } : {})
  } satisfies MonitorSystemNode;
};

export const buildMonitorSystemNodeBaseUrl = (host: string, port: number) => {
  const trimmedHost = host.trim();
  if (!trimmedHost) return '';
  const withScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmedHost)
    ? trimmedHost
    : `http://${trimmedHost}`;
  try {
    const url = new URL(withScheme);
    url.port = String(Math.min(65535, Math.max(1, Math.round(port || 61208))));
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
};

export const getMonitorSystemNodesForWidget = (
  widget: WidgetInstance | undefined,
  fallbackExecutionNodes: ExecutionNode[]
) => {
  if (!widget) return [] as MonitorSystemNode[];
  if (Array.isArray(widget.options?.monitorSystemNodes)) {
    return widget.options.monitorSystemNodes
      .map((entry) => toMonitorSystemNode(entry))
      .filter((entry): entry is MonitorSystemNode => Boolean(entry));
  }
  return fallbackExecutionNodes.map((node) => ({
    ...node,
    port: 61208,
    provider: 'glances',
    username: '',
    password: '',
    baseUrl: `http://${node.host}:61208`
  }));
};
