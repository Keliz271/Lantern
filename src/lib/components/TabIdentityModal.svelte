<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import type { TabIconDef, TabIconKey } from '$widgets/tabIcons';

  export let open = false;
  export let initialName = '';
  export let initialIcon: TabIconKey = 'layoutGrid';
  export let icons: TabIconDef[] = [];

  const dispatch = createEventDispatcher<{
    cancel: void;
    save: { name: string; icon: TabIconKey };
  }>();

  let name = '';
  let icon: TabIconKey = initialIcon;
  let nameEl: HTMLInputElement | null = null;

  const close = () => dispatch('cancel');

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch('save', { name: trimmed, icon });
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  };

  $: if (open) {
    name = initialName;
    icon = initialIcon;
    void tick().then(() => nameEl?.focus());
  }
</script>

{#if open}
  <div class="ti-backdrop" role="presentation" on:keydown|stopPropagation={handleKeyDown}>
    <button class="ti-dismiss" type="button" aria-label="Close dialog" on:click={close}></button>
    <div class="ti-shell" role="dialog" aria-modal="true" aria-label="Edit Tab Identity">
      <div class="ti-header">Edit Tab Identity</div>

      <div class="ti-row">
        <div class="ti-icon-preview" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            {#each (icons.find((d) => d.key === icon)?.paths ?? []) as d (d)}
              <path d={d} />
            {/each}
          </svg>
        </div>

        <input
          class="ti-name"
          bind:this={nameEl}
          type="text"
          placeholder="Tab name"
          bind:value={name}
          on:keydown={handleKeyDown}
        />
      </div>

      <div class="ti-grid-label">SELECT ICON</div>
      <div class="ti-grid" role="listbox" aria-label="Tab icon picker">
        {#each icons as iconDef (iconDef.key)}
          <button
            type="button"
            class={`ti-icon-cell ${iconDef.key === icon ? 'selected' : ''}`}
            aria-label={iconDef.label}
            title={iconDef.label}
            on:click={() => (icon = iconDef.key)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {#each iconDef.paths as d (d)}
                <path d={d} />
              {/each}
            </svg>
          </button>
        {/each}
      </div>

      <div class="ti-footer">
        <button class="ti-cancel" type="button" on:click={close}>Cancel</button>
        <button class="ti-save" type="button" on:click={save}>Save</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .ti-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
    display: grid;
    place-items: center;
    background: rgba(5, 8, 12, 0.62);
    backdrop-filter: blur(8px);
    padding: 22px;
  }

  .ti-dismiss {
    position: absolute;
    inset: 0;
    border: none;
    padding: 0;
    background: transparent;
    cursor: default;
  }

  .ti-shell {
    position: relative;
    z-index: 2;
    width: 420px;
    max-width: calc(100vw - 44px);
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: #09090b;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.55);
    padding: 24px;
    color: rgba(244, 244, 245, 0.98);
  }

  .ti-header {
    font-size: 0.82rem;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(161, 161, 170, 0.9);
    margin-bottom: 16px;
  }

  .ti-row {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .ti-icon-preview {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: rgba(37, 99, 235, 0.2);
    color: rgba(96, 165, 250, 0.95);
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  .ti-icon-preview svg {
    width: 22px;
    height: 22px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ti-name {
    flex: 1 1 auto;
    height: 48px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.4);
    padding: 0 16px;
    color: rgba(244, 244, 245, 0.98);
    outline: none;
    font-size: 0.9rem;
    transition: border-color 140ms ease;
  }

  .ti-name::placeholder {
    color: rgba(82, 82, 91, 0.9);
  }

  .ti-name:focus {
    border-color: rgba(59, 130, 246, 0.5);
  }

  .ti-grid-label {
    margin-top: 22px;
    margin-bottom: 10px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(82, 82, 91, 0.95);
  }

  .ti-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
  }

  .ti-icon-cell {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(161, 161, 170, 0.95);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease, transform 140ms ease, box-shadow 140ms ease;
  }

  .ti-icon-cell:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(244, 244, 245, 0.98);
    transform: translateY(-1px);
  }

  .ti-icon-cell.selected {
    background: rgba(37, 99, 235, 0.95);
    color: rgba(255, 255, 255, 0.98);
    box-shadow: 0 12px 26px rgba(30, 58, 138, 0.35);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .ti-icon-cell svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ti-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 28px;
  }

  .ti-cancel {
    border: none;
    background: transparent;
    color: rgba(161, 161, 170, 0.95);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    padding: 8px 10px;
    border-radius: 10px;
    transition: color 140ms ease, background 140ms ease;
  }

  .ti-cancel:hover {
    color: rgba(244, 244, 245, 0.98);
    background: rgba(255, 255, 255, 0.06);
  }

  .ti-save {
    border: 1px solid rgba(96, 165, 250, 0.6);
    background: rgba(37, 99, 235, 0.95);
    color: rgba(255, 255, 255, 0.98);
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    padding: 8px 16px;
    border-radius: 10px;
    box-shadow: 0 14px 30px rgba(30, 58, 138, 0.25);
    transition: background 140ms ease, transform 140ms ease;
  }

  .ti-save:hover {
    background: rgba(59, 130, 246, 0.95);
    transform: translateY(-1px);
  }

  @media (max-width: 520px) {
    .ti-grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
      justify-items: center;
    }
  }
</style>
