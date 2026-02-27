import type { DashboardSettings, DashboardTab } from '$widgets/types';
import { normalizeTabIconKey, tabIconFallbackForName, type TabIconKey } from '$widgets/tabIcons';
import { slugifyTabId } from './tabs';
import { normalizeHexColor } from './styleUtils';

export const DASHBOARD_GRID_COLUMNS = 25;
export const DASHBOARD_DEFAULT_FONT_STACK = 'Space Grotesk, Sora, Manrope, sans-serif';
export const DASHBOARD_DEFAULT_TAB: DashboardTab = { id: 'main', name: 'Main', icon: 'home' };

export type TabIndicatorStyle = NonNullable<DashboardSettings['tabIndicatorStyle']>;

export const normalizeTabIndicatorStyle = (value: unknown): TabIndicatorStyle =>
  value === 'box' || value === 'neon' || value === 'dot' ? value : 'underline';

const resolvePreferredDashboardTabId = (tabs: DashboardTab[], preferred?: unknown) => {
  const requested = typeof preferred === 'string' ? preferred.trim() : '';
  return tabs.some((tab) => tab.id === requested) ? requested : tabs[0]?.id ?? DASHBOARD_DEFAULT_TAB.id;
};

export const normalizeDashboardTabs = (rawTabs: unknown): DashboardTab[] => {
  const seen = new Set<string>();
  type NormalizedTab = { id: string; name: string; icon: TabIconKey };
  const tabs = Array.isArray(rawTabs)
    ? rawTabs
        .map((item, index) => {
          if (typeof item === 'string') {
            const name = item.trim();
            if (!name) return null;
            const baseId = slugifyTabId(name) || `tab-${index + 1}`;
            const icon = tabIconFallbackForName(name);
            return { id: baseId, name, icon } satisfies NormalizedTab;
          }
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
          const value = item as Record<string, unknown>;
          const name = typeof value.name === 'string' ? value.name.trim() : '';
          if (!name) return null;
          const baseId =
            typeof value.id === 'string' && value.id.trim()
              ? value.id.trim()
              : slugifyTabId(name) || `tab-${index + 1}`;
          const icon = normalizeTabIconKey(value.icon) ?? tabIconFallbackForName(name);
          return { id: baseId, name, icon } satisfies NormalizedTab;
        })
        .filter((item): item is NormalizedTab => Boolean(item))
        .map((tab, index) => {
          let nextId = tab.id;
          let suffix = 2;
          while (seen.has(nextId)) {
            nextId = `${tab.id}-${suffix}`;
            suffix += 1;
          }
          seen.add(nextId);
          return {
            id: nextId || `tab-${index + 1}`,
            name: tab.name,
            icon: normalizeTabIconKey(tab.icon) ?? tabIconFallbackForName(tab.name)
          } satisfies DashboardTab;
        })
    : [];

  if (tabs.length > 0) return tabs;
  return [{ ...DASHBOARD_DEFAULT_TAB }];
};

export const createDefaultDashboardSettings = (): Required<DashboardSettings> => ({
  scale: 1,
  showHealthCircles: true,
  widgetOpacity: 0.95,
  widgetBlurEnabled: true,
  widgetBlur: 8,
  widgetBackgroundColor: '#141b23',
  settingsBackgroundColor: '#0a1018',
  backgroundImage: '',
  backgroundBlur: 0,
  overlayAlpha: 0,
  gridGap: 16,
  fontBody: DASHBOARD_DEFAULT_FONT_STACK,
  fontHeading: DASHBOARD_DEFAULT_FONT_STACK,
  globalTitleFontFamily: DASHBOARD_DEFAULT_FONT_STACK,
  globalTitleFontWeight: 600,
  globalTitleColor: '#eef4ff',
  globalHeaderFontFamily: DASHBOARD_DEFAULT_FONT_STACK,
  globalHeaderFontWeight: 600,
  globalHeaderColor: '#eef4ff',
  cardTitleSize: 17.6,
  cardTitleAboveSize: 12,
  layoutMode: 'masonry',
  tabs: [{ ...DASHBOARD_DEFAULT_TAB }],
  tabIndicatorStyle: 'underline',
  tabIndicatorColor: '#21e6da',
  tabPosition: 'left',
  defaultTabIdWeb: DASHBOARD_DEFAULT_TAB.id,
  defaultTabIdMobile: DASHBOARD_DEFAULT_TAB.id,
  defaultTabId: DASHBOARD_DEFAULT_TAB.id
});

const toFiniteNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toTrimmedOrFallback = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

export const normalizeDashboardSettings = (
  rawSettings?: DashboardSettings | null,
  fallbackSettings?: Required<DashboardSettings>
): Required<DashboardSettings> => {
  const defaults = createDefaultDashboardSettings();
  const base = fallbackSettings
    ? {
        ...defaults,
        ...fallbackSettings,
        tabs: normalizeDashboardTabs(fallbackSettings.tabs)
      }
    : defaults;
  const raw = rawSettings ?? {};
  const fontBody = toTrimmedOrFallback(raw.fontBody, base.fontBody);
  const fontHeading = toTrimmedOrFallback(raw.fontHeading, base.fontHeading);
  const tabs = normalizeDashboardTabs(raw.tabs ?? base.tabs);
  const defaultTabId = resolvePreferredDashboardTabId(tabs, raw.defaultTabId ?? base.defaultTabId);
  const defaultTabIdWeb = resolvePreferredDashboardTabId(
    tabs,
    raw.defaultTabIdWeb ?? defaultTabId
  );
  const defaultTabIdMobile = resolvePreferredDashboardTabId(
    tabs,
    raw.defaultTabIdMobile ?? defaultTabId
  );
  return {
    ...base,
    ...raw,
    scale: toFiniteNumber(raw.scale, base.scale),
    showHealthCircles:
      typeof raw.showHealthCircles === 'boolean' ? raw.showHealthCircles : base.showHealthCircles,
    widgetOpacity: toFiniteNumber(raw.widgetOpacity, base.widgetOpacity),
    widgetBlurEnabled:
      typeof raw.widgetBlurEnabled === 'boolean' ? raw.widgetBlurEnabled : base.widgetBlurEnabled,
    widgetBlur: Math.min(24, Math.max(0, toFiniteNumber(raw.widgetBlur, base.widgetBlur))),
    widgetBackgroundColor: normalizeHexColor(raw.widgetBackgroundColor, '#141b23'),
    settingsBackgroundColor: normalizeHexColor(raw.settingsBackgroundColor, '#0a1018'),
    backgroundImage:
      typeof raw.backgroundImage === 'string' ? raw.backgroundImage : base.backgroundImage,
    backgroundBlur: 0,
    overlayAlpha: 0,
    gridGap: toFiniteNumber(raw.gridGap, base.gridGap),
    fontBody,
    fontHeading,
    globalTitleFontFamily: toTrimmedOrFallback(
      raw.globalTitleFontFamily,
      fontHeading || base.globalTitleFontFamily
    ),
    globalTitleFontWeight: Math.min(
      900,
      Math.max(300, toFiniteNumber(raw.globalTitleFontWeight, base.globalTitleFontWeight))
    ),
    globalTitleColor: normalizeHexColor(raw.globalTitleColor, '#eef4ff'),
    globalHeaderFontFamily: toTrimmedOrFallback(
      raw.globalHeaderFontFamily,
      fontHeading || base.globalHeaderFontFamily
    ),
    globalHeaderFontWeight: Math.min(
      900,
      Math.max(300, toFiniteNumber(raw.globalHeaderFontWeight, base.globalHeaderFontWeight))
    ),
    globalHeaderColor: normalizeHexColor(raw.globalHeaderColor, '#eef4ff'),
    cardTitleSize: Math.min(48, Math.max(10, toFiniteNumber(raw.cardTitleSize, base.cardTitleSize))),
    cardTitleAboveSize: Math.min(
      36,
      Math.max(8, toFiniteNumber(raw.cardTitleAboveSize, base.cardTitleAboveSize))
    ),
    layoutMode: raw.layoutMode === 'grid' ? 'grid' : 'masonry',
    tabs,
    tabIndicatorStyle: normalizeTabIndicatorStyle(raw.tabIndicatorStyle ?? base.tabIndicatorStyle),
    tabIndicatorColor: normalizeHexColor(raw.tabIndicatorColor, '#21e6da'),
    tabPosition: raw.tabPosition === 'center' ? 'center' : 'left',
    defaultTabIdWeb,
    defaultTabIdMobile,
    defaultTabId
  };
};

export const resolveDashboardDefaultTabId = resolvePreferredDashboardTabId;
