<script lang="ts">
  import { onMount } from 'svelte';
  import WidgetRenderer from './WidgetRenderer.svelte';
  import type { WidgetInstance } from '$widgets/types';
  import { getSourceIconUrl } from '$lib/shared/dashboardIcons';

  export let widget: WidgetInstance;
  export let editMode = false;
  export let layoutMode: 'grid' | 'masonry' = 'masonry';
  export let gridGap = 16;
  export let onResize: (id: string, layout: { span: number; height?: number; columnStart?: number }) => void = () => {};
  export let onMove: (
    fromId: string,
    toId: string,
    position?: 'before' | 'after' | 'left' | 'right',
    targetColumnStartHint?: number
  ) => void = () => {};
  export let onOpenSettings: (id: string) => void = () => {};
  export let showHealthCircles = true;
  export let forcedRowStart = 0;
  export let onRowsChange: (id: string, rows: number) => void = () => {};
  export let layoutDebug = false;
  export let onDragPreview: (
    payload:
      | {
          fromId: string;
          toId: string;
          position: 'before' | 'after' | 'left' | 'right';
          targetColumnStartHint?: number;
          movedSpanGrid?: number;
        }
      | null
  ) => void = () => {};

  let dragging = false;
  let previewSpan = 4;
  let previewGridSpan = 8;
  let previewHeight = 0;
  let previewColumnStart = 0;
  let inferredColumnStart = 0;
  let effectiveColumnStart = 0;
  let span = 4;
  let mobileSpan = 4;
  let hideMobile = false;
  let height = 0;
  let appliedHeight = 0;
  let titleAbove = false;
  let titleAboveText = '';
  let titleAboveSpacer = false;
  let showHeader = true;
  let hideTitle = false;
  let legacyTitleAboveOnly = false;
  let link = '';
  let clickable = false;
  let showHealth = false;
  let healthLabel = 'Unknown';
  let dragOver = false;
  let dragPosition: 'before' | 'after' | 'left' | 'right' = 'before';
  let rowSpan = 1;
  let reportedRows = -1;
  let masonryOffset = 0;
  let spanFrame = 0;
  let resizeFrame = 0;
  let spanObserver: ResizeObserver | null = null;
  let contentObserver: MutationObserver | null = null;
  let shellEl: HTMLDivElement | null = null;
  let lockCardHeight = true;
  let titleIcon = '';
  let iconSource = '';
  let titleIconErrored = false;
  let hideTitleIcon = false;
  let holdPreviewUntilLayoutSync = false;
  let pendingSyncSpan = 0;
  let pendingSyncHeight = 0;
  let cardTypographyStyle = '';
  let layoutTransitionFrame = 0;
  let activeLayoutTransitions = 0;
  let komodoLayoutAnimating = false;
  let komodoExpanded = false;
  let lastDebugDragSignature = '';
  const CLEAR_DRAG_HOVER_EVENT = 'dashboard-clear-drag-hover';

  type DraggedWidgetPayload = {
    id: string;
    spanGrid?: number;
  };
  const DASHBOARD_DRAG_MIME = 'application/x-dashboard-widget';

  $: span = widget.layout?.span ?? 4;
  $: mobileSpan = widget.mobile?.span ?? 4;
  $: hideMobile = widget.mobile?.hide ?? false;
  $: height = widget.layout?.height ?? 0;
  $: appliedHeight =
    height > 0
      ? height
      : widget.kind === 'service'
        ? 280
        : widget.kind === 'prowlarr'
          ? 320
        : widget.kind === 'sabnzbd'
          ? 420
        : widget.kind === 'speedtest'
          ? 360
        : widget.kind === 'chart'
          ? 240
          : widget.kind === 'grafana'
            ? 320
          : widget.kind === 'stat'
            ? 145
        : widget.kind === 'monitor' || widget.kind === 'systemMonitor'
          ? 240
        : widget.kind === 'requests'
          ? 460
          : widget.kind === 'plex' || widget.kind === 'history'
            ? 360
            : widget.kind === 'calendar'
              ? 240
              : widget.kind === 'clock'
                ? 92
                : 0;
  $: hideTitle = widget.options?.hideTitle === true;
  $: titleAboveText =
    typeof widget.options?.titleAboveText === 'string'
      ? widget.options.titleAboveText.trim()
      : widget.options?.titleAbove === true
        ? widget.title
        : '';
  $: titleAboveSpacer = widget.options?.titleAboveSpacer === true;
  $: titleAbove = Boolean(titleAboveText) || titleAboveSpacer;
  $: legacyTitleAboveOnly =
    widget.options?.titleAbove === true &&
    !Object.prototype.hasOwnProperty.call(widget.options ?? {}, 'titleAboveText');
  $: showHeader =
    !hideTitle &&
    widget.kind !== 'stat' &&
    (widget.source === 'seerr-requests'
      ? true
      : !legacyTitleAboveOnly && widget.options?.showHeader !== false);
  $: link = typeof widget.link === 'string' ? widget.link : '';
  $: clickable = Boolean(link) && !editMode;
	  $: showHealth =
	    showHealthCircles &&
	    widget.source !== 'monitor' &&
	    widget.source !== 'service-hub' &&
      widget.source !== 'seerr-requests' &&
	    widget.options?.showHealth !== false &&
	    Boolean(widget.options?.healthContainer || widget.health);
	  $: healthLabel =
	    widget.health === 'healthy' ? 'Healthy' : widget.health === 'unhealthy' ? 'Unhealthy' : 'Unknown';
  $: {
    if (widget.kind === 'service' && widget.source === 'komodo') {
      // Keep closed Komodo at fixed height (prevents post-resize snap-back around Show More).
      // Switch to auto-height only while expanded or actively animating expand/collapse.
      lockCardHeight = dragging || (!komodoExpanded && !komodoLayoutAnimating);
    } else if (widget.kind === 'systemMonitor' && widget.options?.monitorAutoHeight !== false) {
      // System monitor should expand/shrink with selected vitals so masonry can reflow neighbors.
      lockCardHeight = dragging;
    } else {
      lockCardHeight = true;
    }
  }
	  $: hideTitleIcon = widget.options?.hideTitleIcon === true;
	  $: iconSource = widget.source || (widget.kind === 'speedtest' ? 'speedtest-tracker' : '');
	  $: titleIcon =
	    typeof widget.options?.titleIconUrl === 'string' && widget.options.titleIconUrl.trim()
	      ? widget.options.titleIconUrl.trim()
	      : getSourceIconUrl(iconSource) ?? '';
	  $: if (!titleIcon) titleIconErrored = false;
  $: {
    const parts: string[] = [];
    const titleFont =
      typeof widget.options?.cardTitleFont === 'string' ? widget.options.cardTitleFont.trim() : '';
    if (titleFont) parts.push(`--card-title-font-family:${titleFont}`);
    const titleWeight = Number(widget.options?.cardTitleWeight ?? 0);
    if (Number.isFinite(titleWeight) && titleWeight > 0) {
      parts.push(`--card-title-font-weight:${Math.min(900, Math.max(300, titleWeight))}`);
    }
    const titleSize = Number(widget.options?.cardTitleSize ?? 0);
    if (Number.isFinite(titleSize) && titleSize > 0) {
      parts.push(`--card-title-size:${Math.min(48, Math.max(8, titleSize))}px`);
    }
    const titleColor =
      typeof widget.options?.cardTitleColor === 'string' &&
      /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.cardTitleColor)
        ? widget.options.cardTitleColor
        : '';
    if (titleColor) parts.push(`--card-title-color:${titleColor}`);

    const headerFont =
      typeof widget.options?.cardHeaderFont === 'string' ? widget.options.cardHeaderFont.trim() : '';
    if (headerFont) parts.push(`--card-header-font-family:${headerFont}`);
    const headerWeight = Number(widget.options?.cardHeaderWeight ?? 0);
    if (Number.isFinite(headerWeight) && headerWeight > 0) {
      parts.push(`--card-header-font-weight:${Math.min(900, Math.max(300, headerWeight))}`);
    }
    const headerSize = Number(widget.options?.cardHeaderSize ?? 0);
    if (Number.isFinite(headerSize) && headerSize > 0) {
      parts.push(`--card-title-above-size:${Math.min(36, Math.max(8, headerSize))}px`);
    }
    const headerColor =
      typeof widget.options?.cardHeaderColor === 'string' &&
      /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(widget.options.cardHeaderColor)
        ? widget.options.cardHeaderColor
        : '';
    if (headerColor) parts.push(`--card-header-color:${headerColor}`);
    cardTypographyStyle = parts.join(';');
  }
  $: if (!dragging && !holdPreviewUntilLayoutSync) {
    previewSpan = span;
    previewHeight = appliedHeight;
    previewColumnStart = Math.max(0, Number(widget.layout?.columnStart ?? 0));
  }
  // Only apply explicit/persisted column start; inferred values are for measurement only.
  $: effectiveColumnStart = previewColumnStart > 0 ? previewColumnStart : 0;
  $: if (
    holdPreviewUntilLayoutSync &&
    Math.abs((span ?? 0) - (pendingSyncSpan ?? 0)) < 0.001 &&
    (appliedHeight ?? 0) === (pendingSyncHeight ?? 0)
  ) {
    holdPreviewUntilLayoutSync = false;
  }
  $: previewGridSpan = Math.round(previewSpan * 2);
  $: {
    if (reportedRows !== rowSpan) {
      reportedRows = rowSpan;
      onRowsChange(widget.id, rowSpan);
    }
  }
  $: if (layoutMode === 'masonry') {
    gridGap;
    previewGridSpan;
    previewHeight;
    scheduleRowSpanUpdate();
  }

  const getMinResizeHeight = () => {
    if (widget.source === 'technitium') {
      return 180;
    }
    if (
      (widget.kind === 'plex' || widget.kind === 'history') &&
      widget.options?.subtype === 'now-playing'
    ) {
      return 280;
    }
    return 0;
  };

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('button, a, input, select, textarea, label'));
  };

  const clampInt = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.round(value)));

  const toGridUnits = (layoutSpan: number) =>
    Math.max(1, Math.min(24, Math.round(Number(layoutSpan || 4) * 2)));

  const getGridColumns = (grid: HTMLElement) => {
    const gridStyles = window.getComputedStyle(grid);
    return Math.max(
      1,
      Math.round(Number.parseFloat(gridStyles.getPropertyValue('--grid-columns') || '25') || 25)
    );
  };

  const getTargetColumnStart = (grid: HTMLElement, targetShell: HTMLElement) => {
    const explicitColumnStart = Number(widget.layout?.columnStart ?? 0);
    if (Number.isFinite(explicitColumnStart) && explicitColumnStart > 0) {
      return Math.round(explicitColumnStart);
    }
    const gridColumns = getGridColumns(grid);
    const shellRect = targetShell.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const relativeLeft =
      gridRect.width > 0
        ? Math.min(1, Math.max(0, (shellRect.left - gridRect.left) / gridRect.width))
        : 0;
    return Math.min(gridColumns, Math.max(1, Math.floor(relativeLeft * gridColumns) + 1));
  };

  const readDraggedPayload = (dataTransfer: DataTransfer | null): DraggedWidgetPayload | null => {
    if (!dataTransfer) return null;
    const fallbackId = dataTransfer.getData('text/plain')?.trim();
    const encoded = dataTransfer.getData(DASHBOARD_DRAG_MIME)?.trim();
    if (encoded) {
      try {
        const parsed = JSON.parse(encoded) as DraggedWidgetPayload;
        if (parsed?.id) return parsed;
      } catch {
        // Ignore malformed drag payloads.
      }
    }
    return fallbackId ? { id: fallbackId } : null;
  };

  const computeDropColumnStartHint = (
    event: DragEvent,
    position: 'before' | 'after' | 'left' | 'right',
    movedSpanGrid: number,
    targetShell: HTMLElement,
    grid: HTMLElement
  ) => {
    const gridColumns = getGridColumns(grid);
    const targetStart = getTargetColumnStart(grid, targetShell);
    const targetSpan = toGridUnits(Number(widget.layout?.span ?? 4));
    const targetEnd = Math.min(gridColumns, targetStart + targetSpan - 1);
    const maxStart = Math.max(1, gridColumns - movedSpanGrid + 1);

    if (position === 'left') {
      return clampInt(targetStart - movedSpanGrid, 1, maxStart);
    }
    if (position === 'right') {
      return clampInt(targetEnd + 1, 1, maxStart);
    }

    const shellRect = targetShell.getBoundingClientRect();
    const xRatio =
      shellRect.width > 0 ? Math.min(1, Math.max(0, (event.clientX - shellRect.left) / shellRect.width)) : 0.5;
    if (movedSpanGrid <= targetSpan) {
      const minStart = targetStart;
      const maxAlignedStart = Math.max(minStart, targetEnd - movedSpanGrid + 1);
      const spanWindow = maxAlignedStart - minStart;
      return clampInt(minStart + xRatio * spanWindow, 1, maxStart);
    }

    const gridRect = grid.getBoundingClientRect();
    const pointerColumn =
      gridRect.width > 0
        ? Math.min(
            gridColumns,
            Math.max(1, Math.floor(((event.clientX - gridRect.left) / gridRect.width) * gridColumns) + 1)
          )
        : targetStart;
    const centeredStart = pointerColumn - Math.floor(movedSpanGrid / 2);
    return clampInt(centeredStart, 1, maxStart);
  };

  const handleNavigate = (event: MouseEvent) => {
    if (!clickable || !link) return;
    if (isInteractiveTarget(event.target)) return;
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (!clickable || !link) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      window.open(link, '_blank', 'noopener,noreferrer');
    }
  };

  const startResize = (event: PointerEvent) => {
    if (!editMode) return;
    holdPreviewUntilLayoutSync = false;
    const handle = event.currentTarget as HTMLElement | null;
    const startX = event.clientX;
    const startY = event.clientY;
    const startSpan = span;
    const startCard = shellEl?.querySelector('.card') as HTMLElement | null;
    const startCardRect = startCard?.getBoundingClientRect();
    const measuredStartHeight = Math.max(
      1,
      Math.round(startCard?.offsetHeight ?? (height > 0 ? height : appliedHeight))
    );
    // Prevent Komodo (dynamic-height) from jumping when entering resize mode by
    // locking from its current rendered height, not a stale persisted layout height.
    previewHeight = measuredStartHeight;
    dragging = true;
    handle?.setPointerCapture?.(event.pointerId);
    const startHeight = measuredStartHeight;
    const rawRenderScaleY =
      startCardRect && startHeight > 0
        ? startCardRect.height / startHeight
        : shellEl && shellEl.offsetHeight > 0
          ? shellEl.getBoundingClientRect().height / shellEl.offsetHeight
          : 1;
    const renderScaleY =
      Number.isFinite(rawRenderScaleY) && rawRenderScaleY > 0 ? rawRenderScaleY : 1;
    const minResizeHeight = getMinResizeHeight();
    const grid = document.querySelector('.grid') as HTMLElement | null;
    const gridWidth = grid?.clientWidth ?? 960;
    const columnWidth = gridWidth / 12;
    const snapThresholdPx = 24;
    const sameTrackThresholdPx = 64;
    const neighborBandPx = 44;
    const gridStyles = grid ? window.getComputedStyle(grid) : null;
    const autoRow = getNumericValue(gridStyles?.getPropertyValue('grid-auto-rows') ?? '1', 1);
    const rowGap = getNumericValue(
      gridStyles?.getPropertyValue('row-gap') || gridStyles?.getPropertyValue('gap') || '0',
      0
    );
    const shellStyles = shellEl ? window.getComputedStyle(shellEl) : null;
    const selfRowStartRaw = getNumericValue(shellStyles?.getPropertyValue('--row-start') ?? '1', 1);
    const selfRowStart = Math.max(1, Math.round(selfRowStartRaw));
    const rowSnapThreshold = 2;

    const estimateRowsFromHeight = (heightPx: number) =>
      Math.max(1, Math.ceil((heightPx + rowGap) / Math.max(1, autoRow + rowGap)));

    const estimateHeightFromRows = (rows: number) => {
      const roundedRows = Math.max(1, Math.round(rows));
      return Math.max(minResizeHeight, roundedRows * (autoRow + rowGap) - rowGap);
    };

    const maybeSnapHeightToNeighbor = (candidateHeight: number) => {
      if (!shellEl || typeof window === 'undefined') return candidateHeight;
      const shellRect = shellEl.getBoundingClientRect();
      const cardEl = shellEl.querySelector('.card') as HTMLElement | null;
      const cardRect = cardEl?.getBoundingClientRect();
      const cardTop = cardRect?.top ?? shellRect.top;
      const projectedBottom = cardTop + candidateHeight * renderScaleY;
      const siblings = Array.from(document.querySelectorAll('.widget-shell')).filter(
        (element): element is HTMLElement => element instanceof HTMLElement && element !== shellEl
      );

      const candidateRows = estimateRowsFromHeight(candidateHeight);
      const candidateRowEnd = selfRowStart + candidateRows - 1;
      let bestRowDelta: number | null = null;
      let bestRowScore = Number.POSITIVE_INFINITY;
      let bestDelta: number | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const sibling of siblings) {
        const siblingRect = sibling.getBoundingClientRect();
        const gapToLeftNeighbor = shellRect.left - siblingRect.right;
        const gapToRightNeighbor = siblingRect.left - shellRect.right;
        const horizontalDistance =
          gapToLeftNeighbor >= 0
            ? gapToLeftNeighbor
            : gapToRightNeighbor >= 0
              ? gapToRightNeighbor
              : Number.POSITIVE_INFINITY;
        if (horizontalDistance > neighborBandPx) continue;

        const siblingCard = sibling.querySelector('.card') as HTMLElement | null;
        const siblingCardRect = siblingCard?.getBoundingClientRect();
        const siblingCardTop = siblingCardRect?.top ?? siblingRect.top;
        const topDelta = Math.abs(siblingCardTop - cardTop);
        if (topDelta > sameTrackThresholdPx) continue;

        const siblingStyles = window.getComputedStyle(sibling);
        const siblingRowStartRaw = getNumericValue(siblingStyles.getPropertyValue('--row-start'), NaN);
        const siblingRowsRaw = getNumericValue(siblingStyles.getPropertyValue('--rows'), NaN);
        if (Number.isFinite(siblingRowStartRaw) && Number.isFinite(siblingRowsRaw)) {
          const siblingRowStart = Math.max(1, Math.round(siblingRowStartRaw));
          const siblingRows = Math.max(1, Math.round(siblingRowsRaw));
          const siblingRowEnd = siblingRowStart + siblingRows - 1;
          const rowDelta = siblingRowEnd - candidateRowEnd;
          if (Math.abs(rowDelta) <= rowSnapThreshold) {
            const rowScore = Math.abs(rowDelta) + horizontalDistance * 0.02 + topDelta * 0.01;
            if (bestRowDelta === null || rowScore < bestRowScore) {
              bestRowDelta = rowDelta;
              bestRowScore = rowScore;
            }
          }
        }

        const siblingCardBottom = siblingCardRect?.bottom ?? siblingRect.bottom;
        const delta = siblingCardBottom - projectedBottom;
        if (Math.abs(delta) > snapThresholdPx) continue;
        const score = Math.abs(delta) + horizontalDistance * 0.2 + topDelta * 0.12;
        if (bestDelta === null || score < bestScore) {
          bestDelta = delta;
          bestScore = score;
        }
      }

      if (bestRowDelta !== null) {
        return estimateHeightFromRows(candidateRows + bestRowDelta);
      }
      if (bestDelta === null) return candidateHeight;
      return Math.max(minResizeHeight, Math.round(candidateHeight + bestDelta / renderScaleY));
    };

    const handleMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const nextSpan = Math.min(12, Math.max(1, startSpan + deltaX / columnWidth));
      const snappedSpan = Math.round(nextSpan * 2) / 2;
      const rawHeight = Math.max(minResizeHeight, Math.round(startHeight + deltaY / renderScaleY));
      const snappedHeight = maybeSnapHeightToNeighbor(rawHeight);

      if (resizeFrame && typeof window !== 'undefined') {
        window.cancelAnimationFrame(resizeFrame);
      }
      if (typeof window !== 'undefined') {
        resizeFrame = window.requestAnimationFrame(() => {
          resizeFrame = 0;
          previewSpan = snappedSpan;
          previewHeight = snappedHeight;
        });
      } else {
        previewSpan = snappedSpan;
        previewHeight = snappedHeight;
      }
    };

    const computeSnappedResize = (clientX: number, clientY: number) => {
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;
      const nextSpan = Math.min(12, Math.max(1, startSpan + deltaX / columnWidth));
      const snappedSpan = Math.round(nextSpan * 2) / 2;
      const rawHeight = Math.max(minResizeHeight, Math.round(startHeight + deltaY / renderScaleY));
      const snappedHeight = maybeSnapHeightToNeighbor(rawHeight);
      return { snappedSpan, snappedHeight };
    };

    const handleUp = (upEvent: PointerEvent) => {
      if (resizeFrame && typeof window !== 'undefined') {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = 0;
      }
      const { snappedSpan, snappedHeight } = computeSnappedResize(upEvent.clientX, upEvent.clientY);
      previewSpan = snappedSpan;
      previewHeight = snappedHeight;
      pendingSyncSpan = snappedSpan;
      pendingSyncHeight = snappedHeight;
      holdPreviewUntilLayoutSync = true;
      dragging = false;
      onResize(widget.id, {
        span: snappedSpan,
        height: snappedHeight,
        columnStart: previewColumnStart > 0 ? previewColumnStart : undefined
      });
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      handle?.releasePointerCapture?.(upEvent.pointerId);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const handleDragStart = (event: DragEvent) => {
    if (!editMode) return;
    event.dataTransfer?.setData('text/plain', widget.id);
    event.dataTransfer?.setData(
      DASHBOARD_DRAG_MIME,
      JSON.stringify({
        id: widget.id,
        spanGrid: toGridUnits(Number(widget.layout?.span ?? 4))
      } satisfies DraggedWidgetPayload)
    );
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
    if (layoutDebug) {
      console.debug('[layout-debug][drag-start]', {
        id: widget.id,
        columnStart: effectiveColumnStart || inferredColumnStart || 1,
        spanGrid: toGridUnits(Number(widget.layout?.span ?? 4)),
        rowSpan
      });
    }
  };

  const handleDragOver = (event: DragEvent) => {
    if (!editMode) return;
    if (!event.dataTransfer?.types.includes('text/plain')) return;
    event.preventDefault();
    dragOver = true;
    const target = event.currentTarget as HTMLElement | null;
    const grid = target?.closest('.grid') as HTMLElement | null;
    if (target) {
      const rect = target.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const edgePx = Math.max(20, Math.min(40, Math.round(Math.min(rect.width, rect.height) * 0.18)));
      const inTop = y <= edgePx;
      const inBottom = y >= rect.height - edgePx;
      const inLeft = x <= edgePx;
      const inRight = x >= rect.width - edgePx;

      // Prefer vertical intent (especially bottom snap) over side intent.
      if (inBottom) {
        dragPosition = 'after';
      } else if (inTop) {
        dragPosition = 'before';
      } else if (inLeft && !inRight) {
        dragPosition = 'left';
      } else if (inRight) {
        dragPosition = 'right';
      } else {
        dragPosition = y < rect.height * 0.5 ? 'before' : 'after';
      }

      if (layoutDebug) {
        const signature = `${dragPosition}:${Math.round(x)}:${Math.round(y)}`;
        if (signature !== lastDebugDragSignature) {
          lastDebugDragSignature = signature;
          console.debug('[layout-debug][drag-over]', {
            targetId: widget.id,
            dragPosition,
            pointer: { x: Math.round(x), y: Math.round(y) },
            edgePx
          });
        }
      }

      const dragged = readDraggedPayload(event.dataTransfer);
      const fromId = dragged?.id ?? '';
      if (fromId && fromId !== widget.id) {
        const movedSpanGrid =
          Number.isFinite(Number(dragged?.spanGrid)) && Number(dragged?.spanGrid) > 0
            ? Math.max(1, Math.round(Number(dragged?.spanGrid)))
            : undefined;
        const targetColumnStartHint = grid && target
          ? computeDropColumnStartHint(
              event,
              dragPosition,
              movedSpanGrid ?? toGridUnits(Number(widget.layout?.span ?? 4)),
              target,
              grid
            )
          : undefined;
        onDragPreview({
          fromId,
          toId: widget.id,
          position: dragPosition,
          targetColumnStartHint,
          movedSpanGrid
        });
      }
    }
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragLeave = () => {
    dragOver = false;
    dragPosition = 'before';
    lastDebugDragSignature = '';
    onDragPreview(null);
  };

  const clearDragHoverState = () => {
    dragOver = false;
    dragPosition = 'before';
    lastDebugDragSignature = '';
    onDragPreview(null);
  };

  const dispatchClearDragHover = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(CLEAR_DRAG_HOVER_EVENT));
  };

  const handleDrop = (event: DragEvent) => {
    if (!editMode) return;
    if (!event.dataTransfer?.types.includes('text/plain')) return;
    event.preventDefault();
    const dragged = readDraggedPayload(event.dataTransfer);
    const fromId = dragged?.id ?? '';
    dragOver = false;
    const position = dragPosition;
    dragPosition = 'before';
    lastDebugDragSignature = '';
    onDragPreview(null);
    dispatchClearDragHover();
    let targetColumnStartHint: number | undefined;
    const targetShell = event.currentTarget as HTMLElement | null;
    const grid = targetShell?.closest('.grid') as HTMLElement | null;
    if (targetShell && grid) {
      const movedSpanGrid =
        Number.isFinite(Number(dragged?.spanGrid)) && Number(dragged?.spanGrid) > 0
          ? Math.max(1, Math.round(Number(dragged?.spanGrid)))
          : toGridUnits(Number(widget.layout?.span ?? 4));
      targetColumnStartHint = computeDropColumnStartHint(
        event,
        position,
        movedSpanGrid,
        targetShell,
        grid
      );
    }
    if (fromId && fromId !== widget.id) {
      if (layoutDebug) {
        console.debug('[layout-debug][drop]', {
          fromId,
          toId: widget.id,
          position,
          targetColumnStartHint
        });
      }
      onMove(fromId, widget.id, position, targetColumnStartHint);
    }
  };

  const handleDragEnd = () => {
    clearDragHoverState();
    dispatchClearDragHover();
  };

  const openSettings = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenSettings(widget.id);
  };

  const getNumericValue = (value: string, fallback: number) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const estimateMasonryRows = (heightEstimate: number, gapEstimate: number) => {
    const autoRow = 1;
    return Math.max(1, Math.ceil((heightEstimate + gapEstimate) / Math.max(1, autoRow + gapEstimate)));
  };

  const updateInferredColumnStart = () => {
    if (!shellEl || previewColumnStart > 0 || typeof window === 'undefined') {
      if (previewColumnStart > 0 && inferredColumnStart !== 0) inferredColumnStart = 0;
      return;
    }
    const grid = shellEl.closest('.grid') as HTMLElement | null;
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    const shellRect = shellEl.getBoundingClientRect();
    if (gridRect.width <= 0) return;
    const gridStyles = window.getComputedStyle(grid);
    const gridColumns = Math.max(
      1,
      Math.round(Number.parseFloat(gridStyles.getPropertyValue('--grid-columns') || '25') || 25)
    );
    const relativeLeft = Math.min(1, Math.max(0, (shellRect.left - gridRect.left) / gridRect.width));
    const nextStart = Math.min(gridColumns, Math.max(1, Math.floor(relativeLeft * gridColumns) + 1));
    if (nextStart !== inferredColumnStart) {
      inferredColumnStart = nextStart;
    }
  };

  const getKomodoCollapsedEstimate = () => {
    if (!(widget.kind === 'service' && widget.source === 'komodo')) return 0;
    const options = widget.options ?? {};
    const rawRows = Number(options.komodoRows);
    const rows = Number.isFinite(rawRows) && Math.round(rawRows) === 0
      ? 2
      : Math.min(20, Math.max(1, Math.round(rawRows) || 2));
    const containerHeight = Math.min(
      320,
      Math.max(72, Math.round(Number(options.containerHeight) || 112))
    );
    const listHeight = rows * containerHeight + Math.max(0, rows - 1) * 10;
    const summaryHeight = 32;
    const showMoreHeight = options.collapsible === false ? 0 : 46;
    const headerBlockHeight = showHeader ? 40 : 0;
    const cardPadding = 30;
    return cardPadding + headerBlockHeight + summaryHeight + listHeight + showMoreHeight;
  };

  const updateRowSpan = () => {
    if (layoutMode !== 'masonry') {
      rowSpan = 1;
      masonryOffset = 0;
      return;
    }

    if (!shellEl || typeof window === 'undefined') return;
    const grid = shellEl.closest('.grid');
    if (!(grid instanceof HTMLElement)) {
      rowSpan = 1;
      masonryOffset = 0;
      return;
    }

    const gridStyles = window.getComputedStyle(grid);
    const autoRow = getNumericValue(gridStyles.getPropertyValue('grid-auto-rows'), 8);
    const rowGap = getNumericValue(
      gridStyles.getPropertyValue('row-gap') || gridStyles.getPropertyValue('gap'),
      0
    );
    const useNaturalHeight =
      !lockCardHeight || (widget.kind === 'service' && widget.source === 'komodo');
    let widgetHeight = shellEl.offsetHeight;
    if (useNaturalHeight) {
      const cardEl = shellEl.querySelector(':scope > .card') as HTMLElement | null;
      const labelEl = shellEl.querySelector(':scope > .card-label') as HTMLElement | null;
      const shellStyles = window.getComputedStyle(shellEl);
      const shellGap = getNumericValue(shellStyles.rowGap || shellStyles.gap, 0);
      const labelHeight = labelEl?.offsetHeight ?? 0;
      const cardMeasuredHeight = cardEl
        ? Math.max(cardEl.offsetHeight, cardEl.scrollHeight)
        : shellEl.offsetHeight;
      const naturalWidgetHeight =
        cardMeasuredHeight +
        (labelHeight > 0 ? labelHeight + shellGap : 0);
      widgetHeight = Math.max(shellEl.offsetHeight, naturalWidgetHeight);
      // When the card is auto-height, do not reserve space for a stale persisted height.
      const persistedFloor = lockCardHeight ? Math.max(0, Math.round(previewHeight || appliedHeight || 0)) : 0;
      if (persistedFloor > 0) {
        widgetHeight = Math.max(widgetHeight, persistedFloor);
      }
    } else {
      const fixedCardHeight = Math.max(0, Math.round(previewHeight || appliedHeight || 0));
      if (fixedCardHeight > 0) {
        const labelEl = shellEl.querySelector(':scope > .card-label') as HTMLElement | null;
        const shellStyles = window.getComputedStyle(shellEl);
        const shellGap = getNumericValue(shellStyles.rowGap || shellStyles.gap, 0);
        const labelHeight = labelEl?.offsetHeight ?? 0;
        widgetHeight =
          fixedCardHeight +
          (labelHeight > 0 ? labelHeight + shellGap : 0);
      }
    }
    const next = Math.max(
      1,
      Math.ceil((widgetHeight + rowGap) / Math.max(1, autoRow + rowGap))
    );
    const allocatedHeight = next * autoRow + Math.max(0, next - 1) * rowGap;
    const offset = useNaturalHeight ? 0 : Math.max(0, allocatedHeight - widgetHeight);

    if (next !== rowSpan) {
      rowSpan = next;
    }
    masonryOffset = offset;
    updateInferredColumnStart();
  };

  const scheduleRowSpanUpdate = () => {
    if (layoutMode !== 'masonry') {
      rowSpan = 1;
      return;
    }

    if (typeof window === 'undefined') return;
    if (spanFrame) window.cancelAnimationFrame(spanFrame);
    spanFrame = window.requestAnimationFrame(() => {
      spanFrame = 0;
      updateRowSpan();
      updateInferredColumnStart();
    });
  };

  $: if (layoutMode === 'masonry' && !shellEl) {
    const komodoEstimate = getKomodoCollapsedEstimate();
    const komodoSafetyPad = komodoEstimate > 0 ? Math.max(0, Number(gridGap) || 16) : 0;
    const estimatedHeight = Math.max(
      72,
      lockCardHeight
        ? previewHeight || appliedHeight || 180
        : appliedHeight || previewHeight || 180,
      komodoEstimate + komodoSafetyPad
    );
    const gap = Math.max(0, Number(gridGap) || 16);
    const next = estimateMasonryRows(estimatedHeight, gap);
    rowSpan = next;
    const allocatedHeight = next + Math.max(0, next - 1) * gap;
    masonryOffset =
      widget.kind === 'service' && widget.source === 'komodo'
        ? 0
        : Math.max(0, allocatedHeight - estimatedHeight);
  }

  onMount(() => {
    const runTransitionLayoutSync = () => {
      if (layoutTransitionFrame && typeof window !== 'undefined') {
        window.cancelAnimationFrame(layoutTransitionFrame);
      }
      if (typeof window === 'undefined') return;
      const tickTransition = () => {
        layoutTransitionFrame = 0;
        updateRowSpan();
        updateInferredColumnStart();
        if (activeLayoutTransitions > 0) {
          layoutTransitionFrame = window.requestAnimationFrame(tickTransition);
        }
      };
      layoutTransitionFrame = window.requestAnimationFrame(tickTransition);
    };

    const handleTransitionRun = (event: Event) => {
      if (!(event.target instanceof HTMLElement) || !shellEl?.contains(event.target)) return;
      if (widget.kind === 'service' && widget.source === 'komodo') return;
      activeLayoutTransitions += 1;
      runTransitionLayoutSync();
    };

    const handleTransitionDone = (event: Event) => {
      if (!(event.target instanceof HTMLElement) || !shellEl?.contains(event.target)) return;
      if (widget.kind === 'service' && widget.source === 'komodo') return;
      activeLayoutTransitions = Math.max(0, activeLayoutTransitions - 1);
      if (activeLayoutTransitions === 0) {
        if (layoutTransitionFrame && typeof window !== 'undefined') {
          window.cancelAnimationFrame(layoutTransitionFrame);
          layoutTransitionFrame = 0;
        }
        scheduleRowSpanUpdate();
      }
    };

    const handleKomodoLayoutStart = (event: Event) => {
      if (!(widget.kind === 'service' && widget.source === 'komodo')) return;
      const detail = (event as CustomEvent<{ expanded?: boolean }>).detail;
      if (typeof detail?.expanded === 'boolean') {
        komodoExpanded = detail.expanded;
      }
      komodoLayoutAnimating = true;
      activeLayoutTransitions += 1;
      runTransitionLayoutSync();
    };

    const handleKomodoLayoutEnd = (event: Event) => {
      if (!(widget.kind === 'service' && widget.source === 'komodo')) return;
      const detail = (event as CustomEvent<{ expanded?: boolean }>).detail;
      if (typeof detail?.expanded === 'boolean') {
        komodoExpanded = detail.expanded;
      }
      komodoLayoutAnimating = false;
      activeLayoutTransitions = Math.max(0, activeLayoutTransitions - 1);
      if (activeLayoutTransitions === 0) {
        if (layoutTransitionFrame && typeof window !== 'undefined') {
          window.cancelAnimationFrame(layoutTransitionFrame);
          layoutTransitionFrame = 0;
        }
        scheduleRowSpanUpdate();
      }
    };

    scheduleRowSpanUpdate();
    updateInferredColumnStart();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', scheduleRowSpanUpdate);
    }

    if (typeof ResizeObserver !== 'undefined' && shellEl) {
      spanObserver = new ResizeObserver(() => scheduleRowSpanUpdate());
      spanObserver.observe(shellEl);
      const card = shellEl.querySelector('.card');
      if (card instanceof HTMLElement) {
        spanObserver.observe(card);
      }
    }

    if (typeof MutationObserver !== 'undefined' && shellEl) {
      contentObserver = new MutationObserver(() => scheduleRowSpanUpdate());
      contentObserver.observe(shellEl, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true
      });
    }

    shellEl?.addEventListener('transitionrun', handleTransitionRun, true);
    shellEl?.addEventListener('transitionend', handleTransitionDone, true);
    shellEl?.addEventListener('transitioncancel', handleTransitionDone, true);
    shellEl?.addEventListener('komodo-layout-start', handleKomodoLayoutStart as EventListener, true);
    shellEl?.addEventListener('komodo-layout-end', handleKomodoLayoutEnd as EventListener, true);
    window.addEventListener(CLEAR_DRAG_HOVER_EVENT, clearDragHoverState);
    window.addEventListener('drop', clearDragHoverState);
    window.addEventListener('dragend', clearDragHoverState);

    return () => {
      if (spanFrame && typeof window !== 'undefined') {
        window.cancelAnimationFrame(spanFrame);
      }
      if (resizeFrame && typeof window !== 'undefined') {
        window.cancelAnimationFrame(resizeFrame);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', scheduleRowSpanUpdate);
      }
      shellEl?.removeEventListener('transitionrun', handleTransitionRun, true);
      shellEl?.removeEventListener('transitionend', handleTransitionDone, true);
      shellEl?.removeEventListener('transitioncancel', handleTransitionDone, true);
      shellEl?.removeEventListener('komodo-layout-start', handleKomodoLayoutStart as EventListener, true);
      shellEl?.removeEventListener('komodo-layout-end', handleKomodoLayoutEnd as EventListener, true);
      window.removeEventListener(CLEAR_DRAG_HOVER_EVENT, clearDragHoverState);
      window.removeEventListener('drop', clearDragHoverState);
      window.removeEventListener('dragend', clearDragHoverState);
      spanObserver?.disconnect();
      contentObserver?.disconnect();
      spanObserver = null;
      contentObserver = null;
      activeLayoutTransitions = 0;
      komodoLayoutAnimating = false;
      komodoExpanded = false;
      if (layoutTransitionFrame && typeof window !== 'undefined') {
        window.cancelAnimationFrame(layoutTransitionFrame);
        layoutTransitionFrame = 0;
      }
    };
  });
</script>

<div
  bind:this={shellEl}
  data-widget-id={widget.id}
  class={`widget-shell ${hideMobile ? 'hide-mobile' : ''} ${titleAbove ? 'has-title-above' : ''} ${dragOver ? 'drag-over' : ''} ${dragOver ? `drag-over-${dragPosition}` : ''} ${!lockCardHeight ? 'dynamic-height' : ''} ${widget.kind === 'service' && widget.source === 'komodo' ? 'komodo-resizable' : ''} ${komodoLayoutAnimating ? 'komodo-layout-animating' : ''} ${dragging ? 'resizing' : ''}`}
  style={`--span: ${previewGridSpan}; --rows: ${rowSpan}; --masonry-offset: ${masonryOffset}px; --mobile-span: ${mobileSpan}; ${effectiveColumnStart > 0 ? `--column-start: ${effectiveColumnStart};` : ''} ${forcedRowStart > 0 ? `--row-start: ${forcedRowStart};` : ''} ${lockCardHeight && previewHeight > 0 ? `--card-height: ${previewHeight}px;` : ''} ${widget.kind === 'service' && widget.source === 'komodo' && previewHeight > 0 ? `--komodo-min-height:${previewHeight}px;` : ''}`}
  role="group"
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
>
  {#if titleAbove}
    <div
      class={`card-label ${clickable ? 'clickable' : ''} ${titleAboveSpacer && !titleAboveText ? 'spacer' : ''}`}
      role={clickable ? 'link' : undefined}
      on:click={handleNavigate}
      on:keydown={handleKeydown}
    >
      {titleAboveText}
    </div>
  {/if}
  <article
    class={`card ${clickable ? 'clickable' : ''} ${editMode ? 'editing' : ''}`}
    style={`${widget.kind === 'service' && widget.source === 'komodo' ? '--komodo-card-pad-bottom: 0px; padding-bottom: var(--komodo-card-pad-bottom);' : ''}${cardTypographyStyle ? `;${cardTypographyStyle}` : ''}`}
    role={clickable ? 'link' : undefined}
    on:click={handleNavigate}
    on:keydown={handleKeydown}
  >
    {#if showHeader}
      <div class="card-header">
        <div class="card-title-wrap">
          {#if !hideTitleIcon && titleIcon && !titleIconErrored}
            <img
              class="card-title-icon"
              src={titleIcon}
              alt={widget.source}
              loading="eager"
              decoding="async"
              on:error={() => (titleIconErrored = true)}
            />
          {/if}
          <div class="card-title">{widget.title}</div>
        </div>
      </div>
    {/if}
    {#if layoutDebug}
      <div class="layout-debug-chip">
        {widget.id} c{effectiveColumnStart || inferredColumnStart || 1} s{previewGridSpan} r{forcedRowStart || '?'} x {rowSpan}
      </div>
    {/if}
    {#if showHealth}
      <div class={`card-health ${widget.health ?? 'unknown'}`} title={healthLabel}></div>
    {/if}
    {#if editMode}
      <button
        class="open-settings-button"
        type="button"
        aria-label={`Open settings for ${widget.title}`}
        title="Open widget settings"
        on:click={openSettings}
      >
        <span class="open-settings-glyph" aria-hidden="true">✎</span>
      </button>
    {/if}
    <div class="card-body">
      <WidgetRenderer {widget} />
    </div>
    {#if editMode}
      <div class="card-edit-controls">
        <button class="move-handle" draggable="true" on:dragstart|stopPropagation={handleDragStart} on:dragend|stopPropagation={handleDragEnd}>Move</button>
        <button class="resize-handle" on:pointerdown|stopPropagation={startResize}>Resize</button>
      </div>
    {/if}
  </article>
</div>

<style>
  .widget-shell {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    transition: box-shadow 120ms ease, transform 120ms ease;
  }

  .widget-shell.has-title-above {
    gap: 2px;
  }

  .widget-shell.drag-over .card {
    box-shadow: 0 0 0 2px rgba(106, 168, 255, 0.75), 0 12px 30px rgba(4, 10, 18, 0.35);
  }

  .widget-shell.drag-over-before .card::before,
  .widget-shell.drag-over-left .card::before,
  .widget-shell.drag-over-after .card::after,
  .widget-shell.drag-over-right .card::after {
    content: '';
    position: absolute;
    border-radius: 999px;
    background: rgba(106, 168, 255, 0.95);
    z-index: 5;
  }

  .widget-shell.drag-over-before .card::before {
    left: 14px;
    right: 14px;
    height: 3px;
    top: 8px;
  }

  .widget-shell.drag-over-after .card::after {
    left: 14px;
    right: 14px;
    height: 3px;
    bottom: 8px;
  }

  .widget-shell.drag-over-left .card::before {
    top: 14px;
    bottom: 14px;
    width: 3px;
    left: 8px;
  }

  .widget-shell.drag-over-right .card::after {
    top: 14px;
    bottom: 14px;
    width: 3px;
    right: 8px;
  }

  .widget-shell.resizing {
    transition: none;
  }

  .widget-shell.komodo-resizable {
    z-index: 20;
    isolation: isolate;
  }

  .widget-shell.komodo-resizable.komodo-layout-animating .card {
    will-change: height, transform;
    contain: paint;
  }

  .widget-shell.dynamic-height .card {
    height: auto;
    min-height: 0;
  }

  .widget-shell.dynamic-height .card-body {
    flex: 0 0 auto;
  }

  .widget-shell.dynamic-height.komodo-resizable .card {
    min-height: var(--komodo-min-height, 0px);
  }

  .card-label {
    font-size: calc(var(--card-title-above-size, 12px) * var(--ui-scale, 1));
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--card-header-color, var(--muted));
    margin: 0;
    padding-left: 2px;
    font-family: var(--card-header-font-family, var(--font-heading));
    font-weight: var(--card-header-font-weight, 600);
  }

  .card-label.spacer {
    min-height: 1em;
  }

  .card-label.clickable {
    cursor: pointer;
    color: var(--text);
  }

  .card-title-wrap {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .card-title-icon {
    width: 22px;
    height: 22px;
    border-radius: 7px;
    flex: 0 0 auto;
    object-fit: contain;
  }

  .layout-debug-chip {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    max-width: 100%;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px dashed rgba(106, 168, 255, 0.55);
    background: rgba(7, 13, 22, 0.75);
    color: #9fcbff;
    font-size: 11px;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .resize-handle {
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--card-border);
    background: transparent;
    color: var(--text);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: nwse-resize;
  }

  .card-edit-controls {
    position: absolute;
    right: 10px;
    bottom: 10px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    z-index: 4;
  }

  .move-handle {
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--card-border);
    background: transparent;
    color: var(--text);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: grab;
  }

  .open-settings-button {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 32px;
    height: 32px;
    border: 1px solid var(--card-border);
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 16, 24, 0.72);
    color: var(--text);
    cursor: pointer;
    z-index: 8;
    pointer-events: auto;
    backdrop-filter: blur(4px);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
  }

  .open-settings-button:hover {
    background: rgba(20, 27, 35, 0.92);
    border-color: rgba(132, 190, 255, 0.65);
  }

  .open-settings-glyph {
    display: inline-block;
    line-height: 1;
    font-size: 15px;
    font-weight: 700;
    color: currentColor;
  }

  .card-health {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: rgba(154, 168, 186, 0.6);
    box-shadow: 0 0 10px rgba(126, 231, 135, 0.4);
  }

  .card.editing .card-health {
    right: 50px;
  }

  .card-health.healthy {
    background: var(--success);
    box-shadow: 0 0 10px rgba(126, 231, 135, 0.5);
  }

  .card-health.unhealthy {
    background: var(--danger);
    box-shadow: 0 0 10px rgba(255, 107, 107, 0.5);
  }

  .card-health.unknown {
    background: rgba(154, 168, 186, 0.6);
    box-shadow: 0 0 10px rgba(154, 168, 186, 0.2);
  }

  .card.clickable {
    cursor: pointer;
  }

  .card-body {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
  }
</style>
