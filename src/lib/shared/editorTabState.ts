import type { DashboardSettings, DashboardTab, WidgetInstance } from '$widgets/types';
import { normalizeDashboardTabs, resolveDashboardDefaultTabId } from './dashboardSettings';

export type EditorTabState = {
  tabs: DashboardTab[];
  defaultTabId: string;
  defaultTabIdWeb: string;
  defaultTabIdMobile: string;
};

export const resolveEditorTabState = (
  tabsInput: unknown,
  settings: Pick<DashboardSettings, 'defaultTabId' | 'defaultTabIdWeb' | 'defaultTabIdMobile'>,
  preferredDefaultTabId?: string
): EditorTabState => {
  const tabs = normalizeDashboardTabs(tabsInput);
  const defaultTabId = resolveDashboardDefaultTabId(
    tabs,
    preferredDefaultTabId ?? settings.defaultTabId
  );
  const defaultTabIdWeb = resolveDashboardDefaultTabId(
    tabs,
    settings.defaultTabIdWeb ?? defaultTabId
  );
  const defaultTabIdMobile = resolveDashboardDefaultTabId(
    tabs,
    settings.defaultTabIdMobile ?? defaultTabId
  );
  return {
    tabs,
    defaultTabId,
    defaultTabIdWeb,
    defaultTabIdMobile
  };
};

export const resolveEditorWidgetTabId = (
  widget: WidgetInstance | undefined,
  tabs: DashboardTab[],
  fallbackTabId: string
) => {
  if (!widget) return fallbackTabId;
  const tabId = typeof widget.options?.tabId === 'string' ? widget.options.tabId.trim() : '';
  return tabs.some((tab) => tab.id === tabId) ? tabId : fallbackTabId;
};

export const reconcileWidgetsWithEditorTabs = (
  widgets: WidgetInstance[],
  tabs: DashboardTab[],
  fallbackTabId: string
) =>
  widgets.map((widget) => ({
    ...widget,
    options: {
      ...(widget.options ?? {}),
      tabId: resolveEditorWidgetTabId(widget, tabs, fallbackTabId)
    }
  }));

export const normalizeEditorTabConfig = (
  configLike: { widgets?: WidgetInstance[]; settings?: DashboardSettings },
  preferredDefaultTabId?: string
) => {
  const tabState = resolveEditorTabState(
    configLike.settings?.tabs,
    {
      defaultTabId: configLike.settings?.defaultTabId,
      defaultTabIdWeb: configLike.settings?.defaultTabIdWeb,
      defaultTabIdMobile: configLike.settings?.defaultTabIdMobile
    },
    preferredDefaultTabId
  );
  return {
    tabState,
    settings: {
      ...(configLike.settings ?? {}),
      tabs: tabState.tabs,
      defaultTabId: tabState.defaultTabId,
      defaultTabIdWeb: tabState.defaultTabIdWeb,
      defaultTabIdMobile: tabState.defaultTabIdMobile
    } satisfies DashboardSettings,
    widgets: reconcileWidgetsWithEditorTabs(
      configLike.widgets ?? [],
      tabState.tabs,
      tabState.defaultTabId
    )
  };
};
