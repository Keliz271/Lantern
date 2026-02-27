<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let open = false;
  export let title = 'Confirm Action';
  export let message = 'Are you sure?';
  export let confirmLabel = 'Delete';
  export let cancelLabel = 'Cancel';

  const dispatch = createEventDispatcher<{ confirm: void; cancel: void }>();

  let armed = false;
  let armTimer: ReturnType<typeof setTimeout> | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (armTimer) {
      clearTimeout(armTimer);
      armTimer = null;
    }
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  const armDelete = () => {
    armed = true;
    if (armTimer) clearTimeout(armTimer);
    armTimer = setTimeout(() => {
      armed = false;
      armTimer = null;
    }, 2600);
  };

  const handleCancel = () => {
    clearTimers();
    armed = false;
    dispatch('cancel');
  };

  const handleDeleteClick = () => {
    if (armed) {
      clearTimers();
      armed = false;
      dispatch('confirm');
      return;
    }
    armDelete();
  };

  const startHoldToDelete = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      clearTimers();
      armed = false;
      dispatch('confirm');
    }, 1500);
  };

  const cancelHoldToDelete = () => {
    if (!holdTimer) return;
    clearTimeout(holdTimer);
    holdTimer = null;
  };

  $: if (!open) {
    clearTimers();
    armed = false;
  }
</script>

{#if open}
  <div class="modal-backdrop" role="presentation">
    <button
      class="modal-dismiss-area"
      type="button"
      aria-label="Close dialog"
      on:click={handleCancel}
    ></button>
    <div
      class="modal-shell"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <h3>{title}</h3>
      <p>{message}</p>
      <div class="actions">
        <button class="cancel" type="button" on:click={handleCancel}>{cancelLabel}</button>
        <button
          class={`delete ${armed ? 'armed' : ''}`}
          type="button"
          on:click={handleDeleteClick}
          on:pointerdown={startHoldToDelete}
          on:pointerup={cancelHoldToDelete}
          on:pointerleave={cancelHoldToDelete}
          on:pointercancel={cancelHoldToDelete}
        >
          {armed ? 'Click Again or Hold' : confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
    display: grid;
    place-items: center;
    background: rgba(5, 8, 12, 0.62);
    backdrop-filter: blur(8px);
  }

  .modal-shell {
    position: relative;
    z-index: 2;
    width: min(92vw, 460px);
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.24);
    background: linear-gradient(180deg, rgba(20, 30, 44, 0.92), rgba(8, 12, 20, 0.94));
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
    padding: 18px;
    color: #eef4ff;
  }

  .modal-dismiss-area {
    position: absolute;
    inset: 0;
    border: none;
    padding: 0;
    background: transparent;
    cursor: default;
  }

  h3 {
    margin: 0 0 8px 0;
    font-size: 1rem;
  }

  p {
    margin: 0 0 14px 0;
    font-size: 0.86rem;
    color: rgba(220, 233, 252, 0.86);
    line-height: 1.45;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  button {
    font: inherit;
    border-radius: 10px;
    border: 1px solid transparent;
    padding: 8px 12px;
    cursor: pointer;
  }

  .cancel {
    background: rgba(30, 41, 58, 0.72);
    border-color: rgba(255, 255, 255, 0.2);
    color: #d7e5ff;
  }

  .delete {
    background: rgba(220, 38, 38, 0.9);
    border-color: rgba(248, 113, 113, 0.95);
    color: #fff4f4;
    min-width: 160px;
  }

  .delete.armed {
    box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.6), 0 0 20px rgba(239, 68, 68, 0.45);
  }
</style>
