<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let label = 'Typography';
  export let summary = '';
  export let fontValue = '';
  export let fontInherited = true;
  export let fontDisplay = 'Global Default';
  export let fontOptions: Array<{ value: string; label: string }> = [];
  export let weightValue = 600;
  export let weightInherited = false;
  export let sizeValue = 14;
  export let sizeMin = 8;
  export let sizeMax = 48;
  export let colorValue = '#eef4ff';
  export let inherited: boolean | null = null;
  export let open = false;

  const dispatch = createEventDispatcher<{
    font: string;
    weight: number;
    size: number;
    color: string;
    colorReset: void;
  }>();

  let isOpen = open;
  $: inheritedState =
    inherited !== null ? inherited : fontInherited && weightInherited && summary.includes('[Global]');
  $: normalizedSize = Math.min(sizeMax, Math.max(sizeMin, Math.round(Number(sizeValue) || sizeMin)));
  $: weightPreset = (() => {
    const effectiveWeight = weightInherited ? 600 : Number(weightValue);
    if (effectiveWeight <= 450) return 'light';
    if (effectiveWeight >= 700) return 'bold';
    return 'regular';
  })();

  const toggleInherit = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!inheritedState) {
      dispatch('font', '');
      dispatch('weight', 0);
      dispatch('size', 0);
      dispatch('colorReset');
      return;
    }
    if (fontInherited) {
      const fallbackFont = fontOptions[0]?.value ?? '';
      if (fallbackFont) dispatch('font', fallbackFont);
    }
    if (weightInherited) dispatch('weight', 600);
    dispatch('size', normalizedSize);
    dispatch('color', colorValue);
  };
</script>

<div class="typography-module">
  <details class={`typography-control ${inheritedState ? 'is-inherited' : ''}`} bind:open={isOpen}>
    <summary>
      <div class="summary-left">
        <span class="module-label">{label}</span>
        <span class="summary-value">{summary}</span>
      </div>
      <div class="summary-right">
        <span class="inherit-label">Inherit Global</span>
        <button
          type="button"
          class={`inherit-toggle ${inheritedState ? 'on' : ''}`}
          role="switch"
          aria-checked={inheritedState}
          aria-label={`Toggle inherit global for ${label}`}
          on:click={toggleInherit}
        >
          <span class="inherit-knob"></span>
        </button>
        <span class="chevron" aria-hidden="true">▾</span>
      </div>
    </summary>

    <div class="typography-body">
      <div class="row visuals">
        <select
          class="font-select"
          value={fontValue}
          on:change={(e) => dispatch('font', (e.target as HTMLSelectElement).value)}
        >
          <option value="">{fontDisplay}</option>
          {#each fontOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        <label class="color-well" aria-label={`${label} color`}>
          <span class="swatch" style={`background:${colorValue};`}></span>
          <input
            type="color"
            value={colorValue}
            on:input={(e) => dispatch('color', (e.target as HTMLInputElement).value)}
          />
        </label>
      </div>

      <div class="row geometry">
        <div class="weight-control" role="group" aria-label={`${label} weight`}>
          <button
            type="button"
            class={weightPreset === 'light' ? 'active' : ''}
            on:click={() => dispatch('weight', 400)}
          >
            L
          </button>
          <button
            type="button"
            class={weightPreset === 'regular' ? 'active' : ''}
            on:click={() => dispatch('weight', 600)}
          >
            R
          </button>
          <button
            type="button"
            class={weightPreset === 'bold' ? 'active' : ''}
            on:click={() => dispatch('weight', 700)}
          >
            B
          </button>
        </div>
        <div class="size-control">
          <input
            class="size-number"
            type="number"
            min={sizeMin}
            max={sizeMax}
            value={normalizedSize}
            on:input={(e) => dispatch('size', Number((e.target as HTMLInputElement).value))}
          />
          <input
            class="size-slider"
            type="range"
            min={sizeMin}
            max={sizeMax}
            step="1"
            value={normalizedSize}
            on:input={(e) => dispatch('size', Number((e.target as HTMLInputElement).value))}
          />
        </div>
      </div>
    </div>
  </details>
</div>

<style>
  .typography-module {
    margin-bottom: 12px;
  }

  .typography-control {
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.05);
    overflow: hidden;
  }

  .typography-control > summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px;
  }

  .typography-control > summary::-webkit-details-marker {
    display: none;
  }

  .summary-left {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .module-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #71717a;
    font-weight: 700;
    line-height: 1.1;
  }

  .summary-value {
    font-size: 11px;
    color: #d4d4d8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .summary-right {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
  }

  .inherit-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #71717a;
    font-weight: 700;
  }

  .inherit-toggle {
    width: 40px;
    height: 24px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.6);
    position: relative;
    padding: 0;
    cursor: pointer;
    transition: all 500ms ease-out;
  }

  .inherit-toggle.on {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(96, 165, 250, 0.3);
    box-shadow:
      inset 0 0 12px rgba(59, 130, 246, 0.6),
      0 0 0 1px rgba(59, 130, 246, 0.5);
  }

  .inherit-knob {
    width: 16px;
    height: 16px;
    border-radius: 999px;
    position: absolute;
    top: 3px;
    left: 3px;
    background: linear-gradient(to bottom, #fff, #d4d4d8);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    transform: translateX(0);
    transition: all 500ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  .inherit-toggle.on .inherit-knob {
    transform: translateX(16px);
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.5),
      0 0 8px rgba(255, 255, 255, 0.5);
  }

  .chevron {
    color: rgba(161, 161, 170, 0.9);
    font-size: 11px;
    transform: rotate(-90deg);
    transition: transform 180ms ease;
  }

  .typography-control[open] .chevron {
    transform: rotate(0deg);
  }

  .typography-body {
    padding: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .typography-control.is-inherited .typography-body {
    opacity: 0.45;
    pointer-events: none;
  }

  .row {
    display: grid;
    gap: 8px;
  }

  .row.visuals {
    grid-template-columns: minmax(0, 1fr) auto;
    margin-bottom: 8px;
  }

  .row.geometry {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: center;
  }

  .font-select {
    height: 28px;
    padding: 0 24px 0 8px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(0, 0, 0, 0.4);
    color: #f5f5f5;
    font-size: 12px;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='9' height='6' viewBox='0 0 9 6'%3E%3Cpath fill='%239ca3af' d='M4.5 6L0 1.2 1.2 0l3.3 3.5L7.8 0 9 1.2z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
  }

  .font-select:focus {
    outline: none;
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(59, 130, 246, 0.5);
  }

  .color-well {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.4);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
    margin: 0;
    cursor: pointer;
  }

  .swatch {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.24);
  }

  .color-well input[type='color'] {
    position: absolute;
    inset: 0;
    opacity: 0;
    padding: 0;
    cursor: pointer;
  }

  .weight-control {
    display: flex;
    align-items: center;
    padding: 2px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.06);
    gap: 2px;
    height: 28px;
  }

  .weight-control button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: #71717a;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.08em;
    border-radius: 6px;
    height: 22px;
    padding: 0;
    cursor: pointer;
  }

  .weight-control button.active {
    background: #52525b;
    color: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  }

  .size-control {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    height: 28px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.06);
    padding: 0 6px;
  }

  .size-number {
    width: 100%;
    border: 0;
    background: transparent;
    color: #fff;
    font-size: 12px;
    height: 20px;
    padding: 0;
    text-align: right;
    box-shadow: none;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .size-number:focus {
    outline: none;
    box-shadow: none;
  }

  .size-number::-webkit-outer-spin-button,
  .size-number::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .size-slider {
    width: 100%;
    margin: 0;
    accent-color: rgba(96, 165, 250, 0.9);
  }

  @media (max-width: 860px) {
    .summary-right {
      gap: 6px;
    }

    .inherit-label {
      display: none;
    }

    .row.geometry {
      grid-template-columns: 1fr;
    }
  }
</style>
