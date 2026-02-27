<script lang="ts">
  import { widgetRegistry } from '$widgets/registry';
  import type { WidgetInstance } from '$widgets/types';

  export let widget: WidgetInstance;

  let registryEntry = widgetRegistry[widget.kind];
  $: registryEntry = widgetRegistry[widget.kind];
</script>

{#if registryEntry}
  {#key `${widget.id}:${widget.kind}:${widget.source}`}
    <svelte:component this={registryEntry.component} {widget} />
  {/key}
{:else}
  <p>Unknown widget type: {widget.kind}</p>
{/if}
