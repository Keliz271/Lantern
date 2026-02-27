import { env } from '$env/dynamic/private';
import { canFallbackToEnvSecret } from '$serverlib/security';

export type HomeAssistantMetricType = 'people_home' | 'lights_on' | 'switches_on';

export type HomeAssistantCustomMetricInput = {
  state?: string;
  template?: string;
  label?: string;
  value?: string;
};

type HomeAssistantMetricResult = {
  key: string;
  value: number | string;
  label: string;
  unit?: string;
};

type HomeAssistantBuiltinMetricMap = Record<HomeAssistantMetricType, HomeAssistantMetricResult>;

type HomeAssistantState = {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown>;
};

type HomeAssistantOptions = {
  baseUrl?: string;
  apiKey?: string;
  customMetrics?: HomeAssistantCustomMetricInput[];
};

export type HomeAssistantStats = {
  builtin: HomeAssistantBuiltinMetricMap;
  custom: HomeAssistantMetricResult[];
};

const normalizeBase = (value?: string) => {
  if (!value) return '';
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const asRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const withTimeout = async <T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs = 9000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const fetchHomeAssistantJson = async <T>(
  baseUrl: string,
  token: string,
  path: string,
  init?: { method?: string; body?: string }
): Promise<T> => {
  const response = await withTimeout((signal) =>
    fetch(`${baseUrl}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {})
      },
      body: init?.body,
      redirect: 'manual',
      cache: 'no-store',
      signal
    })
  );

  if (!response.ok) {
    throw new Error(`Home Assistant request failed (${response.status})`);
  }

  return (await response.json()) as T;
};

const fetchHomeAssistantText = async (
  baseUrl: string,
  token: string,
  path: string,
  body: string
): Promise<string> => {
  const response = await withTimeout((signal) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/plain, application/json',
        'Content-Type': 'application/json'
      },
      body,
      redirect: 'manual',
      cache: 'no-store',
      signal
    })
  );

  if (!response.ok) {
    throw new Error(`Home Assistant template request failed (${response.status})`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as unknown;
    if (typeof payload === 'string') return payload;
    const record = asRecord(payload);
    if (record && typeof record.result === 'string') return record.result;
    return JSON.stringify(payload);
  }

  return (await response.text()).trim();
};

const getByPath = (record: Record<string, unknown>, path: string) => {
  return path.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, record);
};

const renderTemplateString = (
  template: string,
  context: {
    state: string;
    entityId: string;
    attributes: Record<string, unknown>;
  }
) => {
  return template.replace(/\{([^{}]+)\}/g, (_, expression: string) => {
    const key = expression.trim();
    if (key === 'state') return context.state;
    if (key === 'entity_id') return context.entityId;
    if (key.startsWith('attributes.')) {
      const value = getByPath(context.attributes, key.slice('attributes.'.length));
      return value === undefined || value === null ? '' : String(value);
    }
    return '';
  });
};

const parseValueWithUnit = (value: string) => {
  const trimmed = value.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return { value: trimmed };

  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric)) return { value: trimmed };

  const unit = match[2]?.trim();
  if (!unit) return { value: numeric };

  return { value: numeric, unit };
};

const normalizeCustomMetrics = (raw: HomeAssistantCustomMetricInput[] | undefined) => {
  if (!Array.isArray(raw)) return [] as Array<Required<HomeAssistantCustomMetricInput>>;
  return raw
    .map((metric) => ({
      state: String(metric?.state ?? '').trim(),
      template: String(metric?.template ?? '').trim(),
      label: String(metric?.label ?? '').trim(),
      value: String(metric?.value ?? '').trim()
    }))
    .filter((metric) => metric.state || metric.template);
};

const countByDomainState = (states: HomeAssistantState[], domain: string, state: string) =>
  states.filter((item) => item.entity_id.startsWith(`${domain}.`) && item.state === state).length;

const resolvePeopleHome = (states: HomeAssistantState[]) => {
  const people = states.filter((item) => item.entity_id.startsWith('person.'));
  if (people.length > 0) {
    return people.filter((item) => item.state === 'home').length;
  }

  const zoneHome = states.find((item) => item.entity_id === 'zone.home');
  const attrs = asRecord(zoneHome?.attributes);
  if (attrs && typeof attrs.persons === 'number') {
    return Number(attrs.persons);
  }

  const trackers = states.filter((item) => item.entity_id.startsWith('device_tracker.'));
  return trackers.filter((item) => item.state === 'home').length;
};

export const fetchHomeAssistantStats = async (
  options: HomeAssistantOptions = {}
): Promise<HomeAssistantStats> => {
  const overrideBaseUrl = normalizeBase(typeof options.baseUrl === 'string' ? options.baseUrl : '');
  const envBaseUrl = normalizeBase(env.HOME_ASSISTANT_URL);
  const baseUrl = normalizeBase(overrideBaseUrl || envBaseUrl);
  const tokenOverride = typeof options.apiKey === 'string' ? options.apiKey.trim() : '';
  const token =
    tokenOverride ||
    (canFallbackToEnvSecret(overrideBaseUrl, envBaseUrl) ? String(env.HOME_ASSISTANT_TOKEN ?? '').trim() : '');

  if (!baseUrl || !token) {
    throw new Error('Home Assistant base URL or token is missing');
  }

  const states = await fetchHomeAssistantJson<HomeAssistantState[]>(baseUrl, token, '/api/states');
  const stateMap = new Map(states.map((item) => [item.entity_id, item]));

  const builtin: HomeAssistantBuiltinMetricMap = {
    people_home: {
      key: 'people_home',
      value: resolvePeopleHome(states),
      label: 'People Home'
    },
    lights_on: {
      key: 'lights_on',
      value: countByDomainState(states, 'light', 'on'),
      label: 'Lights On'
    },
    switches_on: {
      key: 'switches_on',
      value: countByDomainState(states, 'switch', 'on'),
      label: 'Switches On'
    }
  };

  const customMetrics = normalizeCustomMetrics(options.customMetrics);
  const custom: HomeAssistantMetricResult[] = [];

  for (let index = 0; index < customMetrics.length; index += 1) {
    const metric = customMetrics[index];
    const key = `custom-${index + 1}`;

    if (metric.state) {
      const entity = stateMap.get(metric.state);
      const stateValue = entity?.state ?? '';
      const attributes = asRecord(entity?.attributes) ?? {};

      const labelTemplate = metric.label || '{attributes.friendly_name}';
      const valueTemplate = metric.value || '{state} {attributes.unit_of_measurement}';

      const label = renderTemplateString(labelTemplate, {
        state: stateValue,
        entityId: metric.state,
        attributes
      }).trim();

      const rawValue = renderTemplateString(valueTemplate, {
        state: stateValue,
        entityId: metric.state,
        attributes
      }).trim();
      const parsed = parseValueWithUnit(rawValue);

      custom.push({
        key,
        label,
        value: parsed.value,
        unit: parsed.unit
      });
      continue;
    }

    if (metric.template) {
      let rendered = '';
      try {
        rendered = await fetchHomeAssistantText(
          baseUrl,
          token,
          '/api/template',
          JSON.stringify({ template: metric.template })
        );
      } catch {
        rendered = '';
      }

      const parsed = parseValueWithUnit(rendered);
      custom.push({
        key,
        label: metric.label,
        value: parsed.value,
        unit: parsed.unit
      });
    }
  }

  return {
    builtin,
    custom
  };
};
