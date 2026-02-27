<script lang="ts">
  const dayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  let current = new Date();

  const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
  const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

  const addMonths = (date: Date, delta: number) => {
    const next = new Date(date);
    next.setMonth(next.getMonth() + delta);
    return next;
  };

  const monthLabel = (date: Date) =>
    new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);

  const buildGrid = (date: Date) => {
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    const startDay = start.getDay();
    const totalDays = end.getDate();
    const cells: Array<{ day: number; muted: boolean }> = [];

    for (let i = 0; i < startDay; i += 1) {
      const prev = new Date(start);
      prev.setDate(prev.getDate() - (startDay - i));
      cells.push({ day: prev.getDate(), muted: true });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      cells.push({ day, muted: false });
    }

    while (cells.length % 7 !== 0) {
      const nextDay = cells.length - totalDays - startDay + 1;
      cells.push({ day: nextDay, muted: true });
    }

    return cells;
  };

  $: monthStart = startOfMonth(current);
  $: days = buildGrid(current);
  $: label = monthLabel(current);
  $: today = new Date();
</script>

<div class="calendar">
  <div class="calendar-header">
    <div class="calendar-title">{label}</div>
    <div class="calendar-controls">
      <button on:click={() => (current = addMonths(current, -1))}>‹</button>
      <div class="calendar-month">{String(current.getMonth() + 1).padStart(2, '0')}</div>
      <button on:click={() => (current = addMonths(current, 1))}>›</button>
    </div>
  </div>

  <div class="calendar-grid">
    {#each dayLabels as day}
      <div class="calendar-label">{day}</div>
    {/each}

    {#each days as item}
      <div
        class={`calendar-cell ${item.muted ? 'muted' : ''} ${
          !item.muted &&
          item.day === today.getDate() &&
          current.getMonth() === today.getMonth() &&
          current.getFullYear() === today.getFullYear()
            ? 'today'
            : ''
        }`}
      >
        {item.day}
      </div>
    {/each}
  </div>
</div>

<style>
  .calendar {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .calendar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .calendar-title {
    font-size: 1.1rem;
    font-weight: 600;
  }

  .calendar-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .calendar-controls button {
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 1.1rem;
    cursor: pointer;
  }

  .calendar-month {
    padding: 4px 10px;
    border-radius: 10px;
    border: 1px solid var(--card-border);
    font-size: 0.8rem;
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }

  .calendar-label {
    text-align: center;
    font-size: 0.7rem;
    color: var(--muted);
  }

  .calendar-cell {
    text-align: center;
    padding: 6px 0;
    border-radius: 10px;
    font-size: 0.85rem;
    color: var(--text);
  }

  .calendar-cell.muted {
    color: rgba(154, 168, 186, 0.55);
  }

  .calendar-cell.today {
    background: rgba(106, 168, 255, 0.2);
    border: 1px solid rgba(106, 168, 255, 0.45);
  }
</style>
