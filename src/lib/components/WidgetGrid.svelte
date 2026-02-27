<script lang="ts">
  import { onMount } from 'svelte';
  import WidgetCard from './WidgetCard.svelte';
  import type { WidgetInstance } from '$widgets/types';

  export let items: WidgetInstance[] = [];
  export let editMode = false;
  export let onResize: (id: string, layout: { span: number; height?: number; columnStart?: number }) => void = () => {};
  export let onMove: (
    fromId: string,
    toId: string,
    position?: 'before' | 'after' | 'left' | 'right',
    targetColumnStartHint?: number
  ) => void = () => {};
  export let onOpenSettings: (id: string) => void = () => {};
  export let onDropToGrid: (fromId: string, relativeX: number, relativeY: number) => void = () => {};
  export let layoutMode: 'grid' | 'masonry' = 'masonry';
  export let gridGap = 16;
  export let showHealthCircles = true;
  export let gridColumns = 25;
  export let layoutDebug = false;
  export let snapAnchor:
    | {
        movedId: string;
        targetId: string;
        position: 'before' | 'after';
        createdAt: number;
      }
    | null = null;

  let gridEl: HTMLDivElement | null = null;
  let activeGridColumns = Math.max(1, gridColumns);
  let measuredRowsById: Record<string, number> = {};
  let rowStartsById: Record<string, number> = {};
  let lastDebugSignature = '';
  let dragPreview:
    | {
        fromId: string;
        toId: string;
        position: 'before' | 'after' | 'left' | 'right';
        targetColumnStartHint?: number;
        movedSpanGrid?: number;
      }
    | null = null;
  let ghostPlacement:
    | {
        columnStart: number;
        span: number;
        rowStart: number;
        rows: number;
      }
    | null = null;
  const SNAP_ANCHOR_TTL_MS = 3500;

  const numbersEqual = (left: Record<string, number>, right: Record<string, number>) => {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (left[key] !== right[key]) return false;
    }
    return true;
  };

  const toDesktopSpan = (widget: WidgetInstance) =>
    Math.max(1, Math.round(Number(widget.layout?.span ?? 4) * 2));

  const getPlacementSpec = (widget: WidgetInstance, columns: number) => {
    if (columns <= 4) {
      const mobileSpan = Math.max(1, Math.min(4, Math.round(Number(widget.mobile?.span ?? 4))));
      return { columnStart: 1, span: Math.min(columns, mobileSpan) };
    }
    const span = Math.max(1, Math.min(columns, toDesktopSpan(widget)));
    const maxStart = Math.max(1, columns - span + 1);
    const rawStart = Number(widget.layout?.columnStart ?? 1);
    const start = Number.isFinite(rawStart) && rawStart > 0 ? Math.round(rawStart) : 1;
    return { columnStart: Math.max(1, Math.min(maxStart, start)), span };
  };

  const rangesOverlap = (leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) =>
    leftStart <= rightEnd && rightStart <= leftEnd;
  const toGridSpan = (widget: WidgetInstance) =>
    Math.max(1, Math.min(24, Math.round(Number(widget.layout?.span ?? 4) * 2)));

  const readActiveGridColumns = () => {
    if (!gridEl || typeof window === 'undefined') return;
    const computed = window.getComputedStyle(gridEl);
    const template = computed.gridTemplateColumns.trim();
    if (!template || template === 'none') {
      activeGridColumns = Math.max(1, gridColumns);
      return;
    }
    const tokenCount = template.split(/\s+/).filter(Boolean).length;
    activeGridColumns = Math.max(1, tokenCount || gridColumns);
  };

  const handleRowsChange = (id: string, rows: number) => {
    const nextRows = Math.max(1, Math.round(Number(rows) || 1));
    if (measuredRowsById[id] === nextRows) return;
    measuredRowsById = { ...measuredRowsById, [id]: nextRows };
  };

  const clearGhostPreview = () => {
    dragPreview = null;
    ghostPlacement = null;
  };

  const computeGhostPlacement = () => {
    if (layoutMode !== 'masonry' || !dragPreview) {
      ghostPlacement = null;
      return;
    }
    const fromIndex = items.findIndex((widget) => widget.id === dragPreview.fromId);
    const toIndex = items.findIndex((widget) => widget.id === dragPreview.toId);
    if (fromIndex === -1 || toIndex === -1) {
      ghostPlacement = null;
      return;
    }
    const moved = items[fromIndex];
    const target = items[toIndex];
    if (!moved || !target || moved.id === target.id) {
      ghostPlacement = null;
      return;
    }

    const movedSpan = Math.max(
      1,
      Math.min(24, Math.round(Number(dragPreview.movedSpanGrid ?? toGridSpan(moved))))
    );
    const targetSpan = toGridSpan(target);
    const columns = Math.max(1, activeGridColumns || gridColumns || 25);
    const maxStart = Math.max(1, columns - movedSpan + 1);
    const movedCurrentStart = getPlacementSpec(moved, columns).columnStart;
    const hintedStart =
      typeof dragPreview.targetColumnStartHint === 'number' && Number.isFinite(dragPreview.targetColumnStartHint)
        ? Math.max(1, Math.round(dragPreview.targetColumnStartHint))
        : getPlacementSpec(target, columns).columnStart;
    let nextStart = hintedStart;
    if (dragPreview.position === 'left') {
      nextStart = Math.max(1, hintedStart - movedSpan);
    } else if (dragPreview.position === 'right') {
      nextStart = Math.min(maxStart, hintedStart + targetSpan);
    } else if (!Number.isFinite(nextStart)) {
      nextStart = movedCurrentStart;
    }
    nextStart = Math.max(1, Math.min(maxStart, nextStart || movedCurrentStart || 1));

    const movedWithPlacement: WidgetInstance = {
      ...moved,
      layout: {
        ...(moved.layout ?? { span: 4 }),
        columnStart: nextStart,
        span: moved.layout?.span ?? 4,
        height: moved.layout?.height
      }
    };

    const reordered = [...items];
    reordered.splice(fromIndex, 1);
    const adjustedTargetIndex = reordered.findIndex((widget) => widget.id === target.id);
    if (adjustedTargetIndex === -1) {
      ghostPlacement = null;
      return;
    }
    const insertAfter = dragPreview.position === 'after' || dragPreview.position === 'right';
    const insertIndex = Math.max(0, Math.min(reordered.length, adjustedTargetIndex + (insertAfter ? 1 : 0)));
    reordered.splice(insertIndex, 0, movedWithPlacement);

    const activeAnchor =
      dragPreview.position === 'before' || dragPreview.position === 'after'
        ? {
            movedId: moved.id,
            targetId: target.id,
            position: dragPreview.position,
            createdAt: Date.now()
          }
        : null;

    const placements: Array<{
      id: string;
      columnStart: number;
      columnEnd: number;
      rowStart: number;
      rowEnd: number;
    }> = [];

    for (const widget of reordered) {
      const spec = getPlacementSpec(widget, columns);
      const columnStart = spec.columnStart;
      const columnEnd = Math.min(columns, columnStart + spec.span - 1);
      const rows = Math.max(1, Math.round(Number(measuredRowsById[widget.id] ?? 1)));
      let rowStart = 1;
      if (activeAnchor && widget.id === activeAnchor.movedId) {
        const targetPlacement = placements.find((placed) => placed.id === activeAnchor.targetId);
        if (targetPlacement) {
          rowStart =
            activeAnchor.position === 'after'
              ? Math.max(1, targetPlacement.rowEnd + 1)
              : Math.max(1, targetPlacement.rowStart - rows);
        }
      }
      while (true) {
        let blockingRowEnd = 0;
        for (const placed of placements) {
          if (!rangesOverlap(columnStart, columnEnd, placed.columnStart, placed.columnEnd)) continue;
          const rowEnd = rowStart + rows - 1;
          if (rowStart > placed.rowEnd || rowEnd < placed.rowStart) continue;
          if (placed.rowEnd > blockingRowEnd) blockingRowEnd = placed.rowEnd;
        }
        if (blockingRowEnd === 0) break;
        rowStart = blockingRowEnd + 1;
      }
      const rowEnd = rowStart + rows - 1;
      placements.push({ id: widget.id, columnStart, columnEnd, rowStart, rowEnd });
    }

    const movedPlacement = placements.find((placement) => placement.id === moved.id);
    if (!movedPlacement) {
      ghostPlacement = null;
      return;
    }
    ghostPlacement = {
      columnStart: movedPlacement.columnStart,
      span: movedSpan,
      rowStart: movedPlacement.rowStart,
      rows: Math.max(1, Math.round(Number(measuredRowsById[moved.id] ?? 1)))
    };
  };

  $: {
    const knownIds = new Set(items.map((widget) => widget.id));
    const nextMeasured = Object.fromEntries(
      Object.entries(measuredRowsById).filter(([id]) => knownIds.has(id))
    );
    if (!numbersEqual(nextMeasured, measuredRowsById)) {
      measuredRowsById = nextMeasured;
    }
  }

  $: {
    dragPreview;
    items;
    measuredRowsById;
    activeGridColumns;
    gridColumns;
    layoutMode;
    computeGhostPlacement();
  }

  $: {
    if (layoutMode !== 'masonry') {
      if (Object.keys(rowStartsById).length > 0) rowStartsById = {};
    } else {
      const columns = Math.max(1, activeGridColumns || gridColumns || 25);
      const activeAnchor =
        snapAnchor && Date.now() - snapAnchor.createdAt <= SNAP_ANCHOR_TTL_MS ? snapAnchor : null;
      const placements: Array<{
        id: string;
        columnStart: number;
        columnEnd: number;
        rowStart: number;
        rowEnd: number;
      }> = [];
      const nextRowStarts: Record<string, number> = {};

      for (const widget of items) {
        const spec = getPlacementSpec(widget, columns);
        const columnStart = spec.columnStart;
        const columnEnd = Math.min(columns, columnStart + spec.span - 1);
        const rows = Math.max(1, Math.round(Number(measuredRowsById[widget.id] ?? 1)));
        let rowStart = 1;
        if (activeAnchor && widget.id === activeAnchor.movedId) {
          const targetPlacement = placements.find((placed) => placed.id === activeAnchor.targetId);
          if (targetPlacement) {
            rowStart =
              activeAnchor.position === 'after'
                ? Math.max(1, targetPlacement.rowEnd + 1)
                : Math.max(1, targetPlacement.rowStart - rows);
          }
        }

        while (true) {
          let blockingRowEnd = 0;
          for (const placed of placements) {
            if (!rangesOverlap(columnStart, columnEnd, placed.columnStart, placed.columnEnd)) continue;
            const rowEnd = rowStart + rows - 1;
            if (rowStart > placed.rowEnd || rowEnd < placed.rowStart) continue;
            if (placed.rowEnd > blockingRowEnd) blockingRowEnd = placed.rowEnd;
          }
          if (blockingRowEnd === 0) break;
          rowStart = blockingRowEnd + 1;
        }

        const rowEnd = rowStart + rows - 1;
        placements.push({ id: widget.id, columnStart, columnEnd, rowStart, rowEnd });
        nextRowStarts[widget.id] = rowStart;
      }

      if (!numbersEqual(nextRowStarts, rowStartsById)) {
        rowStartsById = nextRowStarts;
        if (layoutDebug && typeof window !== 'undefined') {
          const debugRows = items.map((widget, index) => {
            const spec = getPlacementSpec(widget, columns);
            return {
              order: index,
              id: widget.id,
              columnStart: spec.columnStart,
              span: spec.span,
              rowStart: rowStartsById[widget.id] ?? 1,
              rows: measuredRowsById[widget.id] ?? 1
            };
          });
          const signature = JSON.stringify(
            debugRows.map((entry) => `${entry.id}:${entry.columnStart}:${entry.rowStart}:${entry.rows}`)
          );
          if (signature !== lastDebugSignature) {
            lastDebugSignature = signature;
            console.groupCollapsed('[layout-debug][packer]');
            console.table(debugRows);
            console.groupEnd();
          }
        }
      }
    }
  }

  onMount(() => {
    readActiveGridColumns();
    if (typeof window === 'undefined') return;
    const onResize = () => readActiveGridColumns();
    window.addEventListener('resize', onResize);
    const observer =
      typeof ResizeObserver !== 'undefined' && gridEl
        ? new ResizeObserver(() => readActiveGridColumns())
        : null;
    if (observer && gridEl) observer.observe(gridEl);
    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  });

  const handleGridDragOver = (event: DragEvent) => {
    if (!editMode) return;
    if (!event.dataTransfer?.types.includes('text/plain')) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const handleGridDrop = (event: DragEvent) => {
    if (!editMode) return;
    if (event.defaultPrevented) return;
    if (!event.dataTransfer?.types.includes('text/plain')) return;
    event.preventDefault();
    const fromId = event.dataTransfer.getData('text/plain');
    if (!fromId) return;
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    const relativeX =
      rect && rect.width > 0
        ? Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
        : 0.5;
    const relativeY =
      rect && rect.height > 0
        ? Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
        : 0.5;
    clearGhostPreview();
    onDropToGrid(fromId, relativeX, relativeY);
  };
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={gridEl}
  class={`grid ${layoutMode === 'masonry' ? 'masonry' : 'regular'}`}
  on:dragover={handleGridDragOver}
  on:drop={handleGridDrop}
  on:dragleave={clearGhostPreview}
>
  {#if layoutDebug}
    <div class="layout-debug-columns" aria-hidden="true">
      {#each Array.from({ length: activeGridColumns }) as _, columnIndex}
        <span class="layout-debug-column" style={`left: ${(columnIndex / activeGridColumns) * 100}%`}></span>
      {/each}
    </div>
  {/if}
  {#if ghostPlacement}
    <div
      class="layout-ghost-placement"
      style={`grid-column: ${ghostPlacement.columnStart} / span ${ghostPlacement.span}; grid-row: ${ghostPlacement.rowStart} / span ${ghostPlacement.rows};`}
      aria-hidden="true"
    ></div>
  {/if}
  {#each items as widget (widget.id)}
    <WidgetCard
      {widget}
      {editMode}
      {onResize}
      {onMove}
      {onOpenSettings}
      {layoutMode}
      {gridGap}
      {showHealthCircles}
      forcedRowStart={rowStartsById[widget.id] ?? 0}
      onRowsChange={handleRowsChange}
      {layoutDebug}
      onDragPreview={(payload) => (dragPreview = payload)}
    />
  {/each}
</div>

<style>
  .grid {
    position: relative;
  }

  .layout-debug-columns {
    pointer-events: none;
    position: absolute;
    inset: 0;
    z-index: 2;
  }

  .layout-debug-column {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(72, 159, 255, 0.24);
  }

  .layout-debug-column:first-child {
    left: 0;
  }

  .layout-debug-column:last-child {
    right: 0;
    left: auto !important;
  }

  .layout-ghost-placement {
    pointer-events: none;
    z-index: 3;
    border-radius: 14px;
    border: 1px dashed rgba(106, 168, 255, 0.9);
    background: linear-gradient(
      135deg,
      rgba(66, 132, 220, 0.2),
      rgba(36, 92, 174, 0.1)
    );
    box-shadow: inset 0 0 0 1px rgba(140, 196, 255, 0.25);
  }
</style>
