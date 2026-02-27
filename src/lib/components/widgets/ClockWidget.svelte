<script lang="ts">
  import { onMount } from 'svelte';
  import type { WidgetInstance } from '$widgets/types';

  export let widget: WidgetInstance;
  let now = new Date();
  let time = '';
  let date = '';
  let weekday = '';
  let dateSize = 17;
  let dateColor = '#eef4ff';
  let dateFont = '';
  let yearSize = 13;
  let yearColor = '#9aa8ba';
  let yearFont = '';
  let timeSize = 26;
  let timeColor = '#eef4ff';
  let timeFont = '';

  const normalizeHexColor = (value: unknown, fallback: string) =>
    typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(value)
      ? value
      : fallback;

  const update = () => {
    now = new Date();
    time = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(now);
    date = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long' }).format(now);
    weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric' }).format(now);
  };

  onMount(() => {
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  });

  $: dateSize = Math.min(64, Math.max(10, Number(widget?.options?.clockDateSize ?? 17)));
  $: dateColor = normalizeHexColor(widget?.options?.clockDateColor, '#eef4ff');
  $: dateFont =
    typeof widget?.options?.clockDateFont === 'string'
      ? widget.options.clockDateFont.trim()
      : '';
  $: yearSize = Math.min(48, Math.max(9, Number(widget?.options?.clockYearSize ?? 13)));
  $: yearColor = normalizeHexColor(widget?.options?.clockYearColor, '#9aa8ba');
  $: yearFont =
    typeof widget?.options?.clockYearFont === 'string'
      ? widget.options.clockYearFont.trim()
      : '';
  $: timeSize = Math.min(84, Math.max(12, Number(widget?.options?.clockTimeSize ?? 26)));
  $: timeColor = normalizeHexColor(widget?.options?.clockTimeColor, '#eef4ff');
  $: timeFont =
    typeof widget?.options?.clockTimeFont === 'string'
      ? widget.options.clockTimeFont.trim()
      : '';
</script>

<div
  class="clock"
  style={`--clock-date-size:${dateSize}px;--clock-date-color:${dateColor};--clock-year-size:${yearSize}px;--clock-year-color:${yearColor};--clock-time-size:${timeSize}px;--clock-time-color:${timeColor};${dateFont ? `--clock-date-font:${dateFont};` : ''}${yearFont ? `--clock-year-font:${yearFont};` : ''}${timeFont ? `--clock-time-font:${timeFont};` : ''}`}
>
  <div>
    <div class="clock-date">{date}</div>
    <div class="clock-year">{weekday}</div>
  </div>
  <div class="clock-time">{time}</div>
</div>

<style>
  .clock {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    height: 100%;
    padding: 2px 0;
    min-width: 0;
    overflow: hidden;
  }

  .clock > div:first-child {
    min-width: 0;
  }

  .clock-date {
    font-size: var(--clock-date-size, 1.1rem);
    color: var(--clock-date-color, var(--text));
    font-family: var(--clock-date-font, var(--font-heading));
    font-weight: 600;
  }

  .clock-year {
    color: var(--clock-year-color, var(--muted));
    font-size: var(--clock-year-size, 0.85rem);
    font-family: var(--clock-year-font, var(--font-body));
  }

  .clock-time {
    font-size: var(--clock-time-size, 1.6rem);
    color: var(--clock-time-color, var(--text));
    font-family: var(--clock-time-font, var(--font-heading));
    font-weight: 600;
  }
</style>
