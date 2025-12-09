<script lang="ts">
  import { onMount } from 'svelte';
  import { chatStore } from '../stores/chat';
  import fuzzysort from 'fuzzysort';

  export let onClose: () => void;

  let inputEl: HTMLInputElement;
  let query = "";
  let selectedIndex = 0;

  // 1. Prepare data for fuzzysort
  // We want to search against the ID and the Service Name
  // WEIGHTED SORT: Mentions > Unreads > Starred > Recency
  $: channels = [...$chatStore.availableChannels].sort((a, b) => {
      const uA = $chatStore.unread[a.id] || { count: 0, hasMention: false };
      const uB = $chatStore.unread[b.id] || { count: 0, hasMention: false };

      // 1. Mentions (Pink Alert)
      if (uA.hasMention !== uB.hasMention) return uA.hasMention ? -1 : 1;
      
      // 2. Unread Activity (Grey/White Noise)
      if ((uA.count > 0) !== (uB.count > 0)) return uA.count > 0 ? -1 : 1;
      
      // 3. Starred (Signal)
      if ((a.starred || false) !== (b.starred || false)) return a.starred ? -1 : 1;
      
      // 4. Recency (Active Conversations)
      // Fallback to 0 if undefined
      const timeA = a.lastPostAt || 0;
      const timeB = b.lastPostAt || 0;
      return timeB - timeA;
  });

  // 2. Perform Search
  $: results = query 
    ? fuzzysort.go(query, channels, { keys: ['name', 'service.name'] })
    : channels.map(c => ({ obj: c })); // If empty, show all

  // 3. Reset index on query change
  $: if (query || !query) selectedIndex = 0;

  onMount(() => {
    inputEl.focus();
  });

  function handleKeydown(e: KeyboardEvent) {
    e.stopPropagation(); 
    const count = results.length;
    
    switch(e.key) {
      case 'ArrowDown':
        if (e.key === 'j' && e.ctrlKey) return; 
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % count;
        break;

      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + count) % count;
        break;

      case 'Enter':
        e.preventDefault();
        selectChannel();
        break;

      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }

  function selectChannel() {
    // Fuzzysort results are wrapped in { obj: ... }
    const target = results[selectedIndex];
    if (target) {
      chatStore.switchChannel(target.obj);
      onClose();
    }
  }
</script>

<div class="backdrop" on:click={onClose}>
  <div class="modal" on:click|stopPropagation>
    <div class="input-wrapper">
        <span class="icon">🔍</span>
        <input 
            bind:this={inputEl}
            bind:value={query}
            on:keydown={handleKeydown}
            type="text" 
            placeholder="Go to channel..." 
        />
    </div>
    
    <div class="results">
        {#each results as res, i}
            <div 
                class="item" 
                class:selected={i === selectedIndex}
                on:click={() => { selectedIndex = i; selectChannel(); }}
            >
                <span class="service">[{res.obj.service.name}]</span> 
                <span class="hash">#</span> {res.obj.name}
            </div>
        {/each}
        
        {#if results.length === 0}
            <div class="empty">No matches</div>
        {/if}
    </div>
  </div>
</div>

<style>
  /* Use Kanagawa variables defined in App.svelte */
.backdrop {
    /* Define local variables based on global theme */
    --bg-primary: var(--sumi-ink-1);
    --bg-secondary: var(--sumi-ink-0);
    --border: var(--sumi-ink-3);
    --fg-primary: var(--fuji-white);
    --fg-dim: var(--katana-gray);
    --fg-accent: var(--ronin-yellow);
    --cursor-bg: var(--sumi-ink-2);

    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    display: flex; justify-content: center; align-items: start;
    padding-top: 100px;
    z-index: 1000;
  }

  .modal {
    width: 500px;
    max-height: 60vh;
    background: var(--bg-primary); 
    border: 1px solid var(--border);
    box-shadow: 0 10px 30px rgba(0,0,0,0.7);
    display: flex; flex-direction: column;
  }

  .input-wrapper {
      padding: 12px;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
      background: var(--bg-secondary);
  }

  input {
      background: transparent; border: none; outline: none;
      color: var(--fg-primary); flex-grow: 1; font-size: 1.1rem;
      font-family: inherit;
  }

  .results { overflow-y: auto; padding: 0; }

  .item {
      padding: 8px 15px;
      cursor: pointer;
      border-left: 2px solid transparent;
      display: flex; align-items: center;
  }

  .service {
      color: var(--fg-dim);
      font-size: 0.8em;
      margin-right: 8px;
      min-width: 80px; /* Align columns */
      text-align: right;
  }
  
  .hash { color: var(--fg-accent); margin-right: 4px; }

  .item.selected {
      background-color: var(--cursor-bg);
      color: var(--fg-primary);
  }
  
  .item.selected .service { color: var(--fg-primary); }

  .empty { padding: 20px; text-align: center; color: var(--fg-dim); }
</style>
