<script>
  import ForumSectionTree from './ForumSectionTree.svelte';

  export let sections = [];
  export let selectedSectionId = '';
  export let canModerate = false;
  export let buttonClasses = () => '';
  export let onSelect = () => {};
  export let onModerate = async () => {};
</script>

<div class="space-y-2">
  {#each sections as section}
    <div class={`rounded-xl border p-3 ${selectedSectionId === section.id ? 'border-white bg-slate-900' : 'border-slate-800 bg-slate-900/60'}`}>
      <button class="w-full text-left" on:click={() => onSelect(section.id)}>
        <p class="font-medium">{section.name}</p>
        <p class="mt-1 text-xs text-slate-500">{section.description}</p>
      </button>
      {#if canModerate}
        <div class="mt-3 flex flex-wrap gap-2">
          <button class={buttonClasses()} on:click={() => onModerate('sections', section.id, 'pinned', !section.pinned)}>pin</button>
          <button class={buttonClasses()} on:click={() => onModerate('sections', section.id, 'locked', !section.locked)}>lock</button>
        </div>
      {/if}
      {#if section.children?.length}
        <div class="mt-3 border-l border-slate-800 pl-4">
          <ForumSectionTree
            sections={section.children}
            {selectedSectionId}
            {canModerate}
            {buttonClasses}
            {onSelect}
            {onModerate}
          />
        </div>
      {/if}
    </div>
  {/each}
</div>
