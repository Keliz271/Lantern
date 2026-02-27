<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import type { WidgetInstance } from '$widgets/types';
  import { getStackIconUrl } from '$lib/shared/dashboardIcons';

  type ServiceItem = {
    name: string;
    status: 'ok' | 'warn' | 'down';
    detail?: string;
    href?: string;
    icon?: string;
  };

  type ServicePayload = {
    summary?: {
      total: number;
      running: number;
      issues: number;
      stopped?: number;
      down?: number;
      unhealthy?: number;
      unknown?: number;
    };
    items: ServiceItem[];
    error?: string;
  };

  export let widget: WidgetInstance<ServicePayload>;

  let items: ServiceItem[] = [];
  let komodoCachedItems: ServiceItem[] = [];
  let komodoCachedSummary: ServicePayload['summary'] | null = null;
  let collapsedItems: ServiceItem[] = [];
  let visibleItems: ServiceItem[] = [];
  let renderedItems: ServiceItem[] = [];
  let expanded = false;
  let limit = 0;
  let collapsible = true;
  let layoutMode = 'list';
  let isKomodo = false;

  let komodoColumns = 3;
  let komodoMaxRows = 2;
  let komodoRowsAuto = false;
  let komodoVisibleRows = 2;
  let komodoCollapsedLimit = 0;
  let komodoRowHeight = 112;
  let komodoRowGap = 10;
  let komodoListMaxHeight = 244;
  let komodoListMinHeight = 0;
  let komodoContainerHeight = 112;
  let komodoNameFont = '';
  let komodoNameWeight = 600;
  let komodoNameSize = 16;
  let komodoNameColor = '#eef4ff';
  let komodoServerFont = '';
  let komodoServerWeight = 600;
  let komodoServerSize = 12;
  let komodoServerColor = '#9aa8ba';
  let komodoItemBackground = '#0a1018';
  let komodoItemBorder = true;
  let komodoItemBorderColor = '#ffffff';
  let komodoItemBorderStyle: 'solid' | 'dashed' | 'glow' = 'solid';

  let targetCardHeight = 0;
  let collapsedCap = 0;
  let effectiveLimit = 0;
  let hiddenCount = 0;
  let collapseLimit = 0;
  let showMoreVisible = false;
  let komodoScrollable = false;
  let komodoExpandedOverflow = false;
  let komodoExpandedLockHeight = 0;
  let komodoTransitioning = false;
  let komodoTransitionTimer: ReturnType<typeof setTimeout> | null = null;
  let komodoTransitionRowHeight = 0;
  let komodoCollapseTargetRowHeight = 0;
  let komodoCollapseTargetMaxHeight = 0;
  let komodoCollapsedCapacityLock = 0;
  let komodoCollapsedLockCardHeight = 0;
  let komodoTransitionStartedAt = 0;
  let komodoRenderExpanded = false;
  let komodoCollapsing = false;

  let failedIconUrls = new Set<string>();
  let rootEl: HTMLElement | null = null;
  let listEl: HTMLDivElement | null = null;
  let summaryEl: HTMLDivElement | null = null;
  let widgetFooterEl: HTMLDivElement | null = null;
  let showMoreButtonEl: HTMLButtonElement | null = null;
  let showMoreWrapEl: HTMLDivElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let frameId = 0;
  let komodoLayoutSignature = '';
  let komodoCacheHydratedFor = '';
  let komodoIcon = '';
  const komodoStatusIconPath =
    'M224,64H32A16,16,0,0,0,16,80v96a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V80A16,16,0,0,0,224,64Zm0,112H32V80H224v96Zm-24-48a12,12,0,1,1-12-12A12,12,0,0,1,200,128Z';
  const emptyKomodoSummary: NonNullable<ServicePayload['summary']> = {
    total: 0,
    running: 0,
    issues: 0,
    stopped: 0,
    down: 0,
    unhealthy: 0,
    unknown: 0
  };

  $: limit = Number(widget.options?.limit ?? 0);
  $: collapsible = widget.options?.collapsible !== false;
  $: layoutMode = typeof widget.options?.layout === 'string' ? widget.options.layout : 'list';
  $: isKomodo = widget.source === 'komodo';
  $: {
    const nextItems = widget.data?.items ?? [];
    const hasError = Boolean(widget.data?.error);
    const cacheKey = `komodo-cache:${widget.id}`;
    if (!isKomodo) {
      items = nextItems;
      komodoCachedItems = [];
      komodoCachedSummary = null;
      komodoCacheHydratedFor = '';
    } else if (nextItems.length > 0) {
      if (komodoCacheHydratedFor !== cacheKey && typeof window !== 'undefined') {
        komodoCacheHydratedFor = cacheKey;
      }
      komodoCachedItems = nextItems;
      if (widget.data?.summary) {
        komodoCachedSummary = widget.data.summary;
      }
      items = nextItems;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            cacheKey,
            JSON.stringify({
              items: nextItems,
              summary: widget.data?.summary ?? komodoCachedSummary ?? null
            })
          );
        } catch {
          // Ignore storage quota/private mode failures.
        }
      }
    } else if (hasError) {
      items = [];
      komodoCachedItems = [];
      komodoCachedSummary = null;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(cacheKey);
        } catch {
          // Ignore storage access failures.
        }
      }
    } else {
      if (komodoCacheHydratedFor !== cacheKey && typeof window !== 'undefined') {
        komodoCacheHydratedFor = cacheKey;
        try {
          const cachedRaw = window.localStorage.getItem(cacheKey);
          if (cachedRaw) {
            const parsed = JSON.parse(cachedRaw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              // Backward compatibility with older cache shape.
              komodoCachedItems = parsed as ServiceItem[];
            } else if (parsed && typeof parsed === 'object') {
              if (Array.isArray(parsed.items) && parsed.items.length > 0) {
                komodoCachedItems = parsed.items as ServiceItem[];
              }
              if (parsed.summary && typeof parsed.summary === 'object') {
                komodoCachedSummary = parsed.summary as NonNullable<ServicePayload['summary']>;
              }
            }
          }
        } catch {
          // Ignore malformed cache entries.
        }
      }
      if (widget.data?.summary) {
        komodoCachedSummary = widget.data.summary;
      }
      items = komodoCachedItems.length > 0 ? komodoCachedItems : nextItems;
    }
  }
  $: komodoContainerHeight = Math.min(
    320,
    Math.max(72, Number(widget.options?.containerHeight ?? 112))
  );
  $: if (isKomodo) {
    const legacyLimit = Math.max(0, Number(widget.options?.limit ?? 0));
    const rawCols = Number(widget.options?.komodoColumns);
    const rawRows = Number(widget.options?.komodoRows);

    const hasCols = Number.isFinite(rawCols) && rawCols > 0;
    const hasRows = Number.isFinite(rawRows) && rawRows > 0;
    const hasAutoRows = Number.isFinite(rawRows) && Math.round(rawRows) === 0;

    komodoColumns = Math.min(12, Math.max(1, Math.round(hasCols ? rawCols : 3)));
    komodoRowsAuto = hasAutoRows;
    komodoMaxRows = (() => {
      if (hasRows) return Math.min(20, Math.max(1, Math.round(rawRows)));
      if (legacyLimit > 0) {
        return layoutMode === 'grid'
          ? Math.min(20, Math.max(1, Math.ceil(legacyLimit / komodoColumns)))
          : Math.min(50, Math.max(1, Math.round(legacyLimit)));
      }
      return 2;
    })();

    // Seed collapsed capacity before first resize pass so "Show More" and card rows
    // render in a stable state on initial paint (prevents stretch/flicker on refresh).
    if (collapsible && !expanded && komodoCollapsedLimit <= 0) {
      komodoCollapsedLimit = Math.max(1, komodoColumns * komodoMaxRows);
    }

    const estimatedRowHeight = Math.min(
      320,
      Math.max(48, Math.round(komodoContainerHeight))
    );
    const estimatedRowGap = 10;
    const reserveCollapsedRows = items.length === 0 && !widget.data?.error;
    const collapsedRows = Math.max(
      1,
      reserveCollapsedRows
        ? komodoMaxRows
        : layoutMode === 'grid'
          ? Math.min(
              komodoMaxRows,
              Math.ceil(Math.max(1, Math.min(items.length, komodoCollapsedLimit)) / komodoColumns)
            )
          : Math.min(komodoMaxRows, Math.max(1, Math.min(items.length, komodoCollapsedLimit)))
    );
    const expandedRows = Math.max(
      1,
      layoutMode === 'grid'
        ? Math.ceil(Math.max(1, items.length) / komodoColumns)
        : Math.max(1, items.length)
    );
    const targetRows = collapsible && expanded ? expandedRows : collapsedRows;
    const estimatedListHeight =
      targetRows * estimatedRowHeight + Math.max(0, targetRows - 1) * estimatedRowGap;

    // Seed before first mount/layout pass so rows don't flash hidden on refresh.
    if (!listEl || komodoListMaxHeight <= 0) {
      komodoRowHeight = estimatedRowHeight;
      komodoRowGap = estimatedRowGap;
      komodoListMaxHeight = estimatedListHeight;
      komodoListMinHeight = reserveCollapsedRows ? estimatedListHeight : 0;
    }
  }
  $: komodoNameFont =
    typeof widget.options?.containerNameFont === 'string'
      ? widget.options.containerNameFont.trim()
      : '';
  $: komodoNameWeight = Math.min(
    900,
    Math.max(300, Number(widget.options?.containerNameWeight ?? 600))
  );
  $: komodoNameSize = Math.min(
    48,
    Math.max(10, Number(widget.options?.containerNameSize ?? 16))
  );
  $: komodoNameColor =
    typeof widget.options?.containerNameColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.containerNameColor)
      ? widget.options.containerNameColor
      : '#eef4ff';
  $: komodoServerFont =
    typeof widget.options?.containerServerFont === 'string'
      ? widget.options.containerServerFont.trim()
      : '';
  $: komodoServerWeight = Math.min(
    900,
    Math.max(300, Number(widget.options?.containerServerWeight ?? 600))
  );
  $: komodoServerSize = Math.min(
    36,
    Math.max(8, Number(widget.options?.containerServerSize ?? 12))
  );
  $: komodoServerColor =
    typeof widget.options?.containerServerColor === 'string' &&
    /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.containerServerColor)
      ? widget.options.containerServerColor
      : '#9aa8ba';
  $: komodoItemBackground =
    typeof widget.options?.containerBackgroundColor === 'string' &&
    widget.options.containerBackgroundColor.trim().length > 0
      ? widget.options.containerBackgroundColor
      : '#0a1018';
  $: komodoItemBorder = widget.options?.showContainerBorder !== false;
  $: komodoItemBorderColor =
    typeof widget.options?.containerBorderColor === 'string' &&
    widget.options.containerBorderColor.trim().length > 0
      ? widget.options.containerBorderColor
      : '#ffffff';
  $: komodoItemBorderStyle =
    widget.options?.containerBorderStyle === 'dashed' || widget.options?.containerBorderStyle === 'glow'
      ? widget.options.containerBorderStyle
      : 'solid';
  $: targetCardHeight = Math.max(0, Number(widget.layout?.height ?? 0));
  $: collapseLimit = isKomodo ? komodoCollapsedLimit : limit;
  $: collapsedCap = !isKomodo && collapsible && limit > 0 ? Math.max(1, limit) : 0;
  $: effectiveLimit =
    !isKomodo && collapsible && limit > 0
      ? Math.max(1, Math.min(collapsedCap, effectiveLimit || Math.min(limit, collapsedCap)))
      : 0;
  $: hiddenCount =
    collapsible && collapseLimit > 0
      ? Math.max(0, items.length - (isKomodo ? collapseLimit : effectiveLimit))
      : 0;
  $: collapsedItems =
    collapsible && collapseLimit > 0
      ? items.slice(0, isKomodo ? collapseLimit : effectiveLimit || limit)
      : items;
  $: visibleItems = collapsible && collapseLimit > 0 && !expanded ? collapsedItems : items;
  $: if (!isKomodo) {
    renderedItems = visibleItems;
  } else if (expanded || komodoCollapsing) {
    renderedItems = items;
  } else {
    renderedItems = collapsedItems;
  }
  $: komodoIcon = getStackIconUrl('komodo');
  $: effectiveSummary = isKomodo
    ? widget.data?.summary ?? komodoCachedSummary ?? emptyKomodoSummary
    : widget.data?.summary;

  $: if (!isKomodo && (!collapsible || limit <= 0)) {
    effectiveLimit = 0;
  }

  $: if (!isKomodo && expanded) {
    effectiveLimit = Math.max(1, limit || items.length || 1);
  } else if (!isKomodo && collapsible && limit > 0) {
    scheduleLimitRecompute();
  }

  $: if (isKomodo && collapsible) {
    const nextKomodoLayoutSignature = [
      expanded ? '1' : '0',
      layoutMode,
      String(komodoColumns),
      String(komodoMaxRows),
      komodoRowsAuto ? '1' : '0',
      String(komodoContainerHeight),
      String(items.length),
      String(targetCardHeight)
    ].join('|');
    if (nextKomodoLayoutSignature !== komodoLayoutSignature) {
      komodoLayoutSignature = nextKomodoLayoutSignature;
      scheduleLimitRecompute();
    }
  } else {
    komodoLayoutSignature = '';
  }

  $: showMoreVisible = collapsible && (expanded || (collapseLimit > 0 && hiddenCount > 0));
  $: komodoScrollable =
    isKomodo &&
    ((!collapsible && items.length > Math.max(1, komodoCollapsedLimit)) ||
      komodoExpandedOverflow ||
      (collapsible &&
        expanded &&
        typeof window !== 'undefined' &&
        window.matchMedia('(max-width: 900px)').matches));
  $: if (!isKomodo) {
    komodoRenderExpanded = false;
    komodoCollapsing = false;
    komodoCollapseTargetRowHeight = 0;
    komodoCollapseTargetMaxHeight = 0;
    komodoCollapsedCapacityLock = 0;
    komodoCollapsedLockCardHeight = 0;
    komodoExpandedLockHeight = 0;
  }
  $: if (isKomodo && !collapsible) {
    komodoRenderExpanded = true;
    komodoCollapsing = false;
    komodoCollapseTargetRowHeight = 0;
    komodoCollapseTargetMaxHeight = 0;
    komodoCollapsedCapacityLock = 0;
    komodoCollapsedLockCardHeight = 0;
    komodoExpandedLockHeight = 0;
  }
  $: reserveKomodoShowMoreSlot = isKomodo && collapsible;

	  const getInitial = (name: string) => {
	    const value = name.trim();
	    return value ? value[0]!.toUpperCase() : '?';
	  };

  const canShowIcon = (url?: string) => Boolean(url) && !failedIconUrls.has(url!);

  const handleIconError = (url?: string) => {
    if (!url || failedIconUrls.has(url)) return;
    failedIconUrls = new Set([...failedIconUrls, url]);
  };

  const rowsThatFit = (availableHeight: number, rowHeight: number, rowGap: number) => {
    if (availableHeight <= 0) return 1;
    return Math.max(1, Math.floor((availableHeight + rowGap) / (rowHeight + rowGap)));
  };

  const getGridColumnCount = (styles: CSSStyleDeclaration) => {
    const template = styles.gridTemplateColumns;
    if (!template || template === 'none') return 1;

    const tracks: string[] = [];
    let token = '';
    let depth = 0;

    for (const char of template) {
      if (char === '(') depth += 1;
      if (char === ')') depth = Math.max(0, depth - 1);
      if (char === ' ' && depth === 0) {
        if (token.trim()) tracks.push(token.trim());
        token = '';
        continue;
      }
      token += char;
    }
    if (token.trim()) tracks.push(token.trim());

    return Math.max(1, tracks.length);
  };

  const getRenderedColumnCount = (list: HTMLDivElement, styles: CSSStyleDeclaration) => {
    const children = Array.from(list.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement
    );
    if (children.length > 1) {
      const firstTop = children[0].offsetTop;
      const sameRow = children.filter((node) => node.offsetTop === firstTop).length;
      if (sameRow > 1) return sameRow;
    }
    return getGridColumnCount(styles);
  };

	  const getAvailableHeight = () => {
	    if (!rootEl) return 0;
	    const cardEl = rootEl.closest('.card') as HTMLElement | null;
	    if (!cardEl) return Math.max(0, rootEl.clientHeight);

	    const cardRect = cardEl.getBoundingClientRect();
	    const rootRect = rootEl.getBoundingClientRect();
	    const cardStyles = window.getComputedStyle(cardEl);
	    const paddingBottom = Number.parseFloat(cardStyles.paddingBottom || '0') || 0;
	    // Prefer the real DOM height so live resizing updates this widget in real time.
	    // During Komodo collapse transition, use persisted closed height to avoid
	    // solving rows against expanded height (which causes late snap shut).
	    const usePersistedCollapsedHeight =
	      isKomodo && collapsible && komodoTransitioning && komodoCollapsing && targetCardHeight > 0;
	    const effectiveCardHeight = usePersistedCollapsedHeight
	      ? targetCardHeight
	      : cardRect.height > 0
	        ? cardRect.height
	        : isKomodo && targetCardHeight > 0
	          ? targetCardHeight
	          : cardRect.height;

	    // Small slack prevents rows dropping too early at boundary heights while resizing.
	    const fitSlack = 8;
	    return Math.max(
	      0,
	      effectiveCardHeight - (rootRect.top - cardRect.top) - paddingBottom + fitSlack
	    );
	  };

  const komodoMinRowHeight = 48;

  const getKomodoFooterReservedHeight = () => {
    if (!collapsible) return 0;
    const fallback = Math.max(showMoreButtonEl?.offsetHeight ?? 0, 34);
    if (!widgetFooterEl || typeof window === 'undefined') return fallback;
    const styles = window.getComputedStyle(widgetFooterEl);
    const marginTop = Number.parseFloat(styles.marginTop || '0') || 0;
    const marginBottom = Number.parseFloat(styles.marginBottom || '0') || 0;
    return (widgetFooterEl.offsetHeight || fallback) + marginTop + marginBottom;
  };

  const recomputeKomodoLayout = async () => {
    if (!isKomodo) return;
    await tick();
    if (!listEl) return;
    const listStyles = window.getComputedStyle(listEl);
    komodoRowGap = Number.parseFloat(listStyles.rowGap || listStyles.gap || '10') || 10;

    const configuredRows = Math.max(1, komodoMaxRows);
    const allowCollapsedAutoGrowth = collapsible && komodoRowsAuto;
    const columns = Math.max(1, komodoColumns);
    const baseRowHeight = Math.min(320, Math.max(komodoMinRowHeight, Math.round(komodoContainerHeight)));
    const totalRows = Math.max(
      1,
      layoutMode === 'grid' ? Math.ceil(Math.max(1, items.length) / columns) : Math.max(1, items.length)
    );
    const reserveCollapsedRows = items.length === 0 && !widget.data?.error;
    const collapsedRows = Math.max(
      1,
      reserveCollapsedRows
        ? configuredRows
        : layoutMode === 'grid'
          ? Math.min(
              configuredRows,
              Math.ceil(Math.max(1, Math.min(items.length, configuredRows * columns)) / columns)
            )
          : Math.min(configuredRows, Math.max(1, Math.min(items.length, configuredRows)))
    );
    const expandedRows = Math.max(
      1,
      layoutMode === 'grid' ? Math.ceil(Math.max(1, items.length) / columns) : Math.max(1, items.length)
    );
    const stableRowHeight = Math.min(
      320,
      Math.max(
        komodoMinRowHeight,
        Math.round(komodoTransitionRowHeight > 0 ? komodoTransitionRowHeight : komodoRowHeight || baseRowHeight)
      )
    );
    const summaryHeight = summaryEl?.offsetHeight ?? 0;
    const summaryGap = summaryEl ? 8 : 0;
    const footerReservedHeight = getKomodoFooterReservedHeight();
    const availableHeight = Math.max(0, getAvailableHeight());

    // During show more/less transitions, keep card rows fixed-height so they don't
    // stretch/shrink mid-animation. Only animate the clip/max-height.
    if (komodoTransitioning) {
      komodoExpandedOverflow = false;
      const targetRows = collapsible && expanded ? expandedRows : collapsedRows;
      // Keep row visuals stable during animation and animate only max-height.
      let transitionRowHeight = stableRowHeight;
      let transitionListMaxHeight =
        targetRows * transitionRowHeight + Math.max(0, targetRows - 1) * komodoRowGap;
      if (komodoCollapsing) {
        if (komodoCollapseTargetRowHeight > 0 && komodoCollapseTargetMaxHeight > 0) {
          transitionRowHeight = komodoCollapseTargetRowHeight;
          transitionListMaxHeight = komodoCollapseTargetMaxHeight;
        } else {
          const availableListHeight = Math.max(
            komodoMinRowHeight,
            availableHeight - summaryHeight - summaryGap - footerReservedHeight
          );
          const rawRowHeight = Math.floor(
            (availableListHeight - Math.max(0, targetRows - 1) * komodoRowGap) / targetRows
          );
          const closedRowHeight = Math.min(320, Math.max(komodoMinRowHeight, rawRowHeight));
          transitionRowHeight = Math.min(stableRowHeight, closedRowHeight);
          transitionListMaxHeight =
            targetRows * transitionRowHeight + Math.max(0, targetRows - 1) * komodoRowGap;
          // Freeze collapse targets for the remainder of this transition so late
          // layout observers cannot perturb the endpoint and cause a final jump.
          komodoCollapseTargetRowHeight = transitionRowHeight;
          komodoCollapseTargetMaxHeight = transitionListMaxHeight;
          komodoCollapsedCapacityLock =
            layoutMode === 'grid' ? columns * Math.max(1, targetRows) : Math.max(1, targetRows);
          komodoCollapsedLockCardHeight = targetCardHeight;
        }
      }
      komodoRowHeight = transitionRowHeight;
      komodoVisibleRows = Math.max(1, targetRows);
      const capacity = layoutMode === 'grid' ? columns * komodoVisibleRows : komodoVisibleRows;
      komodoCollapsedLimit = Math.max(1, capacity);
      komodoListMaxHeight = transitionListMaxHeight;
      komodoListMinHeight = reserveCollapsedRows ? komodoListMaxHeight : 0;
      return;
    }

    if (collapsible && !expanded && komodoCollapseTargetRowHeight > 0 && komodoCollapseTargetMaxHeight > 0) {
      const cardHeightDrift =
        targetCardHeight > 0 && komodoCollapsedLockCardHeight > 0
          ? Math.abs(targetCardHeight - komodoCollapsedLockCardHeight)
          : 0;
      if (cardHeightDrift <= 1) {
        komodoRowHeight = komodoCollapseTargetRowHeight;
        komodoVisibleRows = Math.max(1, collapsedRows);
        komodoCollapsedLimit = Math.max(
          1,
          komodoCollapsedCapacityLock > 0
            ? komodoCollapsedCapacityLock
            : layoutMode === 'grid'
              ? columns * komodoVisibleRows
              : komodoVisibleRows
        );
        komodoListMaxHeight = komodoCollapseTargetMaxHeight;
        komodoListMinHeight = reserveCollapsedRows ? komodoListMaxHeight : 0;
        komodoExpandedOverflow = false;
        komodoExpandedLockHeight = 0;
        return;
      }
      komodoCollapseTargetRowHeight = 0;
      komodoCollapseTargetMaxHeight = 0;
      komodoCollapsedCapacityLock = 0;
      komodoCollapsedLockCardHeight = 0;
    }

    // Expanded mode should keep a fixed row height to avoid end-of-expand shrink.
    if (collapsible && expanded) {
      const isMobileViewport =
        typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches;
      komodoRowHeight = stableRowHeight;
      komodoVisibleRows = Math.max(1, expandedRows);
      const capacity = layoutMode === 'grid' ? columns * komodoVisibleRows : komodoVisibleRows;
      komodoCollapsedLimit = Math.max(1, capacity);
      const expandedListHeight =
        komodoVisibleRows * komodoRowHeight + Math.max(0, komodoVisibleRows - 1) * komodoRowGap;
      const mobileExpandedBaseLimit = isMobileViewport
        ? Math.max(
            komodoMinRowHeight,
            Math.floor(availableHeight - summaryHeight - summaryGap - footerReservedHeight)
          )
        : 0;
      const mobileExpandedLimit = isMobileViewport
        ? Math.max(
            komodoMinRowHeight,
            Math.round(komodoExpandedLockHeight > 0 ? komodoExpandedLockHeight : mobileExpandedBaseLimit)
          )
        : 0;
      const cappedExpandedHeight =
        mobileExpandedLimit > 0 ? Math.min(expandedListHeight, mobileExpandedLimit) : expandedListHeight;
      komodoListMaxHeight = cappedExpandedHeight;
      komodoExpandedOverflow = cappedExpandedHeight < expandedListHeight;
      if (isMobileViewport && komodoExpandedOverflow && komodoExpandedLockHeight <= 0) {
        komodoExpandedLockHeight = cappedExpandedHeight;
      } else if (!isMobileViewport) {
        komodoExpandedLockHeight = 0;
      }
      komodoListMinHeight = reserveCollapsedRows ? komodoListMaxHeight : 0;
      return;
    }

    const availableListHeight = Math.max(
      komodoMinRowHeight,
      availableHeight - summaryHeight - summaryGap - footerReservedHeight
    );

    const rowsByBase = Math.max(
      1,
      Math.floor((availableListHeight + komodoRowGap) / (baseRowHeight + komodoRowGap))
    );
    const maxRowsByMinHeight = Math.max(
      1,
      Math.floor((availableListHeight + komodoRowGap) / (komodoMinRowHeight + komodoRowGap))
    );

    let targetRows = 1;
    if (reserveCollapsedRows) {
      targetRows = Math.min(configuredRows, maxRowsByMinHeight);
    } else if (collapsible) {
      // Collapsed Komodo: fixed row count unless "auto" mode is enabled.
      targetRows = allowCollapsedAutoGrowth
        ? Math.min(totalRows, Math.max(configuredRows, rowsByBase))
        : Math.min(totalRows, configuredRows, maxRowsByMinHeight);
    } else {
      // Non-collapsible mode: use available height and keep scrolling for overflow.
      targetRows = Math.min(Math.max(1, rowsByBase), maxRowsByMinHeight);
    }

    const rawRowHeight = Math.floor(
      (availableListHeight - Math.max(0, targetRows - 1) * komodoRowGap) / targetRows
    );
    komodoRowHeight = Math.min(320, Math.max(komodoMinRowHeight, rawRowHeight));
    komodoVisibleRows = Math.max(1, targetRows);
    const capacity = layoutMode === 'grid' ? columns * komodoVisibleRows : komodoVisibleRows;
    komodoCollapsedLimit = Math.max(1, capacity);
    komodoListMaxHeight =
      komodoVisibleRows * komodoRowHeight + Math.max(0, komodoVisibleRows - 1) * komodoRowGap;
    komodoListMinHeight = reserveCollapsedRows ? komodoListMaxHeight : 0;
    komodoExpandedOverflow = false;
    komodoExpandedLockHeight = 0;
  };

	  const recomputeEffectiveLimit = async () => {
	    if (isKomodo || !collapsible || limit <= 0 || expanded) return;

	    await tick();

	    if (!listEl) {
	      effectiveLimit = Math.min(collapsedCap, Math.max(1, limit));
      return;
    }

    const firstRow = listEl.firstElementChild as HTMLElement | null;
    const listStyles = window.getComputedStyle(listEl);
    const rowGap =
      Number.parseFloat(listStyles.rowGap || listStyles.gap || '10') || 10;
    const rowHeight = firstRow?.offsetHeight ?? (isKomodo ? 44 : 42);
    const isGridLayout = layoutMode === 'grid';
    const columnCount = isGridLayout ? getRenderedColumnCount(listEl, listStyles) : 1;
    const rowCapacity = (rows: number) => (isGridLayout ? rows * columnCount : rows);

    const summaryHeight = summaryEl?.offsetHeight ?? 0;
    const summaryGap = summaryEl ? 8 : 0;
    const buttonHeight = showMoreButtonEl?.offsetHeight ?? 30;
    const buttonGap = 4;
    const availableHeight = getAvailableHeight();

    let nextLimit = Math.min(
      collapsedCap,
      rowCapacity(rowsThatFit(availableHeight - summaryHeight - summaryGap, rowHeight, rowGap))
    );

    if (items.length > nextLimit) {
      const withButton = availableHeight - summaryHeight - summaryGap - buttonHeight - buttonGap;
      nextLimit = Math.min(collapsedCap, rowCapacity(rowsThatFit(withButton, rowHeight, rowGap)));
    }

	    effectiveLimit = Math.max(1, nextLimit);
	  };

	  const scheduleLimitRecompute = (force = false) => {
      if (!force && isKomodo && komodoTransitioning) return;
	    if (typeof window === 'undefined') return;
	    if (frameId) window.cancelAnimationFrame(frameId);
	    frameId = window.requestAnimationFrame(() => {
	      frameId = 0;
	      void (isKomodo ? recomputeKomodoLayout() : recomputeEffectiveLimit());
	    });
	  };

	  onMount(() => {
	    scheduleLimitRecompute();
	    if (!rootEl) return;

	    const cardEl = rootEl.closest('.card') as HTMLElement | null;
	    resizeObserver = new ResizeObserver(() => scheduleLimitRecompute());
	    resizeObserver.observe(rootEl);
	    if (cardEl) resizeObserver.observe(cardEl);
	  });

  onDestroy(() => {
    if (frameId && typeof window !== 'undefined') {
      window.cancelAnimationFrame(frameId);
    }
    if (komodoTransitionTimer) {
      clearTimeout(komodoTransitionTimer);
      komodoTransitionTimer = null;
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  const dispatchKomodoLayoutEvent = (
    name: 'komodo-layout-start' | 'komodo-layout-end',
    expandedState = expanded
  ) => {
    if (!isKomodo || !rootEl) return;
    rootEl.dispatchEvent(
      new CustomEvent(name, {
        bubbles: true,
        composed: true,
        detail: { expanded: expandedState }
      })
    );
  };

  const settleKomodoTransition = () => {
    komodoTransitioning = false;
    komodoTransitionRowHeight = 0;
    if (komodoTransitionTimer) {
      clearTimeout(komodoTransitionTimer);
      komodoTransitionTimer = null;
    }
    if (!expanded) {
      komodoCollapsing = false;
      komodoRenderExpanded = false;
      komodoExpandedLockHeight = 0;
    } else {
      komodoCollapseTargetRowHeight = 0;
      komodoCollapseTargetMaxHeight = 0;
      komodoCollapsedCapacityLock = 0;
      komodoCollapsedLockCardHeight = 0;
      komodoCollapsing = false;
      komodoRenderExpanded = true;
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
        const visibleHeight = Math.round(listEl?.clientHeight ?? 0);
        if (visibleHeight > 0) {
          komodoExpandedLockHeight = Math.max(komodoMinRowHeight, visibleHeight);
        }
      } else {
        komodoExpandedLockHeight = 0;
      }
    }
    // Avoid a forced recompute on collapse settle; it can slightly change solved height
    // and produce a visible final snap.
    if (expanded) {
      scheduleLimitRecompute(true);
    }
    dispatchKomodoLayoutEvent('komodo-layout-end', expanded);
  };

  const beginKomodoTransition = (nextExpanded: boolean) => {
    if (!isKomodo) return;
    komodoTransitionStartedAt =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nextExpanded) {
      komodoCollapseTargetRowHeight = 0;
      komodoCollapseTargetMaxHeight = 0;
      komodoCollapsedCapacityLock = 0;
      komodoCollapsedLockCardHeight = 0;
    }
    if (listEl && typeof window !== 'undefined') {
      const listStyles = window.getComputedStyle(listEl);
      const currentRowHeight =
        Number.parseFloat(listStyles.getPropertyValue('--komodo-row-height') || '') ||
        Number.parseFloat(listStyles.gridAutoRows || '') ||
        komodoRowHeight;
      komodoTransitionRowHeight = Math.min(320, Math.max(komodoMinRowHeight, Math.round(currentRowHeight)));
    } else {
      komodoTransitionRowHeight = Math.min(
        320,
        Math.max(komodoMinRowHeight, Math.round(komodoRowHeight || komodoContainerHeight))
      );
    }
    komodoTransitioning = true;
    dispatchKomodoLayoutEvent('komodo-layout-start', nextExpanded);
    if (komodoTransitionTimer) {
      clearTimeout(komodoTransitionTimer);
      komodoTransitionTimer = null;
    }
    komodoTransitionTimer = setTimeout(() => {
      if (!komodoTransitioning) return;
      // Let real transitionend settle first; this is fallback only.
      const elapsed =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - komodoTransitionStartedAt;
      if (elapsed < 850) return;
      settleKomodoTransition();
    }, 900);
  };

  const endKomodoTransition = (event?: TransitionEvent) => {
    if (!isKomodo) return;
    if (event && listEl && event.target !== listEl) return;
    if (event && event.propertyName && event.propertyName !== 'max-height') return;
    settleKomodoTransition();
  };

  const toggleExpanded = async () => {
    if (isKomodo) {
      if (komodoTransitioning) return;
      const nextExpanded = !expanded;
      beginKomodoTransition(nextExpanded);
      if (nextExpanded) {
        komodoExpandedLockHeight = 0;
        komodoCollapsing = false;
        komodoRenderExpanded = true;
        expanded = true;
        scheduleLimitRecompute(true);
      } else {
        komodoExpandedLockHeight = 0;
        komodoCollapsing = true;
        komodoRenderExpanded = true;
        expanded = false;
        scheduleLimitRecompute(true);
      }
    } else {
      const nextExpanded = !expanded;
      expanded = nextExpanded;
      scheduleLimitRecompute();
      if (!nextExpanded) {
        await tick();
        if (typeof window === 'undefined' || !rootEl) return;
        const rect = rootEl.getBoundingClientRect();
        const topY = window.scrollY + rect.top;
        if (window.scrollY > topY + 8) {
          window.scrollTo({ top: Math.max(0, topY - 8), behavior: 'smooth' });
        }
      }
      return;
    }

    if (!expanded) {
      await tick();
      if (typeof window === 'undefined' || !rootEl) return;
      const rect = rootEl.getBoundingClientRect();
      const topY = window.scrollY + rect.top;
      if (window.scrollY > topY + 8) {
        window.scrollTo({ top: Math.max(0, topY - 8), behavior: 'smooth' });
      }
    }
  };
</script>

{#if widget.data?.error}
  <p class="error-text">{widget.data.error}</p>
{:else}
		<div class={`service-widget ${isKomodo ? 'komodo-widget' : ''} ${isKomodo && komodoTransitioning ? 'komodo-transitioning' : ''} ${isKomodo && komodoCollapsing ? 'komodo-collapsing' : ''}`} bind:this={rootEl}>
    {#if isKomodo}
      <div class="komodo-safety-fill" aria-hidden="true"></div>
    {/if}
	  {#if effectiveSummary}
	    {#if isKomodo}
      {@const total = effectiveSummary.total}
      {@const running = effectiveSummary.running}
      {@const stopped = Number(effectiveSummary.stopped ?? 0)}
      {@const down = Number(effectiveSummary.down ?? 0)}
      {@const unhealthy = Number(effectiveSummary.unhealthy ?? 0)}
      {@const unknown = Number(effectiveSummary.unknown ?? 0)}
      {@const issueCount = stopped + down}
      {@const criticalCount = unhealthy + unknown}
      <div class="summary-bar komodo-summary" bind:this={summaryEl}>
        <div class="komodo-summary-brand" title="Docker Manager">
          <img src={komodoIcon} alt="Docker Manager" loading="eager" decoding="async" />
        </div>
        <div class="komodo-summary-metric metric-running" title={`${running}/${total} running`}>
          <span class="metric-icon" aria-hidden="true">
            <svg viewBox="0 0 256 256" focusable="false">
              <path d={komodoStatusIconPath}></path>
            </svg>
          </span>
          <strong>{running}</strong>
        </div>
        <div
          class="komodo-summary-metric metric-issues"
          title={`${stopped}/${total} stopped\n${down}/${total} down`}
        >
          <span class="metric-icon" aria-hidden="true">
            <svg viewBox="0 0 256 256" focusable="false">
              <path d={komodoStatusIconPath}></path>
            </svg>
          </span>
          <strong>{issueCount}</strong>
        </div>
        <div
          class="komodo-summary-metric metric-unknown"
          title={`${unhealthy}/${total} unhealthy\n${unknown}/${total} unknown`}
        >
          <span class="metric-icon" aria-hidden="true">
            <svg viewBox="0 0 256 256" focusable="false">
              <path d={komodoStatusIconPath}></path>
            </svg>
          </span>
          <strong>{criticalCount}</strong>
        </div>
      </div>
    {:else}
      <div class="summary-bar" bind:this={summaryEl}>
        <div><strong>{effectiveSummary.running}</strong> running</div>
        <div><strong>{effectiveSummary.issues}</strong> issues</div>
        <div><strong>{effectiveSummary.total}</strong> total</div>
      </div>
    {/if}
  {/if}

		  <div
		    class={`service-list ${layoutMode === 'grid' ? 'grid' : ''} ${layoutMode === 'grid' && isKomodo ? 'komodo-grid' : ''} ${komodoScrollable ? 'komodo-scroll' : ''} ${isKomodo && komodoTransitioning ? 'komodo-height-animated' : ''}`}
		    style={
		      isKomodo
			        ? `--komodo-cols: ${komodoColumns}; --komodo-row-height: ${komodoRowHeight}px; --komodo-row-gap: ${komodoRowGap}px; --komodo-list-max-height: ${komodoListMaxHeight}px; --komodo-list-min-height: ${komodoListMinHeight}px; --komodo-name-size: ${komodoNameSize}px; --komodo-name-weight: ${komodoNameWeight}; --komodo-name-color: ${komodoNameColor}; --komodo-server-size: ${komodoServerSize}px; --komodo-server-weight: ${komodoServerWeight}; --komodo-server-color: ${komodoServerColor}; --komodo-item-bg: ${komodoItemBackground}; --komodo-item-border-color: ${komodoItemBorderColor}; --komodo-item-border-width: ${komodoItemBorder ? '1px' : '0px'}; --komodo-item-border-style: ${komodoItemBorderStyle === 'dashed' ? 'dashed' : 'solid'}; --komodo-item-glow: ${komodoItemBorder && komodoItemBorderStyle === 'glow' ? `0 0 10px color-mix(in srgb, ${komodoItemBorderColor} 55%, transparent)` : 'none'}; ${komodoNameFont ? `--komodo-name-font: ${komodoNameFont};` : ''} ${komodoServerFont ? `--komodo-server-font: ${komodoServerFont};` : ''}`
		        : undefined
			    }
		    bind:this={listEl}
        on:transitionend={endKomodoTransition}
		  >
    {#each renderedItems as item, index (`${item.name}-${item.href ?? ''}-${index}`)}
      <div
        class={`service-row ${isKomodo ? 'komodo-row' : ''}`}
        style={
          isKomodo
            ? `background:color-mix(in srgb, ${komodoItemBackground} 55%, transparent);border-width:${komodoItemBorder ? '1px' : '0'};border-style:${komodoItemBorderStyle === 'dashed' ? 'dashed' : 'solid'};border-color:color-mix(in srgb, ${komodoItemBorderColor} 14%, transparent);box-shadow:${komodoItemBorder && komodoItemBorderStyle === 'glow' ? `0 0 10px color-mix(in srgb, ${komodoItemBorderColor} 50%, transparent)` : 'none'};`
            : undefined
        }
      >
        <div class="service-main">
          {#if isKomodo}
            <div class="service-icon">
              {#if canShowIcon(item.icon)}
                <img
                  src={item.icon}
                  alt={item.name}
                  loading={index < Math.max(komodoColumns * komodoVisibleRows, 8) ? 'eager' : 'lazy'}
                  decoding="async"
                  on:error={() => handleIconError(item.icon)}
                />
              {:else}
                {getInitial(item.name)}
              {/if}
            </div>
          {/if}
          <div class="service-text">
            <div class="service-name">
              {#if item.href}
                <a href={item.href} target="_blank" rel="noreferrer">{item.name}</a>
              {:else}
                {item.name}
              {/if}
            </div>
            {#if isKomodo && item.detail && ((widget.options?.showStatusText as boolean) ?? true)}
              <div class="service-detail">{item.detail}</div>
            {/if}
          </div>
        </div>
        {#if isKomodo}
          {#if ((widget.options?.showStatusDot as boolean) ?? true)}
            <div class={`service-health status-${item.status}`} title={item.status}></div>
          {/if}
        {:else}
          <div class={`service-status status-${item.status}`}>
            {item.status}
            {#if item.detail}
              <span>{item.detail}</span>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
		  </div>
		  {#if showMoreVisible || reserveKomodoShowMoreSlot}
        <div
          class={`widget-footer ${isKomodo ? 'komodo-footer' : ''} ${isKomodo && expanded ? 'komodo-footer-expanded' : ''}`}
          bind:this={widgetFooterEl}
        >
		      <div
            class={`show-more-wrap ${isKomodo ? 'komodo' : ''} ${isKomodo && !expanded ? 'collapsed' : ''} ${!showMoreVisible ? 'placeholder' : ''}`}
            bind:this={showMoreWrapEl}
          >
		        <button
              class="show-more"
              bind:this={showMoreButtonEl}
              on:click|stopPropagation={toggleExpanded}
              disabled={!showMoreVisible || (isKomodo && komodoTransitioning)}
              aria-hidden={!showMoreVisible}
              tabindex={showMoreVisible ? 0 : -1}
            >
              <svg
                class={`show-more-chevron ${expanded ? 'expanded' : ''}`}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
		          {expanded ? 'Show Less' : showMoreVisible ? `Show More (${hiddenCount})` : 'Show More'}
		        </button>
		      </div>
        </div>
		  {/if}
		  </div>
	{/if}

<style>
	  .service-widget {
	    display: flex;
	    flex-direction: column;
	    flex: 1 1 auto;
	    height: auto;
	    min-height: 0;
	  }

  .service-widget.komodo-widget {
    height: auto;
    position: relative;
    overflow: hidden;
    border-radius: 12px;
    gap: 0;
    padding-bottom: 0;
  }

  .service-widget.komodo-widget > * {
    position: relative;
    z-index: 1;
  }

  .komodo-safety-fill {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background: linear-gradient(
        145deg,
        rgba(var(--widget-bg-rgb, 20, 27, 35), 0.94),
        rgba(var(--widget-bg-rgb, 20, 27, 35), 0.88)
      ),
      linear-gradient(
        145deg,
        rgba(70, 122, 190, var(--widget-blue-tint, 0)),
        rgba(32, 78, 140, var(--widget-blue-tint, 0))
      );
  }

  .service-widget.komodo-widget.komodo-transitioning .komodo-row {
    background: color-mix(in srgb, var(--komodo-item-bg, #0a1018) 94%, transparent) !important;
  }

  .summary-bar {
    display: flex;
    gap: 16px;
    font-size: 0.85rem;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .summary-bar strong {
    color: var(--text);
  }

  .komodo-summary {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .komodo-summary-brand {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .komodo-summary-brand img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    opacity: 0.95;
  }

  .komodo-summary-metric {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.92rem;
    line-height: 1;
    color: #9fb5ca;
  }

  .komodo-summary-metric strong {
    color: #eef4ff;
    font-family: var(--font-heading);
    font-weight: 700;
  }

  .komodo-summary-metric .metric-icon {
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .komodo-summary-metric .metric-icon svg {
    width: 100%;
    height: 100%;
    fill: currentColor;
  }

  .komodo-summary-metric.metric-running {
    color: #15d6bd;
  }

  .komodo-summary-metric.metric-issues {
    color: #4f8fdd;
  }

  .komodo-summary-metric.metric-unknown {
    color: #ff6d7a;
  }

  .service-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    overflow: hidden;
  }

	  .service-list.grid {
	    display: grid;
	    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	  }

  .service-list.grid.komodo-grid {
    grid-template-columns: repeat(var(--komodo-cols, 3), minmax(0, 1fr));
    grid-auto-rows: var(--komodo-row-height, 110px);
    flex-shrink: 0;
    height: auto;
    max-height: var(--komodo-list-max-height, none);
    min-height: var(--komodo-list-min-height, 0px);
    overflow: hidden;
    will-change: max-height;
    transform: translateZ(0);
    backface-visibility: hidden;
  }

  .service-list.grid.komodo-grid.komodo-height-animated {
    transition-property: max-height;
    transition-duration: 460ms;
    transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  }

  .service-widget.komodo-widget.komodo-collapsing .service-list.grid.komodo-grid.komodo-height-animated {
    transition-duration: 400ms;
    transition-timing-function: ease-in-out;
  }

  /* Override komodo-grid overflow:hidden (higher specificity) when scrolling is enabled. */
  .service-list.grid.komodo-grid.komodo-scroll {
    overflow-y: auto;
  }

  .service-list.komodo-scroll {
    overflow-y: auto;
    padding-right: 4px;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .service-list.komodo-scroll::-webkit-scrollbar {
    width: 8px;
  }

  .service-list.komodo-scroll::-webkit-scrollbar-thumb {
    background: rgba(106, 168, 255, 0.45);
    border-radius: 999px;
  }

  .service-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--card-soft);
    border: 1px solid rgba(255, 255, 255, 0.06);
    min-width: 0;
    overflow: hidden;
  }

  .service-main {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
  }

  .service-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .service-name {
    font-weight: 600;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .service-name a {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    text-decoration: none;
  }

  .service-name a:hover {
    color: var(--text);
    text-decoration: underline;
  }

  .service-detail {
    font-size: 0.72rem;
    color: var(--muted);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .service-icon {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.03);
    color: var(--text);
    font-size: 0.75rem;
    font-weight: 700;
    overflow: hidden;
    flex: 0 0 auto;
  }

  .service-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .service-health {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    flex: 0 0 auto;
    margin-left: 10px;
  }

  .komodo-row {
    padding: 9px 11px;
    height: 100%;
    background: var(--komodo-item-bg, var(--card-soft));
    border-color: var(--komodo-item-border-color, rgba(255, 255, 255, 0.06));
    border-style: var(--komodo-item-border-style, solid);
    border-width: var(--komodo-item-border-width, 1px);
    box-shadow: var(--komodo-item-glow, none);
    backface-visibility: hidden;
  }

  .komodo-row .service-name,
  .komodo-row .service-name a {
    font-family: var(--komodo-name-font, var(--font-heading, var(--font-body)));
    font-size: var(--komodo-name-size, 16px);
    font-weight: var(--komodo-name-weight, 600);
    color: var(--komodo-name-color, var(--text));
  }

  .komodo-row .service-detail {
    font-family: var(--komodo-server-font, var(--font-heading, var(--font-body)));
    font-size: var(--komodo-server-size, 12px);
    font-weight: var(--komodo-server-weight, 600);
    color: var(--komodo-server-color, var(--muted));
  }

  .service-status {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .service-status span {
    font-size: 0.7rem;
  }

  .status-ok {
    color: var(--success);
  }

  .status-warn {
    color: #4f8fdd;
  }

  .status-down {
    color: var(--danger);
  }

  .service-health.status-ok {
    background: var(--success);
    box-shadow: 0 0 8px rgba(126, 231, 135, 0.45);
  }

  .service-health.status-warn {
    background: #4f8fdd;
    box-shadow: 0 0 8px rgba(79, 143, 221, 0.45);
  }

  .service-health.status-down {
    background: var(--danger);
    box-shadow: 0 0 8px rgba(255, 107, 107, 0.45);
  }

  .error-text {
    color: var(--danger);
    font-size: 0.9rem;
  }

	  .show-more {
	    margin: 0;
	    padding: 6px 10px;
	    border-radius: 999px;
	    border: 1px solid var(--card-border);
	    background: transparent;
	    color: var(--text);
	    font-size: 0.75rem;
	    text-transform: uppercase;
	    letter-spacing: 0.08em;
      display: inline-flex;
      align-items: center;
      gap: 6px;
	  }

  .show-more-chevron {
    width: 13px;
    height: 13px;
    transition: transform 220ms ease;
  }

  .show-more-chevron.expanded {
    transform: rotate(180deg);
  }

	  .show-more-wrap {
	    margin-top: 10px;
	    align-self: flex-start;
	  }

  .widget-footer {
    display: flex;
    min-height: 0;
  }

  .widget-footer.komodo-footer {
    flex: 0 0 auto;
    height: auto;
    margin-top: 0;
    padding-top: 13px;
    padding-bottom: 0px;
    align-items: center;
    justify-content: flex-start;
  }

  .widget-footer.komodo-footer.komodo-footer-expanded {
    padding-bottom: 8px;
  }

  .show-more-wrap.placeholder {
    visibility: hidden;
    pointer-events: none;
  }

	  /* Keep Komodo "Show More" centered in any leftover vertical space. */
	  .show-more-wrap.komodo {
	    margin: 0;
	    padding: 0;
	    align-self: stretch;
      display: flex;
      align-items: center;
      position: relative;
      z-index: 10;
      transition: none !important;
      animation: none !important;
      transform: none !important;
	  }

  .show-more-wrap.komodo.collapsed {
    padding: 0;
  }

  .show-more-wrap.komodo .show-more {
    transition: none !important;
    animation: none !important;
    transform: none !important;
  }

	  @media (max-width: 1100px) {
	    .service-list.grid.komodo-grid {
	      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	    }
	  }
	</style>
