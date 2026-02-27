<script lang="ts">
  import type { WidgetInstance } from '$widgets/types';

  type QueueItem = {
    id: string;
    name: string;
    status: string;
    progress: number;
    eta: string;
  };

  type HistoryItem = {
    id: string;
    name: string;
    status: 'success' | 'failed' | 'unknown';
    duration: string;
    completedAt: string;
  };

  type SabnzbdPayload = {
    speed?: string;
    elapsed?: string;
    queue?: QueueItem[];
    history?: HistoryItem[];
    error?: string;
  };

  export let widget: WidgetInstance<SabnzbdPayload>;

  let speed = '0 B/s';
  let elapsed = '0:00:00';
  let queue: QueueItem[] = [];
  let history: HistoryItem[] = [];
  let showHistory = true;
  let queueLimit = 8;
  let historyLimit = 8;

  $: speed = widget.data?.speed ?? '0 B/s';
  $: elapsed = widget.data?.elapsed ?? '0:00:00';
  $: queue = Array.isArray(widget.data?.queue) ? widget.data.queue : [];
  $: history = Array.isArray(widget.data?.history) ? widget.data.history : [];
  $: showHistory = widget.options?.showHistory !== false;
  $: queueLimit = Math.min(30, Math.max(1, Number(widget.options?.queueLimit ?? 8)));
  $: historyLimit = Math.min(30, Math.max(1, Number(widget.options?.historyLimit ?? 8)));
</script>

{#if widget.data?.error}
  <p class="error-text">{widget.data.error}</p>
{:else}
  <div class="sab-shell">
    <div class="sab-topbar">
      <div class="sab-stat">
        <span class="label">Speed</span>
        <span class="value">{speed}</span>
      </div>
      <div class="sab-stat">
        <span class="label">Elapsed</span>
        <span class="value">{elapsed}</span>
      </div>
    </div>

    <div class="sab-section">
      <div class="sab-heading">Queue</div>
      {#if queue.length === 0}
        <div class="sab-empty">No active downloads.</div>
      {:else}
        <div class="sab-list">
          {#each queue.slice(0, queueLimit) as item}
            <div class="sab-row">
              <div class="sab-row-head">
                <div class="name" title={item.name}>{item.name}</div>
                <div class="meta">{item.status} · ETA {item.eta}</div>
              </div>
              <div class="sab-progress">
                <div class="bar" style={`width:${Math.min(100, Math.max(0, item.progress))}%`}></div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    {#if showHistory}
      <div class="sab-section history">
        <div class="sab-heading">History</div>
        {#if history.length === 0}
          <div class="sab-empty">No recent history.</div>
        {:else}
          <div class="sab-list">
            {#each history.slice(0, historyLimit) as item}
              <div class="sab-row history-row">
                <div class="name" title={item.name}>{item.name}</div>
                <div class={`status ${item.status}`}>
                  {item.status === 'success' ? 'Completed' : item.status === 'failed' ? 'Failed' : 'Unknown'}
                </div>
                <div class="meta">{item.duration} · {item.completedAt}</div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .sab-shell {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
    min-height: 0;
    padding: 0;
  }

  .sab-topbar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    align-items: center;
  }

  .sab-stat {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 6px 8px;
  }

  .sab-stat .label {
    font-size: 0.72rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .sab-stat .value {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--text);
  }

  .sab-section {
    display: flex;
    flex-direction: column;
    min-height: 0;
    gap: 8px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 8px;
  }

  .sab-section.history {
    flex: 1 1 auto;
  }

  .sab-heading {
    color: var(--text);
    font-size: 1.02rem;
    font-weight: 600;
  }

  .sab-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
    overflow: auto;
    padding-right: 2px;
  }

  .sab-row {
    display: flex;
    flex-direction: column;
    gap: 5px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 7px 8px;
  }

  .sab-row-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font-size: 0.86rem;
    font-weight: 600;
  }

  .meta {
    color: var(--muted);
    font-size: 0.74rem;
    white-space: nowrap;
  }

  .sab-progress {
    width: 100%;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .sab-progress .bar {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #6aa8ff, #8fc8ff);
  }

  .history-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
  }

  .status {
    font-size: 0.73rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status.success {
    color: #8ef1b7;
  }

  .status.failed {
    color: #ffa3a3;
  }

  .status.unknown {
    color: var(--muted);
  }

  .sab-empty {
    color: var(--muted);
    font-size: 0.82rem;
    padding: 4px 2px;
  }
</style>
