		<script lang="ts">
		  import { onMount } from 'svelte';
		  import WidgetGrid from '$components/WidgetGrid.svelte';
		  import TabIdentityModal from '$lib/components/TabIdentityModal.svelte';
		  import { widgets } from '$lib/stores/widgets';
		  import type { WidgetInstance, DashboardSettings, DashboardTab } from '$widgets/types';
		  import {
		    TAB_ICON_DEFS,
		    getTabIconPaths,
		    normalizeTabIconKey,
		    tabIconFallbackForName,
		    type TabIconKey
		  } from '$widgets/tabIcons';
		  import {
		    widgetStyleCategories,
		    defaultPortBySource,
		    type WidgetStyleOption
		  } from '$lib/shared/widgetCatalog';
		  import {
		    DASHBOARD_GRID_COLUMNS,
		    createDefaultDashboardSettings,
		    normalizeDashboardSettings
		  } from '$lib/shared/dashboardSettings';
		  import { parseExecutionNodes, type ExecutionNodeId } from '$lib/shared/executionNodes';
		  import { clampNumber, toCssImage, toWidgetBackgroundRgb } from '$lib/shared/styleUtils';
		  import { slugifyTabId, reorderById } from '$lib/shared/tabs';
		  import { env as publicEnv } from '$env/dynamic/public';

		  export let data: { widgets: WidgetInstance[]; settings: DashboardSettings; initialTabId?: string };

	  const initialSettings = createDefaultDashboardSettings();
	  let settings: Required<DashboardSettings> = initialSettings;
	  let backgroundStyle = 'none';
	  let editMode = false;
	  let safeScale = 1;
	  let widgetBackgroundRgb = '20, 27, 35';
	  let dashboardTabs: DashboardTab[] = [...initialSettings.tabs];
	  let activeTabId = initialSettings.defaultTabId;
  let visibleWidgets: WidgetInstance[] = [];
  let isMobileViewport = false;
  let hasUserSelectedTab = false;
  let hasTabChangedAfterLoad = false;
  let requestedTabFromUrl = '';
  let hydratedSettingsSource: DashboardSettings | null = null;
  let draggingTabId = '';
  let dragOverTabId = '';
  let dragOverTabPosition: 'before' | 'after' = 'before';
	  let showAddWidgetWizard = false;
	  let layoutDebug = false;
	  let safeGridGap = 16;
	  let showTabIdentityModal = false;
	  let tabIdentityTabId = '';
	  let tabIdentityName = '';
	  let tabIdentityIcon: TabIconKey = 'layoutGrid';
	  let layoutSnapAnchor: {
	    movedId: string;
	    targetId: string;
		    position: 'before' | 'after';
    createdAt: number;
  } | null = null;
  let lastLocalLayoutMutationAt = 0;
  let initialLayoutReady = false;
  let firstStreamHydrated = false;
  let firstStreamPayloadPending = true;
  let addWidgetWizardStep: 'style' | 'node' = 'style';
  let pendingWidgetStyle: WidgetStyleOption | null = null;
	  const EDIT_MODE_STORAGE_KEY = 'lantern.editMode';
	  const LAYOUT_DEBUG_STORAGE_KEY = 'lantern.layoutDebug';
	  const LEGACY_EDIT_MODE_STORAGE_KEY = 'dashboard.editMode';
	  const LEGACY_LAYOUT_DEBUG_STORAGE_KEY = 'dashboard.layoutDebug';
		  const LOCAL_LAYOUT_LOCK_MS = 12000;
		  const BACKGROUND_IMAGE_STORAGE_KEY = 'lantern.backgroundImage';
		  const LEGACY_BACKGROUND_IMAGE_STORAGE_KEY = 'dashboard.backgroundImage';
		  const WIDGET_SNAPSHOT_STORAGE_KEY = 'lantern.widgetSnapshot';
		  const LEGACY_WIDGET_SNAPSHOT_STORAGE_KEY = 'dashboard.widgetSnapshot';
			  const executionNodes = parseExecutionNodes(publicEnv.PUBLIC_EXECUTION_NODES ?? '');
			  const GRID_COLUMNS = DASHBOARD_GRID_COLUMNS;
  const toGridSpan = (widget: WidgetInstance) =>
    Math.max(1, Math.min(24, Math.round(Number(widget.layout?.span ?? 4) * 2)));
  const getWidgetColumnRange = (
    widget: WidgetInstance,
    forcedColumnStart?: number
  ): { start: number; end: number; span: number } => {
    const span = toGridSpan(widget);
    const maxStart = Math.max(1, GRID_COLUMNS - span + 1);
    const rawStart =
      typeof forcedColumnStart === 'number' && Number.isFinite(forcedColumnStart)
        ? forcedColumnStart
        : Number(widget.layout?.columnStart ?? 1);
    const start = Number.isFinite(rawStart) && rawStart > 0 ? Math.round(rawStart) : 1;
    const clampedStart = Math.max(1, Math.min(maxStart, start));
    return {
      start: clampedStart,
      end: Math.min(GRID_COLUMNS, clampedStart + span - 1),
      span
    };
  };
  const rangesOverlap = (leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) =>
    leftStart <= rightEnd && rightStart <= leftEnd;
  const shouldLogLayoutDebug = () => layoutDebug && typeof window !== 'undefined';
  const captureLayoutDomSnapshot = () => {
    if (typeof window === 'undefined') return [];
    const shells = Array.from(document.querySelectorAll<HTMLElement>('.grid.masonry .widget-shell'));
    const toNumberOrNull = (value: string) => {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    return shells.map((shell, domOrder) => {
      const computed = window.getComputedStyle(shell);
      return {
        domOrder,
        id: shell.dataset.widgetId ?? '',
        columnStart: toNumberOrNull(computed.getPropertyValue('--column-start')),
        span: toNumberOrNull(computed.getPropertyValue('--span')),
        rows: toNumberOrNull(computed.getPropertyValue('--rows')),
        rowStart: computed.getPropertyValue('--row-start').trim() || 'auto'
      };
    });
  };
  const logLayoutDebugSnapshot = (
    phase: string,
    widgetsList: WidgetInstance[],
    extra: Record<string, unknown> = {}
  ) => {
    if (!shouldLogLayoutDebug()) return;
    const configSnapshot = widgetsList.map((widget, index) => {
      const range = getWidgetColumnRange(widget);
      return {
        index,
        id: widget.id,
        columnStart: range.start,
        span: range.span,
        columnEnd: range.end
      };
    });
    console.groupCollapsed(`[layout-debug][${phase}]`);
    console.table(configSnapshot);
    console.table(captureLayoutDomSnapshot());
    if (Object.keys(extra).length > 0) {
      console.log('meta', extra);
    }
    console.groupEnd();
  };
  const widgetsEqual = (left: WidgetInstance[], right: WidgetInstance[]) => {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  };

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  const getArrayLength = (value: unknown, key: string) => {
    if (!isRecord(value)) return 0;
    const target = value[key];
    return Array.isArray(target) ? target.length : 0;
  };

  const mergeWidgetsWithCachedData = (
    baseWidgets: WidgetInstance[],
    cachedWidgets: WidgetInstance[]
  ) => {
    if (!Array.isArray(baseWidgets) || baseWidgets.length === 0) return [];
    if (!Array.isArray(cachedWidgets) || cachedWidgets.length === 0) return baseWidgets;
    const cachedById = new Map(cachedWidgets.map((widget) => [widget.id, widget]));
    return baseWidgets.map((widget) => {
      const cached = cachedById.get(widget.id);
      if (!cached || cached.data === undefined) return widget;
      return {
        ...widget,
        data: cached.data,
        health: widget.health ?? cached.health
      };
    });
  };

  const mergeIncomingDataPreservingLayout = (
    currentWidgets: WidgetInstance[],
    incomingWidgets: WidgetInstance[]
  ) => {
    if (!Array.isArray(currentWidgets) || currentWidgets.length === 0) return incomingWidgets;
    if (!Array.isArray(incomingWidgets) || incomingWidgets.length === 0) return currentWidgets;
    const incomingById = new Map(incomingWidgets.map((widget) => [widget.id, widget]));
    const mergedInCurrentOrder: WidgetInstance[] = currentWidgets.flatMap((currentWidget) => {
      const incoming = incomingById.get(currentWidget.id);
      // If a widget was removed upstream, do not keep stale local copies.
      if (!incoming) return [];
      incomingById.delete(currentWidget.id);
      return [
        {
          ...incoming,
          // Preserve local placement while allowing streamed option/content updates.
          ...(currentWidget.layout ? { layout: currentWidget.layout } : {})
        } satisfies WidgetInstance
      ];
    });
    for (const incoming of incomingById.values()) {
      mergedInCurrentOrder.push(incoming);
    }
    return mergedInCurrentOrder;
  };

  const mergeIncomingDataOnly = (
    currentWidgets: WidgetInstance[],
    incomingWidgets: WidgetInstance[]
  ) => {
    if (!Array.isArray(currentWidgets) || currentWidgets.length === 0) return incomingWidgets;
    if (!Array.isArray(incomingWidgets) || incomingWidgets.length === 0) return currentWidgets;
    const incomingById = new Map(incomingWidgets.map((widget) => [widget.id, widget]));
    const mergedInCurrentOrder: WidgetInstance[] = currentWidgets.flatMap((currentWidget) => {
      const incoming = incomingById.get(currentWidget.id);
      // If a widget was removed upstream, do not keep stale local copies.
      if (!incoming) return [];
      incomingById.delete(currentWidget.id);
      return [
        {
          ...currentWidget,
          ...(incoming.data !== undefined ? { data: incoming.data } : {}),
          ...(incoming.health !== undefined ? { health: incoming.health } : {}),
          link: incoming.link ?? currentWidget.link
        } satisfies WidgetInstance
      ];
    });
    for (const incoming of incomingById.values()) {
      mergedInCurrentOrder.push(incoming);
    }
    return mergedInCurrentOrder;
  };

  const markLocalLayoutMutation = () => {
    lastLocalLayoutMutationAt = Date.now();
  };

  const shouldPreserveLocalLayoutOnStream = () =>
    editMode || (Date.now() - lastLocalLayoutMutationAt <= LOCAL_LAYOUT_LOCK_MS);

  const shouldPreserveCachedDataOnFirstStream = (
    incoming: WidgetInstance,
    current: WidgetInstance | undefined,
    enabled: boolean
  ) => {
    if (!enabled || !current || current.data === undefined) return false;
    const incomingData = incoming.data;
    if (isRecord(incomingData) && typeof incomingData.error === 'string' && incomingData.error.trim()) {
      return false;
    }
    if (incoming.source === 'komodo') {
      return getArrayLength(incomingData, 'items') === 0;
    }
    if (incoming.kind === 'speedtest') {
      return getArrayLength(incomingData, 'points') === 0;
    }
    if (incoming.kind === 'chart' && incoming.source === 'technitium') {
      return getArrayLength(incomingData, 'labels') === 0 && getArrayLength(incomingData, 'total') === 0;
    }
    return false;
  };

  const hasMissingKomodoData = (list: WidgetInstance[] | undefined) =>
    Array.isArray(list) &&
    list.some(
      (widget) =>
        widget.source === 'komodo' &&
        (!widget.data ||
          !Array.isArray((widget.data as { items?: unknown[] }).items) ||
          (widget.data as { items?: unknown[] }).items!.length === 0)
    );

  const revealDashboardLayout = () => {
    if (initialLayoutReady) return;
    initialLayoutReady = true;
  };

  $: if (data?.widgets) {
    widgets.set(data.widgets);
  }

	  $: if (data?.settings && data.settings !== hydratedSettingsSource) {
	    hydratedSettingsSource = data.settings;
	    settings = normalizeDashboardSettings(data.settings, settings);
	  }
	  $: if (!requestedTabFromUrl && typeof data?.initialTabId === 'string' && data.initialTabId.trim()) {
	    requestedTabFromUrl = data.initialTabId.trim();
	  }

  $: dashboardTabs =
    Array.isArray(settings.tabs) && settings.tabs.length > 0
      ? settings.tabs
      : [{ id: 'main', name: 'Main' }];
  $: {
    const preferredByViewport = isMobileViewport
      ? settings.defaultTabIdMobile
      : settings.defaultTabIdWeb;
    const preferredDefault =
      typeof preferredByViewport === 'string' &&
      dashboardTabs.some((tab) => tab.id === preferredByViewport)
        ? preferredByViewport
        : typeof settings.defaultTabId === 'string' &&
            dashboardTabs.some((tab) => tab.id === settings.defaultTabId)
          ? settings.defaultTabId
        : dashboardTabs[0]?.id ?? 'main';
    if (
      !hasUserSelectedTab &&
      requestedTabFromUrl &&
      dashboardTabs.some((tab) => tab.id === requestedTabFromUrl)
    ) {
      activeTabId = requestedTabFromUrl;
      hasUserSelectedTab = true;
      requestedTabFromUrl = '';
    } else if (!hasUserSelectedTab) {
      activeTabId = preferredDefault;
    } else if (!dashboardTabs.some((tab) => tab.id === activeTabId)) {
      activeTabId = preferredDefault;
      hasUserSelectedTab = false;
    }
  }
  $: visibleWidgets = $widgets.filter((widget) => {
    const preferredByViewport = isMobileViewport
      ? settings.defaultTabIdMobile
      : settings.defaultTabIdWeb;
    const fallbackTabId =
      typeof preferredByViewport === 'string' &&
      dashboardTabs.some((tab) => tab.id === preferredByViewport)
        ? preferredByViewport
        : typeof settings.defaultTabId === 'string' &&
            dashboardTabs.some((tab) => tab.id === settings.defaultTabId)
          ? settings.defaultTabId
        : (dashboardTabs[0]?.id ?? 'main');
    const requestedWidgetTabId =
      typeof widget.options?.tabId === 'string' ? widget.options.tabId.trim() : '';
    const widgetTabId = dashboardTabs.some((tab) => tab.id === requestedWidgetTabId)
      ? requestedWidgetTabId
      : fallbackTabId;
    return widgetTabId === activeTabId;
  });

	  $: safeScale = Math.min(Math.max(settings.scale ?? 1, 0.5), 1.5);
	  $: safeGridGap = Math.round(clampNumber(settings.gridGap ?? 16, 0, 40, 16));
	  $: widgetBackgroundRgb = toWidgetBackgroundRgb(settings.widgetBackgroundColor);
	  $: backgroundStyle = settings.backgroundImage ? toCssImage(settings.backgroundImage) : 'none';
	  $: if (typeof window !== 'undefined') {
	    const normalized = typeof activeTabId === 'string' ? activeTabId.trim() : '';
	    if (hasTabChangedAfterLoad && normalized && dashboardTabs.some((tab) => tab.id === normalized)) {
	      const params = new URLSearchParams(window.location.search);
	      if (params.get('tab') !== normalized) {
	        params.set('tab', normalized);
	        const query = params.toString();
	        const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
	        window.history.replaceState({}, '', nextUrl);
	      }
	    }
	  }
	  $: if (typeof document !== 'undefined') {
	    const hasCustomBackground = Boolean(settings.backgroundImage?.trim());
	    document.documentElement.style.setProperty('--dash-bg-image', backgroundStyle);
	    document.documentElement.classList.toggle('has-custom-bg', hasCustomBackground);
    document.documentElement.style.setProperty('--font-body', settings.fontBody ?? 'Space Grotesk, Sora, Manrope, sans-serif');
    document.documentElement.style.setProperty('--font-heading', settings.fontHeading ?? settings.fontBody ?? 'Space Grotesk, Sora, Manrope, sans-serif');
    document.documentElement.style.setProperty('--bg-blur', '0px');
    document.documentElement.style.setProperty('--bg-overlay-alpha', '0');
    if (typeof window !== 'undefined') {
      if (hasCustomBackground) {
        window.localStorage.setItem(
          BACKGROUND_IMAGE_STORAGE_KEY,
          settings.backgroundImage?.trim() ?? ''
        );
        window.localStorage.removeItem(LEGACY_BACKGROUND_IMAGE_STORAGE_KEY);
      } else {
        window.localStorage.removeItem(BACKGROUND_IMAGE_STORAGE_KEY);
        window.localStorage.removeItem(LEGACY_BACKGROUND_IMAGE_STORAGE_KEY);
      }
    }
  }

	  const resolveTabIconKey = (tab: DashboardTab): TabIconKey =>
	    normalizeTabIconKey(tab.icon) ?? tabIconFallbackForName(tab.name);

	  const openTabIdentityModal = (tabId: string) => {
	    if (!editMode) return;
	    const tab = dashboardTabs.find((t) => t.id === tabId);
	    if (!tab) return;
	    tabIdentityTabId = tabId;
	    tabIdentityName = tab.name;
	    tabIdentityIcon = resolveTabIconKey(tab);
	    showTabIdentityModal = true;
	  };

	  const closeTabIdentityModal = () => {
	    showTabIdentityModal = false;
	    tabIdentityTabId = '';
	  };

	  const saveTabIdentityModal = async (event: CustomEvent<{ name: string; icon: TabIconKey }>) => {
	    if (!editMode) return;
	    const tabId = tabIdentityTabId;
	    if (!tabId) return;
	    const nextName = event.detail.name.trim();
	    if (!nextName) return;
	    const nextIcon = event.detail.icon;
	    closeTabIdentityModal();
	    const res = await fetch('/api/config', { cache: 'no-store' });
	    if (!res.ok) return;
	    const payload = await res.json();
	    const tabs: DashboardTab[] =
	      Array.isArray(payload.settings?.tabs) && payload.settings.tabs.length > 0
	        ? payload.settings.tabs
	        : dashboardTabs;
	    const nextTabs = tabs.map((tab) =>
	      tab.id === tabId ? { ...tab, name: nextName, icon: nextIcon } : tab
	    );
	    const nextSettings = { ...(payload.settings ?? settings), tabs: nextTabs };
	    settings = { ...settings, ...nextSettings, tabs: nextTabs };
	    dashboardTabs = nextTabs;
	    await fetch('/api/config', {
	      method: 'POST',
	      headers: { 'Content-Type': 'application/json' },
	      body: JSON.stringify({ widgets: payload.widgets ?? [], settings: nextSettings })
	    });
	  };

  const duplicateDashboardTabFromToolbar = async (tabId: string) => {
    if (!editMode) return;
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) return;
    const payload = await res.json();
    const tabs: DashboardTab[] =
      Array.isArray(payload.settings?.tabs) && payload.settings.tabs.length > 0
        ? payload.settings.tabs
        : dashboardTabs;
    const tab = tabs.find((entry) => entry.id === tabId);
    if (!tab) return;

    const makeUniqueTabName = (base: string) => {
      const trimmed = base.trim() || 'Tab';
      const existing = new Set(tabs.map((t) => t.name.toLowerCase().trim()));
      if (!existing.has(trimmed.toLowerCase())) return trimmed;
      let suffix = 2;
      while (existing.has(`${trimmed} ${suffix}`.toLowerCase())) suffix += 1;
      return `${trimmed} ${suffix}`;
    };

    const baseCopyName = `${tab.name} Copy`;
    const name = makeUniqueTabName(baseCopyName);
    const baseId = slugifyTabId(name);
    const existingIds = new Set(tabs.map((t) => t.id));
    let id = baseId;
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

	    const tabIndex = tabs.findIndex((entry) => entry.id === tabId);
	    const nextTabs = [...tabs];
	    nextTabs.splice(Math.max(0, tabIndex + 1), 0, {
	      id,
	      name,
	      icon: normalizeTabIconKey(tab.icon) ?? tabIconFallbackForName(tab.name)
	    });

    const resolvedFallbackTabId =
      typeof payload.settings?.defaultTabIdWeb === 'string' &&
      tabs.some((t) => t.id === payload.settings.defaultTabIdWeb)
        ? payload.settings.defaultTabIdWeb
        : typeof payload.settings?.defaultTabId === 'string' && tabs.some((t) => t.id === payload.settings.defaultTabId)
          ? payload.settings.defaultTabId
          : (tabs[0]?.id ?? 'main');
    const resolveWidgetTabId = (widget: WidgetInstance) => {
      const raw = typeof widget.options?.tabId === 'string' ? widget.options.tabId.trim() : '';
      return tabs.some((t) => t.id === raw) ? raw : resolvedFallbackTabId;
    };

    const cloneId = () =>
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const widgetsList: WidgetInstance[] = Array.isArray(payload.widgets) ? payload.widgets : [];
    const nextWidgets: WidgetInstance[] = [];
    for (const widget of widgetsList) {
      nextWidgets.push(widget);
      if (resolveWidgetTabId(widget) === tabId) {
        nextWidgets.push({
          ...widget,
          id: cloneId(),
          options: {
            ...(widget.options ?? {}),
            tabId: id
          }
        });
      }
    }

    const nextSettings: DashboardSettings = {
      ...(payload.settings ?? settings),
      tabs: nextTabs
    };
    settings = { ...settings, ...nextSettings, tabs: nextTabs };
    dashboardTabs = nextTabs;
    activeTabId = id;
    hasUserSelectedTab = true;
    hasTabChangedAfterLoad = true;
    widgets.set(nextWidgets);
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgets: nextWidgets, settings: nextSettings })
    });
  };

  const updateLayout = async (
    id: string,
    layout: { span: number; height?: number; columnStart?: number }
  ) => {
    layoutSnapAnchor = null;
    const previousWidgets = [...$widgets];
    const nextWidgets = previousWidgets.map((widget: WidgetInstance) =>
      widget.id === id
        ? {
            ...widget,
            layout: {
              span: layout.span,
              height: layout.height,
              columnStart: layout.columnStart
            }
          }
        : widget
    );
    logLayoutDebugSnapshot('resize-before', previousWidgets, { id, layout });
    logLayoutDebugSnapshot('resize-after', nextWidgets, { id, layout });
    markLocalLayoutMutation();
    widgets.set(nextWidgets);
    try {
      const saveRes = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgets: nextWidgets, settings })
      });
      if (!saveRes.ok) {
        widgets.set(previousWidgets);
        layoutSnapAnchor = null;
      }
    } catch {
      widgets.set(previousWidgets);
      layoutSnapAnchor = null;
    }
  };

  const moveWidget = async (
    fromId: string,
    toId: string,
    position: 'before' | 'after' | 'left' | 'right' = 'before',
    targetColumnStartHint?: number
  ) => {
    if (!fromId || !toId || fromId === toId) return;
    const current = [...$widgets];
    const fromIndex = current.findIndex((widget: WidgetInstance) => widget.id === fromId);
    const toIndex = current.findIndex((widget: WidgetInstance) => widget.id === toId);
    if (fromIndex === -1 || toIndex === -1) return;

    const tabs =
      Array.isArray(settings.tabs) && settings.tabs.length > 0
        ? settings.tabs
        : [{ id: 'main', name: 'Main' }];
    const fallbackTabId =
      typeof settings.defaultTabIdWeb === 'string' &&
      tabs.some((tab: { id: string }) => tab.id === settings.defaultTabIdWeb)
        ? settings.defaultTabIdWeb
        : typeof settings.defaultTabId === 'string' &&
            tabs.some((tab: { id: string }) => tab.id === settings.defaultTabId)
          ? settings.defaultTabId
          : tabs[0]?.id ?? 'main';

    const resolveTabId = (widget: WidgetInstance) => {
      const tabId =
        typeof widget.options?.tabId === 'string' ? widget.options.tabId.trim() : '';
      return tabs.some((tab: { id: string }) => tab.id === tabId) ? tabId : fallbackTabId;
    };

    const fromWidget = current[fromIndex];
    const toWidget = current[toIndex];
    if (!fromWidget || !toWidget) return;
    const moved = fromWidget;
    const movedTabId = resolveTabId(fromWidget);
    if (movedTabId !== resolveTabId(toWidget)) return;

    const getColumnStart = (widget: WidgetInstance) => {
      const raw = Number(widget.layout?.columnStart ?? 0);
      if (!Number.isFinite(raw) || raw <= 0) return undefined;
      return Math.round(raw);
    };
    const movedColumnStart = getColumnStart(moved);
    const hasTargetColumnHint =
      typeof targetColumnStartHint === 'number' && Number.isFinite(targetColumnStartHint);
    const targetColumnStart = hasTargetColumnHint
      ? Math.max(1, Math.round(targetColumnStartHint as number))
      : getColumnStart(toWidget);

    const movedSpan = toGridSpan(moved);
    const targetSpan = toGridSpan(toWidget);
    const maxColumnStart = Math.max(1, GRID_COLUMNS - movedSpan + 1);

    let nextColumnStart: number | undefined;
    if (position === 'before' || position === 'after') {
      nextColumnStart = targetColumnStart ?? movedColumnStart;
    } else if (position === 'left') {
      if (hasTargetColumnHint && typeof targetColumnStart === 'number') {
        nextColumnStart = targetColumnStart;
      } else if (typeof targetColumnStart === 'number') {
        nextColumnStart = Math.max(1, targetColumnStart - movedSpan);
      } else {
        nextColumnStart = movedColumnStart;
      }
    } else if (position === 'right') {
      if (hasTargetColumnHint && typeof targetColumnStart === 'number') {
        nextColumnStart = targetColumnStart;
      } else if (typeof targetColumnStart === 'number') {
        nextColumnStart = Math.min(maxColumnStart, targetColumnStart + targetSpan);
      } else {
        nextColumnStart = movedColumnStart;
      }
    } else {
      nextColumnStart = targetColumnStart ?? movedColumnStart;
    }

    const movedWithPlacement = {
      ...moved,
      layout: {
        ...(moved.layout ?? { span: 4 }),
        columnStart:
          typeof nextColumnStart === 'number'
            ? Math.min(maxColumnStart, Math.max(1, nextColumnStart))
            : undefined
      }
    } satisfies WidgetInstance;
    layoutSnapAnchor =
      position === 'before' || position === 'after'
        ? {
            movedId: fromId,
            targetId: toId,
            position,
            createdAt: Date.now()
          }
        : null;

    const reordered = [...current];
    reordered.splice(fromIndex, 1);
    const targetIndex = reordered.findIndex((widget: WidgetInstance) => widget.id === toId);
    if (targetIndex === -1) return;

    const firstIndexInTab = reordered.findIndex(
      (widget: WidgetInstance) => resolveTabId(widget) === movedTabId
    );
    const lastIndexInTab = reordered.reduce(
      (lastIndex: number, widget: WidgetInstance, index: number) =>
        resolveTabId(widget) === movedTabId ? index : lastIndex,
      -1
    );
    const tabInsertStart = firstIndexInTab >= 0 ? firstIndexInTab : reordered.length;
    const tabInsertEndExclusive =
      lastIndexInTab >= 0 ? lastIndexInTab + 1 : tabInsertStart;

    const insertAfter = position === 'after' || position === 'right';
    let insertIndex = targetIndex + (insertAfter ? 1 : 0);

    if (position === 'before' || position === 'after') {
      const movedRange = getWidgetColumnRange(
        movedWithPlacement,
        typeof movedWithPlacement.layout?.columnStart === 'number'
          ? movedWithPlacement.layout.columnStart
          : undefined
      );
      const tabIndices = reordered.reduce<number[]>((acc, widget, index) => {
        if (resolveTabId(widget) === movedTabId) acc.push(index);
        return acc;
      }, []);
      const tabIndexSet = new Set(tabIndices);
      const rangesByIndex = new Map(
        tabIndices.map((index) => [index, getWidgetColumnRange(reordered[index])])
      );
      const directOverlapIndices = tabIndices.filter((index) => {
        const range = rangesByIndex.get(index);
        return Boolean(
          range && rangesOverlap(movedRange.start, movedRange.end, range.start, range.end)
        );
      });
      const seedIndices = Array.from(new Set([targetIndex, ...directOverlapIndices]));
      const visited = new Set<number>();
      const queue = [...seedIndices];
      while (queue.length > 0) {
        const index = queue.shift();
        if (typeof index !== 'number' || visited.has(index)) continue;
        if (!tabIndexSet.has(index)) continue;
        visited.add(index);
        const sourceRange = rangesByIndex.get(index);
        if (!sourceRange) continue;
        for (const candidate of tabIndices) {
          if (visited.has(candidate) || candidate === index) continue;
          const candidateRange = rangesByIndex.get(candidate);
          if (!candidateRange) continue;
          if (
            rangesOverlap(
              sourceRange.start,
              sourceRange.end,
              candidateRange.start,
              candidateRange.end
            )
          ) {
            queue.push(candidate);
          }
        }
      }

      if (visited.size > 0) {
        const componentIndices = [...visited].sort((left, right) => left - right);
        const componentStart = componentIndices[0];
        const componentEndExclusive = componentIndices[componentIndices.length - 1] + 1;
        insertIndex = Math.max(componentStart, Math.min(componentEndExclusive, insertIndex));
      }
    }

    insertIndex = Math.max(tabInsertStart, Math.min(tabInsertEndExclusive, insertIndex));

    logLayoutDebugSnapshot('move-before', current, {
      fromId,
      toId,
      position,
      targetColumnStartHint,
      resolvedColumnStart: movedWithPlacement.layout?.columnStart,
      insertIndex
    });

    reordered.splice(insertIndex, 0, movedWithPlacement);
    const nextWidgets: WidgetInstance[] = reordered;
    logLayoutDebugSnapshot('move-after', nextWidgets, {
      fromId,
      toId,
      position,
      insertIndex
    });
    const previousWidgets = [...$widgets];
    markLocalLayoutMutation();
    widgets.set(nextWidgets);
    try {
      const saveRes = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgets: nextWidgets, settings })
      });
      if (!saveRes.ok) {
        widgets.set(previousWidgets);
        layoutSnapAnchor = null;
      }
    } catch {
      widgets.set(previousWidgets);
      layoutSnapAnchor = null;
    }
  };

  const dropWidgetToGrid = async (fromId: string, relativeX: number, relativeY: number) => {
    if (!fromId) return;
    layoutSnapAnchor = null;
    const current = [...$widgets];
    const fromIndex = current.findIndex((widget: WidgetInstance) => widget.id === fromId);
    if (fromIndex === -1) return;

    const tabs =
      Array.isArray(settings.tabs) && settings.tabs.length > 0
        ? settings.tabs
        : [{ id: 'main', name: 'Main' }];
    const fallbackTabId =
      typeof settings.defaultTabIdWeb === 'string' &&
      tabs.some((tab: { id: string }) => tab.id === settings.defaultTabIdWeb)
        ? settings.defaultTabIdWeb
        : typeof settings.defaultTabId === 'string' &&
            tabs.some((tab: { id: string }) => tab.id === settings.defaultTabId)
          ? settings.defaultTabId
          : tabs[0]?.id ?? 'main';
    const resolveTabId = (widget: WidgetInstance) => {
      const tabId =
        typeof widget.options?.tabId === 'string' ? widget.options.tabId.trim() : '';
      return tabs.some((tab: { id: string }) => tab.id === tabId) ? tabId : fallbackTabId;
    };

    const [moved] = current.splice(fromIndex, 1);
    if (!moved) return;
    const movedTabId = resolveTabId(moved);
    const firstIndexInTab = current.findIndex((widget: WidgetInstance) => resolveTabId(widget) === movedTabId);
    const lastIndexInTab = current.reduce(
      (lastIndex, widget, index) => (resolveTabId(widget) === movedTabId ? index : lastIndex),
      -1
    );
    const placeInTopRow = relativeY <= 0.34;
    const insertIndex = placeInTopRow
      ? firstIndexInTab >= 0
        ? firstIndexInTab
        : current.length
      : lastIndexInTab >= 0
        ? lastIndexInTab + 1
        : current.length;

    const span = toGridSpan(moved);
    const maxColumnStart = Math.max(1, GRID_COLUMNS - span + 1);
    const targetColumn = Math.min(
      maxColumnStart,
      Math.max(1, Math.floor(relativeX * GRID_COLUMNS) + 1)
    );
    const movedWithPlacement = {
      ...moved,
      layout: {
        ...(moved.layout ?? { span: 4 }),
        columnStart: targetColumn
      }
    };

    logLayoutDebugSnapshot('grid-drop-before', $widgets, {
      fromId,
      relativeX,
      relativeY,
      targetColumn
    });

    current.splice(insertIndex, 0, movedWithPlacement);
    logLayoutDebugSnapshot('grid-drop-after', current, {
      fromId,
      relativeX,
      relativeY,
      insertIndex,
      targetColumn
    });
    const previousWidgets = [...$widgets];
    markLocalLayoutMutation();
    widgets.set(current);
    try {
      const saveRes = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgets: current, settings })
      });
      if (!saveRes.ok) {
        widgets.set(previousWidgets);
        layoutSnapAnchor = null;
      }
    } catch {
      widgets.set(previousWidgets);
      layoutSnapAnchor = null;
    }
  };

  const openWidgetSettings = (widgetId: string) => {
    if (!widgetId) return;
    const params = new URLSearchParams();
    params.set('tab', activeTabId);
    params.set('returnTab', activeTabId);
    params.set('widget', widgetId);
    if (editMode) {
      params.set('edit', '1');
    }
    window.location.href = `/editor?${params.toString()}`;
  };

  const addDashboardTabFromToolbar = async () => {
    if (!editMode) return;
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) return;
    const payload = await res.json();
    const tabs: DashboardTab[] =
      Array.isArray(payload.settings?.tabs) && payload.settings.tabs.length > 0
        ? payload.settings.tabs
        : dashboardTabs;
    const baseName = `Tab ${tabs.length + 1}`;
    const baseId = slugifyTabId(baseName);
    const existingIds = new Set(tabs.map((tab) => tab.id));
    let id = baseId;
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
	    const nextTabs = [...tabs, { id, name: baseName, icon: tabIconFallbackForName(baseName) }];
    const nextSettings = {
      ...(payload.settings ?? settings),
      tabs: nextTabs,
      defaultTabIdWeb:
        typeof payload.settings?.defaultTabIdWeb === 'string'
          ? payload.settings.defaultTabIdWeb
          : (settings.defaultTabIdWeb ?? nextTabs[0].id),
      defaultTabIdMobile:
        typeof payload.settings?.defaultTabIdMobile === 'string'
          ? payload.settings.defaultTabIdMobile
          : (settings.defaultTabIdMobile ?? nextTabs[0].id),
      defaultTabId:
        typeof payload.settings?.defaultTabId === 'string'
          ? payload.settings.defaultTabId
          : (settings.defaultTabId ?? nextTabs[0].id)
    };
    settings = { ...settings, ...nextSettings, tabs: nextTabs };
    dashboardTabs = nextTabs;
    activeTabId = id;
    hasUserSelectedTab = true;
    hasTabChangedAfterLoad = true;
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgets: payload.widgets ?? [], settings: nextSettings })
    });
  };

  // Global preferences are managed in the editor.

  const removeDashboardTabFromToolbar = async (tabId: string) => {
    if (!editMode) return;
    if (dashboardTabs.length <= 1) return;
    const tab = dashboardTabs.find((entry) => entry.id === tabId);
    if (!tab) return;
    const confirmed = window.confirm(
      `Delete "${tab.name}" tab and all widgets assigned to it? This cannot be undone.`
    );
    if (!confirmed) return;

    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) return;
    const payload = await res.json();
    const tabs: DashboardTab[] =
      Array.isArray(payload.settings?.tabs) && payload.settings.tabs.length > 0
        ? payload.settings.tabs
        : dashboardTabs;
    if (tabs.length <= 1) return;
    const nextTabs = tabs.filter((entry) => entry.id !== tabId);
    if (nextTabs.length === 0) return;
    const nextDefaultId = nextTabs[0].id;
    const nextSettings = {
      ...(payload.settings ?? settings),
      tabs: nextTabs,
      defaultTabId:
        payload.settings?.defaultTabId === tabId ? nextDefaultId : (payload.settings?.defaultTabId ?? nextDefaultId),
      defaultTabIdWeb:
        payload.settings?.defaultTabIdWeb === tabId ? nextDefaultId : (payload.settings?.defaultTabIdWeb ?? nextDefaultId),
      defaultTabIdMobile:
        payload.settings?.defaultTabIdMobile === tabId
          ? nextDefaultId
          : (payload.settings?.defaultTabIdMobile ?? nextDefaultId)
    };
    const nextWidgets = (payload.widgets ?? []).filter((widget: WidgetInstance) => {
      const widgetTabId =
        typeof widget.options?.tabId === 'string' ? widget.options.tabId.trim() : (settings.defaultTabId ?? 'main');
      return widgetTabId !== tabId;
    });
    settings = { ...settings, ...nextSettings, tabs: nextTabs };
    dashboardTabs = nextTabs;
    if (activeTabId === tabId || !nextTabs.some((entry) => entry.id === activeTabId)) {
      activeTabId = nextTabs[0].id;
      hasUserSelectedTab = true;
      hasTabChangedAfterLoad = true;
    }
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgets: nextWidgets, settings: nextSettings })
    });
  };

  const openAddWidgetWizard = () => {
    if (!editMode) return;
    pendingWidgetStyle = null;
    addWidgetWizardStep = 'style';
    showAddWidgetWizard = true;
  };

  const closeAddWidgetWizard = () => {
    showAddWidgetWizard = false;
    addWidgetWizardStep = 'style';
    pendingWidgetStyle = null;
  };

  const selectWidgetStyle = (style: WidgetStyleOption) => {
    pendingWidgetStyle = style;
    addWidgetWizardStep = 'node';
  };

  const addWidgetFromDashboard = async (nodeId: ExecutionNodeId) => {
    if (!pendingWidgetStyle) return;
    const previousWidgets = [...$widgets];
    const node = executionNodes.find((entry) => entry.value === nodeId);
    const port = defaultPortBySource[pendingWidgetStyle.source];
    const baseUrl = node && port && pendingWidgetStyle.source ? `http://${node.host}:${port}` : '';
    // Avoid ID collisions (keyed {#each} requires unique widget IDs).
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `widget-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const widget: WidgetInstance = {
      id,
      kind: pendingWidgetStyle.kind,
      title: pendingWidgetStyle.title,
      source: pendingWidgetStyle.source,
      layout: {
        span: 4,
        height:
          pendingWidgetStyle.kind === 'speedtest'
            ? 360
            : pendingWidgetStyle.kind === 'monitor' || pendingWidgetStyle.kind === 'systemMonitor'
              ? 240
              : 145
      },
      mobile: { span: 4, hide: false },
      options: {
        tabId: activeTabId || dashboardTabs[0]?.id || 'main',
        executionNode: nodeId,
        healthServer: nodeId,
        titleAboveSpacer: false,
        ...(pendingWidgetStyle.kind === 'systemMonitor'
          ? {
              monitorStyle: 'system',
              monitorDisplay:
                pendingWidgetStyle.presetOptions?.monitorDisplay === 'compact' ||
                pendingWidgetStyle.presetOptions?.monitorDisplay === 'linear' ||
                pendingWidgetStyle.presetOptions?.monitorDisplay === 'header' ||
                pendingWidgetStyle.presetOptions?.monitorDisplay === 'spark'
                  ? pendingWidgetStyle.presetOptions?.monitorDisplay
                  : 'gauge',
              monitorSystemOrientation:
                pendingWidgetStyle.presetOptions?.monitorSystemOrientation === 'stacked'
                  ? 'stacked'
                  : 'side-by-side',
              monitorRefreshSec: Math.min(
                60,
                Math.max(1, Number(pendingWidgetStyle.presetOptions?.monitorRefreshSec ?? 15))
              ),
              monitorSystemNodes: executionNodes.map((entry) => ({
                value: entry.value,
                label: entry.label,
                host: entry.host,
                port: 61208,
                baseUrl: `http://${entry.host}:61208`
              }))
            }
          : {}),
        ...(pendingWidgetStyle.kind === 'monitor'
          ? {
              monitorStyle: 'list'
            }
          : {}),
        ...(pendingWidgetStyle.kind === 'plex'
          ? {
              sessionMetaSize: 20,
              sessionMetaWeight: 300,
              sessionMetaColor: '#eef4ff',
              sessionLabelSize: 12,
              sessionLabelWeight: 300,
              sessionLabelColor: '#9aa8ba',
              nowPlayingAutoMetadata: true
            }
          : {}),
        ...(pendingWidgetStyle.presetOptions ?? {}),
        ...(baseUrl ? { baseUrl } : {})
      }
    };

    // Optimistic insert: return to dashboard immediately and show the new widget without waiting.
    const nextWidgets = [...previousWidgets, widget];
    widgets.set(nextWidgets);
    closeAddWidgetWizard();

    try {
      const saveRes = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgets: nextWidgets,
          settings
        })
      });
      if (!saveRes.ok) {
        widgets.set(previousWidgets);
      }
    } catch {
      widgets.set(previousWidgets);
    }
  };

  const resetTabDragState = () => {
    draggingTabId = '';
    dragOverTabId = '';
    dragOverTabPosition = 'before';
  };

  const handleTabDragStart = (tabId: string, event: DragEvent) => {
    if (!editMode) return;
    draggingTabId = tabId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', tabId);
    }
  };

  const handleTabDragOver = (tabId: string, event: DragEvent) => {
    if (!editMode) return;
    const sourceId = draggingTabId || event.dataTransfer?.getData('text/plain') || '';
    if (!sourceId || sourceId === tabId) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    const position =
      rect && rect.width > 0 && event.clientX - rect.left > rect.width / 2 ? 'after' : 'before';
    dragOverTabId = tabId;
    dragOverTabPosition = position;
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const handleTabDrop = async (tabId: string, event: DragEvent) => {
    if (!editMode) return;
    event.preventDefault();
    const sourceId = draggingTabId || event.dataTransfer?.getData('text/plain') || '';
    const position =
      dragOverTabId === tabId ? dragOverTabPosition : ('before' as 'before' | 'after');
    resetTabDragState();
    if (!sourceId || sourceId === tabId) return;
    const nextTabs = reorderById(dashboardTabs, sourceId, tabId, position);
    if (nextTabs === dashboardTabs) return;
    settings = { ...settings, tabs: nextTabs };
    dashboardTabs = nextTabs;
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) return;
    const payload = await res.json();
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        widgets: payload.widgets ?? [],
        settings: {
          ...(payload.settings ?? settings),
          tabs: nextTabs
        }
      })
    });
  };

	  onMount(() => {
	    let revealTimer: ReturnType<typeof setTimeout> | null = null;
	    const params = new URLSearchParams(window.location.search);
	    if (typeof window !== 'undefined') {
	      let startupWidgets = Array.isArray(data?.widgets) ? data.widgets : [];
	      try {
	        const cachedRaw =
	          window.localStorage.getItem(WIDGET_SNAPSHOT_STORAGE_KEY) ??
	          window.localStorage.getItem(LEGACY_WIDGET_SNAPSHOT_STORAGE_KEY);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as {
            widgets?: WidgetInstance[];
            settings?: DashboardSettings;
          };
          if (Array.isArray(cached.widgets) && cached.widgets.length > 0) {
            const mergedWidgets =
              startupWidgets.length > 0
                ? mergeWidgetsWithCachedData(startupWidgets, cached.widgets)
                : cached.widgets;
            if (mergedWidgets.length > 0) {
              startupWidgets = mergedWidgets;
              widgets.set(startupWidgets);
            }
            if ((data?.widgets?.length ?? 0) === 0 && cached.settings) {
              settings = { ...settings, ...cached.settings };
            }
          }
        }
      } catch {
        // Ignore malformed browser cache.
      }
      const shouldDelayInitialReveal = startupWidgets.length === 0;
      if (shouldDelayInitialReveal) {
        initialLayoutReady = false;
        firstStreamHydrated = false;
        revealTimer = setTimeout(() => {
          revealDashboardLayout();
        }, 80);
	      } else {
	        initialLayoutReady = true;
	        firstStreamHydrated = true;
	      }
	      layoutDebug = false;
	      window.localStorage.removeItem(LAYOUT_DEBUG_STORAGE_KEY);
	      window.localStorage.removeItem(EDIT_MODE_STORAGE_KEY);
	      window.localStorage.removeItem(LEGACY_LAYOUT_DEBUG_STORAGE_KEY);
	      window.localStorage.removeItem(LEGACY_EDIT_MODE_STORAGE_KEY);
	      if (params.get('edit') === '1') {
	        editMode = true;
	      }
	      // Layout debug mode is disabled.
	    }
	    const source = new EventSource('/api/stream');
	    const mediaQuery = window.matchMedia('(max-width: 900px)');
	    if (!requestedTabFromUrl) {
	      requestedTabFromUrl = params.get('tab')?.trim() ?? '';
	    }
	    if (typeof window !== 'undefined') {
	      const shouldClearParams =
	        params.has('edit') || params.has('returnTab') || params.has('widget');
	      if (shouldClearParams) {
	        params.delete('edit');
	        params.delete('returnTab');
	        params.delete('widget');
	        const query = params.toString();
	        const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
	        window.history.replaceState({}, '', nextUrl);
	      }
	    }
	    const syncViewport = () => {
	      isMobileViewport = mediaQuery.matches;
	    };
    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);

    source.addEventListener('widgets', (event) => {
      const payload = JSON.parse(event.data);
      if (!firstStreamHydrated) {
        firstStreamHydrated = true;
        if (revealTimer) {
          clearTimeout(revealTimer);
          revealTimer = null;
        }
        revealDashboardLayout();
      }
      const incomingWidgets = Array.isArray(payload.widgets) ? payload.widgets : [];
      const currentById = new Map($widgets.map((widget) => [widget.id, widget]));
      const stabilizedWidgets = incomingWidgets.map((incoming) => {
        const current = currentById.get(incoming.id);
        if (shouldPreserveCachedDataOnFirstStream(incoming, current, firstStreamPayloadPending)) {
          return {
            ...incoming,
            data: current?.data
          };
        }
        return incoming;
      });
      const preserveLocalLayout = shouldPreserveLocalLayoutOnStream();
      const isFirstPayload = firstStreamPayloadPending;
      const reconciledWidgets =
        isFirstPayload && $widgets.length > 0
          ? mergeIncomingDataOnly($widgets, stabilizedWidgets)
          : preserveLocalLayout && $widgets.length > 0
            ? mergeIncomingDataPreservingLayout($widgets, stabilizedWidgets)
            : stabilizedWidgets;
      if (layoutDebug) {
        console.debug('[layout-debug][stream-reconcile]', {
          preserveLocalLayout,
          editMode,
          msSinceLocalLayoutMutation: Date.now() - lastLocalLayoutMutationAt
        });
      }
      firstStreamPayloadPending = false;
      const changedWidgets = !widgetsEqual(reconciledWidgets, $widgets);
      if (changedWidgets) {
        widgets.set(reconciledWidgets);
      }
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            WIDGET_SNAPSHOT_STORAGE_KEY,
            JSON.stringify({
              widgets: reconciledWidgets,
              settings: payload.settings ?? settings
            })
          );
        } catch {
          // Ignore storage quota/private mode failures.
        }
      }
      settings = normalizeDashboardSettings(payload.settings, settings);
    });

    source.addEventListener('error', () => {
      if (!initialLayoutReady) {
        if (revealTimer) {
          clearTimeout(revealTimer);
          revealTimer = null;
        }
        revealDashboardLayout();
      }
    });

    const handleDocumentClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
      void target;
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showAddWidgetWizard) closeAddWidgetWizard();
      }
    };
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      if (revealTimer) {
        clearTimeout(revealTimer);
        revealTimer = null;
      }
      source.close();
      mediaQuery.removeEventListener('change', syncViewport);
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleEscape);
    };
  });
</script>

<svelte:head>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin="anonymous" />
  <style>{`:root { --dash-bg-image: ${backgroundStyle}; }`}</style>
  {#if settings.backgroundImage}
    <link rel="preload" as="image" href={settings.backgroundImage} fetchpriority="high" />
  {/if}
</svelte:head>

<main class="page">
  <div class="dashboard-toolbar">
    <div class={`tabs-wrap ${settings.tabPosition === 'center' ? 'center' : ''}`}>
      <nav
        class={`dashboard-tabs tab-style-${settings.tabIndicatorStyle ?? 'underline'}`}
        style={`--tab-accent: ${settings.tabIndicatorColor ?? '#21e6da'};`}
        aria-label="Lantern tabs"
      >
	        {#each dashboardTabs as tab (tab.id)}
	          <button
	            class={`dashboard-tab tab-group ${activeTabId === tab.id ? 'active' : ''} ${dragOverTabId === tab.id ? `tab-drop-${dragOverTabPosition}` : ''}`}
            on:click={() => {
              if (activeTabId === tab.id) return;
              activeTabId = tab.id;
              hasUserSelectedTab = true;
              hasTabChangedAfterLoad = true;
            }}
            draggable={editMode}
            on:dragstart={(event) => handleTabDragStart(tab.id, event)}
            on:dragover={(event) => handleTabDragOver(tab.id, event)}
            on:drop={(event) => handleTabDrop(tab.id, event)}
            on:dragend={resetTabDragState}
	          >
	            {#if editMode}
	              <span class={`tab-action-strip ${activeTabId === tab.id ? 'persist' : ''}`} aria-hidden={!editMode}>
	                <span
	                  class="tab-action-btn"
	                  role="button"
	                  tabindex="0"
	                  aria-label={`Rename ${tab.name} tab`}
	                  title="Rename"
	                  on:click|stopPropagation={() => openTabIdentityModal(tab.id)}
	                  on:keydown|stopPropagation={(event) => {
	                    if (event.key === 'Enter' || event.key === ' ') {
	                      event.preventDefault();
	                      openTabIdentityModal(tab.id);
	                    }
	                  }}
	                >
	                  <svg viewBox="0 0 24 24" aria-hidden="true">
	                    <path d="M12 20h9" />
	                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
	                  </svg>
	                </span>
                <span
                  class="tab-action-btn"
                  role="button"
                  tabindex="0"
                  aria-label={`Duplicate ${tab.name} tab`}
                  title="Duplicate"
                  on:click|stopPropagation={() => duplicateDashboardTabFromToolbar(tab.id)}
                  on:keydown|stopPropagation={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      duplicateDashboardTabFromToolbar(tab.id);
                    }
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="9" y="9" width="10" height="10" rx="2" />
                    <rect x="5" y="5" width="10" height="10" rx="2" />
                  </svg>
                </span>
                {#if dashboardTabs.length > 1}
                  <span
                    class="tab-action-btn danger"
                    role="button"
                    tabindex="0"
                    aria-label={`Delete ${tab.name} tab`}
                    title="Delete"
                    on:click|stopPropagation={() => removeDashboardTabFromToolbar(tab.id)}
                    on:keydown|stopPropagation={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        removeDashboardTabFromToolbar(tab.id);
                      }
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </span>
	                {/if}
	              </span>
	            {/if}
	            <svg viewBox="0 0 24 24" aria-hidden="true">
	              {#each getTabIconPaths(resolveTabIconKey(tab)) as d (d)}
	                <path d={d} />
	              {/each}
	            </svg>
	            {tab.name}
	          </button>
	        {/each}
        {#if editMode}
          <button class="dashboard-tab dashboard-tab-add" on:click={addDashboardTabFromToolbar} aria-label="Add tab">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        {/if}
      </nav>
    </div>

    <div class="toolbar-actions">
      <button
	        class={`toolbar-icon-btn edit-toggle ${editMode ? 'active' : ''}`}
	        on:click={() => {
	          editMode = !editMode;
	          if (typeof window !== 'undefined') window.localStorage.removeItem(EDIT_MODE_STORAGE_KEY);
	          if (!editMode) {
	            showAddWidgetWizard = false;
	          }
	        }}
        aria-label={editMode ? 'Disable edit mode' : 'Enable edit mode'}
        title={editMode ? 'Disable edit mode' : 'Enable edit mode'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5zM4 16l4 4" />
        </svg>
      </button>
      <a
        class="toolbar-icon-btn"
        href={`/editor?tab=${encodeURIComponent(activeTabId)}&returnTab=${encodeURIComponent(activeTabId)}${editMode ? '&edit=1' : ''}`}
        aria-label="Open editor"
        title="Open editor"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
          <path d="M2 14h4M10 8h4M18 12h4" />
        </svg>
      </a>
      {#if editMode}
        <button
          class="toolbar-icon-btn add-widget-btn"
          on:click={openAddWidgetWizard}
          aria-label="Add widget"
          title="Add widget"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 8v8M8 12h8M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <div
    class={`dashboard-scale ${editMode ? 'design-mode' : ''} ${initialLayoutReady ? 'layout-ready' : 'layout-pending'}`}
    style={`--ui-scale: ${safeScale}; --grid-columns: ${GRID_COLUMNS}; --widget-opacity: ${settings.widgetOpacity ?? 0.95}; --widget-blur: ${(settings.widgetBlurEnabled ?? true) ? Math.min(24, Math.max(0, Number(settings.widgetBlur ?? 8))) : 0}px; --widget-blue-tint: ${(settings.widgetBlurEnabled ?? true) ? Math.min(0.4, Math.max(0, Number(settings.widgetBlur ?? 8) / 36)) : 0}; --widget-bg-rgb: ${widgetBackgroundRgb}; --grid-gap: ${safeGridGap}px; --tab-accent: ${settings.tabIndicatorColor ?? '#21e6da'}; --card-title-size: ${Math.min(48, Math.max(10, Number(settings.cardTitleSize ?? 17.6)))}px; --card-title-above-size: ${Math.min(36, Math.max(8, Number(settings.cardTitleAboveSize ?? 12)))}px; --card-title-font-family: ${settings.globalTitleFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif'}; --card-title-font-weight: ${Math.min(900, Math.max(300, Number(settings.globalTitleFontWeight ?? 600)))}; --card-title-color: ${settings.globalTitleColor ?? '#eef4ff'}; --card-header-font-family: ${settings.globalHeaderFontFamily ?? settings.fontHeading ?? 'Space Grotesk, Sora, Manrope, sans-serif'}; --card-header-font-weight: ${Math.min(900, Math.max(300, Number(settings.globalHeaderFontWeight ?? 600)))}; --card-header-color: ${settings.globalHeaderColor ?? '#eef4ff'};`}
  >
    <WidgetGrid
      items={visibleWidgets}
      {editMode}
      onResize={updateLayout}
      onMove={moveWidget}
      onOpenSettings={openWidgetSettings}
      onDropToGrid={dropWidgetToGrid}
      layoutMode={settings.layoutMode}
      gridGap={safeGridGap}
      showHealthCircles={settings.showHealthCircles ?? true}
      {layoutDebug}
      snapAnchor={layoutSnapAnchor}
    />
  </div>

	  {#if showAddWidgetWizard && editMode}
	    <div class="widget-wizard-backdrop" role="presentation" on:click|self={closeAddWidgetWizard}>
      <div class="widget-wizard-modal" role="dialog" aria-modal="true" tabindex="-1">
        {#if addWidgetWizardStep === 'style'}
          <div class="widget-wizard-header">
            <h2>Select Widget Style</h2>
            <button class="toolbar-icon-btn mini-close" on:click={closeAddWidgetWizard} aria-label="Close add widget">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div class="widget-wizard-grid">
            {#each widgetStyleCategories as category (category.name)}
              <section class="widget-style-category">
                <h3>{category.name}</h3>
                <div class="widget-style-list">
                  {#each category.options as option (option.title)}
                    <button class="widget-style-card" on:click={() => selectWidgetStyle(option)}>
                      <strong>{option.title}</strong>
                      <span>{option.description}</span>
                    </button>
                  {/each}
                </div>
              </section>
            {/each}
          </div>
        {:else}
          <div class="widget-wizard-header">
            <h2>Select Execution Node</h2>
            <button class="toolbar-icon-btn mini-close" on:click={closeAddWidgetWizard} aria-label="Close add widget">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <p class="widget-wizard-subtitle">
            Widget Style: {pendingWidgetStyle?.title ?? ''}
          </p>
          <div class="widget-node-list">
            {#each executionNodes as node (node.value)}
              <button class="widget-node-card" on:click={() => addWidgetFromDashboard(node.value as ExecutionNodeId)}>
                <strong>{node.label}</strong>
                <span>{node.host}</span>
              </button>
            {/each}
          </div>
          <div class="widget-wizard-actions">
            <button class="dashboard-tab" on:click={() => (addWidgetWizardStep = 'style')}>Back</button>
          </div>
        {/if}
      </div>
	    </div>
	  {/if}

	  <TabIdentityModal
	    open={showTabIdentityModal}
	    initialName={tabIdentityName}
	    initialIcon={tabIdentityIcon}
	    icons={TAB_ICON_DEFS}
	    on:cancel={closeTabIdentityModal}
	    on:save={saveTabIdentityModal}
	  />
</main>

<style>
  .page {
    padding-top: 20px;
  }

  .dashboard-toolbar {
    position: relative;
    z-index: 80;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    padding: 0;
    border: none;
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .tabs-wrap {
    flex: 1 1 auto;
    min-width: 0;
    overflow: visible;
  }

  .tabs-wrap.center {
    display: flex;
    justify-content: center;
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 12px;
    margin-left: auto;
    flex: 0 0 auto;
  }

  .toolbar-icon-btn {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    background: transparent;
    color: var(--muted);
    text-decoration: none;
    transition: all 160ms ease;
  }

  .toolbar-icon-btn svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .toolbar-icon-btn:hover {
    color: var(--text);
    border-color: rgba(106, 168, 255, 0.6);
  }

  .toolbar-icon-btn.edit-toggle.active {
    color: #7db4ff;
    border-color: rgba(59, 130, 246, 0.9);
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.4), 0 0 16px rgba(59, 130, 246, 0.35);
  }

  .toolbar-icon-btn.active {
    color: #eef4ff;
    border-color: rgba(59, 130, 246, 0.75);
    box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.35), 0 0 18px rgba(59, 130, 246, 0.28);
  }

  .dashboard-scale {
    width: calc(100% / var(--ui-scale, 1));
    position: relative;
    transform: scale(var(--ui-scale, 1));
    transform-origin: top left;
    transition: box-shadow 180ms ease, border-color 180ms ease, opacity 160ms ease;
  }

  .dashboard-scale.layout-pending {
    opacity: 0;
    pointer-events: none;
  }

  .dashboard-scale.layout-ready {
    opacity: 1;
  }

  .dashboard-scale.design-mode {
    border-radius: 14px;
    box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.45), 0 0 0 1px rgba(59, 130, 246, 0.18);
  }

	  .dashboard-tabs {
	    display: inline-flex;
	    gap: 8px;
	    margin: 0;
	    padding: 20px 0 0;
	    border: none;
	    background: transparent;
	    min-width: max-content;
	    overflow: visible;
	    overflow-y: visible;
	  }

  .dashboard-tab {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px 10px;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: var(--muted);
    font-size: 0.78rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    line-height: 1;
    white-space: nowrap;
    overflow: visible;
  }

	  .tab-action-strip {
	    position: absolute;
	    top: -18px;
	    left: 50%;
	    transform: translateX(-50%);
	    display: flex;
	    align-items: center;
	    gap: 4px;
	    opacity: 0;
	    pointer-events: none;
	    transition: opacity 120ms ease;
	    z-index: 50;
	  }

	  .dashboard-tab:hover .tab-action-strip,
	  .dashboard-tab:focus-visible .tab-action-strip {
	    opacity: 1;
	    pointer-events: auto;
	  }

	  .dashboard-tab.active .tab-action-strip {
	    opacity: 1;
	    pointer-events: auto;
	  }

  .tab-action-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 6px;
    background: rgba(15, 22, 32, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(161, 161, 170, 0.95);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: color 140ms ease, border-color 140ms ease, background 140ms ease;
  }

  .tab-action-btn:hover {
    color: rgba(244, 244, 245, 0.98);
    border-color: rgba(255, 255, 255, 0.16);
    background: rgba(20, 28, 40, 0.92);
  }

  .tab-action-btn.danger:hover {
    color: rgba(248, 113, 113, 0.98);
    border-color: rgba(248, 113, 113, 0.3);
  }

  .tab-action-btn svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .dashboard-tab svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .dashboard-tab.active {
    color: var(--text);
  }

  .dashboard-tab::after {
    content: '';
    position: absolute;
    left: 22%;
    right: 22%;
    bottom: 1px;
    height: 2px;
    border-radius: 999px;
    background: transparent;
    transition: background 150ms ease, box-shadow 150ms ease;
  }

  .dashboard-tab.active::after {
    background: var(--tab-accent, #21e6da);
  }

  .dashboard-tab.tab-drop-before::before,
  .dashboard-tab.tab-drop-after::before {
    content: '';
    position: absolute;
    top: 6px;
    bottom: 6px;
    width: 2px;
    border-radius: 999px;
    background: rgba(106, 168, 255, 0.98);
    box-shadow: 0 0 10px rgba(106, 168, 255, 0.55);
    pointer-events: none;
  }

  .dashboard-tab.tab-drop-before::before {
    left: -5px;
  }

  .dashboard-tab.tab-drop-after::before {
    right: -5px;
  }

  .dashboard-tab-add {
    color: rgba(218, 233, 255, 0.82);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .dashboard-tab-add {
    border-style: dashed;
  }

  /* Tab indicator menu styles removed: migrated into the control center. */

  .dashboard-tabs.tab-style-box .dashboard-tab.active {
    border-color: color-mix(in srgb, var(--tab-accent, #21e6da) 55%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tab-accent, #21e6da) 30%, transparent);
    background: color-mix(in srgb, var(--tab-accent, #21e6da) 22%, transparent);
  }

  .dashboard-tabs.tab-style-box .dashboard-tab::after {
    display: none;
  }

  .dashboard-tabs.tab-style-neon .dashboard-tab.active::after {
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--tab-accent, #21e6da) 72%, #7f5af0),
      var(--tab-accent, #21e6da)
    );
    box-shadow: 0 0 10px color-mix(in srgb, var(--tab-accent, #21e6da) 65%, transparent);
  }

  .dashboard-tabs.tab-style-dot .dashboard-tab::after {
    left: 50%;
    right: auto;
    width: 6px;
    transform: translateX(-50%);
    height: 6px;
    bottom: -2px;
    border-radius: 999px;
  }

  .dashboard-tabs.tab-style-dot .dashboard-tab.active::after {
    background: var(--tab-accent, #21e6da);
    box-shadow: 0 0 10px color-mix(in srgb, var(--tab-accent, #21e6da) 70%, transparent);
  }

  /* Control Center styles removed from dashboard: implemented in editor. */

  .tab-delete-chip {
    position: absolute;
    top: -4px;
    right: -4px;
    z-index: 10;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    border: 1px solid rgba(255, 107, 107, 0.75);
    background: rgba(145, 25, 25, 0.88);
    color: #ffe7e7;
    opacity: 0.45;
    transition: opacity 120ms ease, transform 120ms ease;
  }

  .tab-delete-chip svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .dashboard-tab:hover .tab-delete-chip,
  .dashboard-tab.active .tab-delete-chip {
    opacity: 1;
  }

  .widget-wizard-backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(3, 8, 15, 0.62);
    backdrop-filter: blur(8px);
  }

  .widget-wizard-modal {
    width: min(940px, calc(100vw - 48px));
    max-height: min(86vh, 900px);
    overflow: auto;
    padding: 16px;
    border-radius: 16px;
    border: 1px solid var(--card-border);
    background: rgba(10, 16, 24, 0.9);
    display: grid;
    gap: 12px;
    box-shadow: 0 20px 44px rgba(0, 0, 0, 0.45);
  }

  .widget-wizard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .widget-wizard-header h2 {
    margin: 0;
    font-size: 1.05rem;
    color: var(--text);
  }

  .toolbar-icon-btn.mini-close {
    width: 30px;
    height: 30px;
  }

  .widget-wizard-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .widget-style-category {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 12px;
    background: rgba(12, 22, 35, 0.72);
    display: grid;
    gap: 10px;
  }

  .widget-style-category h3 {
    margin: 0;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(224, 236, 252, 0.85);
  }

  .widget-style-list {
    display: grid;
    gap: 8px;
  }

  .widget-style-card,
  .widget-node-card {
    display: grid;
    gap: 4px;
    text-align: left;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(15, 25, 38, 0.74);
    color: var(--text);
  }

  .widget-style-card strong,
  .widget-node-card strong {
    font-size: 0.84rem;
  }

  .widget-style-card span,
  .widget-node-card span,
  .widget-wizard-subtitle {
    font-size: 0.74rem;
    color: var(--muted);
  }

  .widget-style-card:hover,
  .widget-node-card:hover {
    border-color: rgba(106, 168, 255, 0.68);
    box-shadow: 0 0 0 1px rgba(106, 168, 255, 0.24);
  }

  .widget-node-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .widget-wizard-actions {
    display: flex;
    justify-content: flex-end;
  }

  .widget-wizard-actions .dashboard-tab {
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: var(--text);
  }

  .widget-wizard-subtitle {
    margin: 0;
  }

  @media (max-width: 900px) {
    .dashboard-toolbar {
      flex-wrap: nowrap;
      align-items: flex-end;
    }

    .tabs-wrap {
      width: auto;
      order: 0;
      flex: 1 1 auto;
      overflow-x: auto;
      overflow-y: visible;
      -ms-overflow-style: none;
      scrollbar-width: none;
    }

    .toolbar-actions {
      order: 0;
      margin-left: auto;
      padding-left: 8px;
    }

    .tabs-wrap::-webkit-scrollbar {
      display: none;
    }

    .widget-wizard-grid,
    .widget-node-list {
      grid-template-columns: 1fr;
    }
  }
</style>
