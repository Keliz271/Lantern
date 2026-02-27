import type { PageLoad } from './$types';
import { createDefaultDashboardSettings } from '$lib/shared/dashboardSettings';

const defaultSettings = createDefaultDashboardSettings();

export const load: PageLoad = async ({ fetch, url }) => {
  const initialTabId = url.searchParams.get('tab')?.trim() ?? '';
  try {
    const res = await fetch('/api/widgets', { cache: 'no-store' });
    if (!res.ok) throw new Error(`widgets endpoint failed with ${res.status}`);
    const payload = await res.json();
    return {
      widgets: Array.isArray(payload.widgets) ? payload.widgets : [],
      settings: payload.settings ?? defaultSettings,
      initialTabId
    };
  } catch {
    return {
      widgets: [],
      settings: defaultSettings,
      initialTabId
    };
  }
};
