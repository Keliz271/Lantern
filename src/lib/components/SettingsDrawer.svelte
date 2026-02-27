<script lang="ts">
  export let className = '';
</script>

<div class={`settings-drawer ${className}`.trim()}>
  <slot />
</div>

<style>
  .settings-drawer {
    display: grid;
    gap: 10px;
  }
</style>
