<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import { chatStore } from '../stores/chat';
  import { allEmojis, type Emoji } from '../stores/emoji';
  import { sendReaction } from '../socketStore';
  import fuzzysort from 'fuzzysort';

  export let messageId: string;
  export let onClose: () => void;

  let searchInput: HTMLInputElement;
  let query = "";
  let selectedIndex = 0;
  let container: HTMLElement;

  // 1. ANALYZE CURRENT REACTIONS
  // We build a map to know the state of each emoji on THIS message.
  // Map Key: The Emoji ID (for custom) or Char (for standard)
  // Map Value: 'mine' | 'others' | 'none'
  $: message = $chatStore.messages.find(m => m.id === messageId);
  $: me = $chatStore.currentUser;
  
  $: reactionState = new Map<string, 'mine' | 'others' | 'none'>();

  $: if (message && me) {
      reactionState.clear();
      if (message.reactions) {
          Object.entries(message.reactions).forEach(([key, users]) => {
              // Key might be "🔥" or "custom_id"
              if (users.includes(me.id)) {
                  reactionState.set(key, 'mine');
              } else if (users.length > 0) {
                  reactionState.set(key, 'others');
              }
          });
      }
  }

  // 2. GENERATE DISPLAY LIST
  // If Query: Fuzzy Search
  // If No Query: Tiered Sort (Mine -> Others -> Popular -> Rest)
  $: displayList = getDisplayList(query, $allEmojis, reactionState);

  function getDisplayList(q: string, all: Emoji[], state: Map<string, string>) {
      // HELPER: Get status for a specific emoji object
      const getStatus = (e: Emoji) => {
          // Check Char (Standard) or ID (Custom)
          if (e.isCustom) return state.get(e.id) || 'none';
          return state.get(e.char!) || 'none';
      };

      if (q) {
          // SEARCH MODE
          // We search everything, but still favor 'mine' in the fuzzy score if we wanted (optional)
          // For now, simple search is usually expected behavior.
          return fuzzysort.go(q, all, { 
              keys: ['id', 'keywords'],
              limit: 50,
              threshold: -10000 
          }).map(res => res.obj);
      } 
      else {
          // DEFAULT VIEW: TIERED SORT
          // We copy the array to sort it without mutating the store
          const sorted = [...all].sort((a, b) => {
              const statA = getStatus(a);
              const statB = getStatus(b);

              const score = (s: string) => {
                  if (s === 'mine') return 0;   // Priority 1
                  if (s === 'others') return 1; // Priority 2
                  return 2;                     // Priority 3 (Rest)
              };

              const scoreA = score(statA);
              const scoreB = score(statB);

              if (scoreA !== scoreB) return scoreA - scoreB;

              // Tie-breaker: Use the store's native order (Custom -> Popular -> Standard)
              return a.sortOrder - b.sortOrder;
          });

          // Optimization: Only show top 100 in default view to prevent DOM lag
          return sorted.slice(0, 100);
      }
  }

  // 3. ACTION HANDLER
  function select(emoji: Emoji) {
      const key = emoji.isCustom ? emoji.id : emoji.char!;
      
      // Toggle Logic
      let action: 'add' | 'remove' = 'add';
      
      // Check current state in our map
      // (We can assume the map is up to date via reactivity)
      const currentStatus = reactionState.get(key);
      if (currentStatus === 'mine') {
          action = 'remove';
      }

      sendReaction(messageId, key, action);
      onClose();
  }

  // 4. KEYBOARD NAVIGATION
  function handleKeydown(e: KeyboardEvent) {
      e.stopPropagation();

      const rowSize = 8; // Approx items per row
      const len = displayList.length;

      switch(e.key) {
          case 'ArrowRight':
              e.preventDefault();
              selectedIndex = (selectedIndex + 1) % len;
              scrollToItem();
              break;
          case 'ArrowLeft':
              e.preventDefault();
              selectedIndex = (selectedIndex - 1 + len) % len;
              scrollToItem();
              break;
          case 'ArrowDown':
              e.preventDefault();
              selectedIndex = (selectedIndex + rowSize) % len;
              scrollToItem();
              break;
          case 'ArrowUp':
              e.preventDefault();
              selectedIndex = (selectedIndex - rowSize + len) % len;
              scrollToItem();
              break;
          case 'Enter':
              e.preventDefault();
              if (displayList[selectedIndex]) select(displayList[selectedIndex]);
              break;
          case 'Escape':
              e.preventDefault();
              onClose();
              break;
      }
  }

  async function scrollToItem() {
     await tick();
     const el = document.getElementById(`reaction-${selectedIndex}`);
     el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  onMount(() => {
      searchInput.focus();
  });
</script>

<div class="backdrop" on:click={onClose}>
    <div 
        class="picker-window" 
        on:click|stopPropagation 
        on:keydown={handleKeydown}
    >
        <div class="header">
            <span class="icon">🤔</span>
            <input 
                bind:this={searchInput}
                bind:value={query}
                type="text" 
                placeholder="Search reactions..." 
                class="search-input"
            />
        </div>

        <div class="grid" bind:this={container}>
            {#each displayList as emoji, i}
                {@const key = emoji.isCustom ? emoji.id : emoji.char}
                {@const status = reactionState.get(key)}
                
                <button 
                    id="reaction-{i}"
                    class="item" 
                    class:selected={i === selectedIndex}
                    class:mine={status === 'mine'}
                    class:others={status === 'others'}
                    on:click={() => select(emoji)}
                    title=":{emoji.id}:"
                >
                    {#if emoji.isCustom}
                        <img src={emoji.url} class="custom-icon" alt={emoji.id}/>
                    {:else}
                        <span class="char">{emoji.char}</span>
                    {/if}
                </button>
            {/each}
            
            {#if displayList.length === 0}
                <div class="empty">No matches</div>
            {/if}
        </div>
        
        <div class="footer">
            <span class="hint">↵ to toggle</span>
            <span class="hint">Esc to close</span>
        </div>
    </div>
</div>

<style>
    .backdrop {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.4);
        display: flex; justify-content: center; align-items: center;
        z-index: 2000;
    }

    .picker-window {
        background: var(--sumi-ink-1);
        border: 1px solid var(--sumi-ink-3);
        border-radius: 6px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        width: 340px;
        max-height: 400px;
        display: flex; flex-direction: column;
        overflow: hidden;
    }

    .header {
        padding: 8px;
        border-bottom: 1px solid var(--sumi-ink-2);
        display: flex; align-items: center; gap: 8px;
        background: var(--sumi-ink-0);
    }

    .search-input {
        background: transparent;
        border: none;
        color: var(--fuji-white);
        font-family: var(--font-main);
        font-size: 0.9rem;
        flex: 1;
        outline: none;
    }

    .grid {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
        gap: 4px;
        align-content: start;
    }

    .item {
        aspect-ratio: 1;
        display: flex; align-items: center; justify-content: center;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.1s;
        font-size: 1.4rem;
        padding: 0;
    }

    .custom-icon {
        width: 24px; height: 24px; object-fit: contain;
    }

    /* STATES */
    .item:hover {
        background: var(--sumi-ink-2);
    }

    .item.selected {
        background: var(--sumi-ink-2);
        border-color: var(--ronin-yellow);
        transform: scale(1.1);
        z-index: 2;
    }

    /* "Mine" - Already reacted by me */
    .item.mine {
        background: rgba(152, 187, 108, 0.2); /* Spring Green Tint */
        border-color: var(--spring-green);
    }
    .item.selected.mine {
        background: rgba(152, 187, 108, 0.4);
    }

    /* "Others" - Reacted by others */
    .item.others {
        background: rgba(126, 156, 216, 0.15); /* Crystal Blue Tint */
        border-color: rgba(126, 156, 216, 0.5);
    }

    .empty {
        grid-column: 1 / -1;
        text-align: center;
        padding: 20px;
        color: var(--katana-gray);
        font-size: 0.8rem;
    }

    .footer {
        padding: 4px 8px;
        background: var(--sumi-ink-0);
        border-top: 1px solid var(--sumi-ink-2);
        display: flex; justify-content: space-between;
    }
    .hint {
        font-size: 0.7rem; color: var(--katana-gray);
    }
</style>
