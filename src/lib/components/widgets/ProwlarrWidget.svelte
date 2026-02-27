<script lang="ts">
  import type { WidgetInstance } from '$widgets/types';

  type ProwlarrItem = {
    id: number;
    name: string;
    enabled: boolean;
    privacy: string;
    health: 'healthy' | 'unhealthy' | 'warning' | 'disabled';
    href?: string;
  };

  type ProwlarrPayload = {
    summary?: {
      total: number;
      enabled: number;
      disabled: number;
    };
    items?: ProwlarrItem[];
    error?: string;
  };

  export let widget: WidgetInstance<ProwlarrPayload>;

  let items: ProwlarrItem[] = [];
  let collapseAfter = 5;
  let expanded = false;
  let sortMode: 'alphabetical' | 'enabled' = 'alphabetical';
  let showHealthColumn = true;
  let visibleItems: ProwlarrItem[] = [];
  let hiddenCount = 0;

  $: items = (() => {
    const raw = Array.isArray(widget.data?.items) ? widget.data.items : [];
    const alphabetic = [...raw].sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode !== 'enabled') return alphabetic;
    const enabled = alphabetic.filter((item) => item.enabled);
    const disabled = alphabetic.filter((item) => !item.enabled);
    return [...enabled, ...disabled];
  })();
  $: collapseAfter = Math.min(100, Math.max(1, Number(widget.options?.collapseAfter ?? 5)));
  $: sortMode = widget.options?.prowlarrSort === 'enabled' ? 'enabled' : 'alphabetical';
  $: showHealthColumn = widget.options?.showHealthColumn !== false;
  $: hiddenCount = Math.max(0, items.length - collapseAfter);
  $: visibleItems = expanded ? items : items.slice(0, collapseAfter);

  const toggleExpanded = () => {
    expanded = !expanded;
  };
</script>

{#if widget.data?.error}
  <p class="error-text">{widget.data.error}</p>
{:else}
  <div class="prowlarr-shell">
    <div class="prowlarr-summary">
      <span>Total {widget.data?.summary?.total ?? items.length}</span>
      <span class="good">Enabled {widget.data?.summary?.enabled ?? items.filter((item) => item.enabled).length}</span>
      <span class="bad">Disabled {widget.data?.summary?.disabled ?? items.filter((item) => !item.enabled).length}</span>
    </div>

    {#if items.length === 0}
      <div class="prowlarr-empty">No indexers found.</div>
    {:else}
      <div class="prowlarr-list">
        {#each visibleItems as item}
          {#if item.href}
            <a class={`prowlarr-item ${showHealthColumn ? '' : 'no-health'}`} href={item.href} target="_blank" rel="noreferrer">
              <span class="name">{item.name}</span>
              <span class="privacy">{item.privacy}</span>
              <span class={`status ${item.enabled ? 'enabled' : 'disabled'}`}>
                {item.enabled ? 'Enabled' : 'Disabled'}
              </span>
              {#if showHealthColumn}
                <span class={`health-dot ${item.health}`} title={`Health: ${item.health}`}></span>
              {/if}
            </a>
          {:else}
            <div class={`prowlarr-item ${showHealthColumn ? '' : 'no-health'}`}>
              <span class="name">{item.name}</span>
              <span class="privacy">{item.privacy}</span>
              <span class={`status ${item.enabled ? 'enabled' : 'disabled'}`}>
                {item.enabled ? 'Enabled' : 'Disabled'}
              </span>
              {#if showHealthColumn}
                <span class={`health-dot ${item.health}`} title={`Health: ${item.health}`}></span>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    {/if}

    {#if hiddenCount > 0 || expanded}
      <div class="prowlarr-toggle-wrap">
        <button class="prowlarr-toggle" type="button" on:click={toggleExpanded}>
          {expanded ? 'Show Less' : `Show More (${hiddenCount})`}
        </button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .prowlarr-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    gap: 10px;
  }

  .prowlarr-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .prowlarr-summary .good {
    color: #7ee787;
  }

  .prowlarr-summary .bad {
    color: #ff9494;
  }

  .prowlarr-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow: auto;
    padding-right: 2px;
  }

  .prowlarr-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto;
    align-items: center;
    gap: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.03);
    padding: 8px 10px;
    color: inherit;
    text-decoration: none;
  }

  .prowlarr-item.no-health {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }

  .prowlarr-item .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.92rem;
    color: var(--text);
  }

  .prowlarr-item .privacy {
    text-transform: capitalize;
    padding: 2px 8px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 999px;
    font-size: 0.7rem;
    color: var(--muted);
  }

  .prowlarr-item .status {
    font-size: 0.74rem;
    font-weight: 600;
  }

  .prowlarr-item .status.enabled {
    color: #7ee787;
  }

  .prowlarr-item .status.disabled {
    color: #ff9494;
  }

  .health-dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    justify-self: end;
    background: rgba(154, 168, 186, 0.7);
    box-shadow: 0 0 8px rgba(154, 168, 186, 0.3);
  }

  .health-dot.healthy {
    background: #7ee787;
    box-shadow: 0 0 8px rgba(126, 231, 135, 0.45);
  }

  .health-dot.unhealthy {
    background: #ff9494;
    box-shadow: 0 0 8px rgba(255, 148, 148, 0.45);
  }

  .health-dot.warning {
    background: #ffd36d;
    box-shadow: 0 0 8px rgba(255, 211, 109, 0.45);
  }

  .health-dot.disabled {
    background: rgba(154, 168, 186, 0.7);
    box-shadow: 0 0 8px rgba(154, 168, 186, 0.3);
  }

  .prowlarr-empty {
    color: var(--muted);
    font-size: 0.84rem;
    padding: 6px 2px;
  }

  .prowlarr-toggle-wrap {
    margin-top: auto;
    display: flex;
    justify-content: center;
  }

  .prowlarr-toggle {
    border: 1px solid var(--card-border);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.03);
    color: var(--text);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    padding: 6px 12px;
    cursor: pointer;
  }
</style>
