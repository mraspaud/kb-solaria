<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store'; // Need 'get' for one-off check
  import { sendReaction } from '../socketStore';
  import { chatStore } from '../stores/chat'; // Import Store

  export let messageId: string;
  export let onClose: () => void;

  const common = ["👍", "👎", "🔥", "🚀", "👀", "✅", "❌", "🎉"];
  
  let selectedIndex = 0;
  let container: HTMLElement;

  function select(emoji: string) {
      const state = get(chatStore);
      const msg = state.messages.find(m => m.id === messageId);
      const me = state.currentUser;

      // Default to 'add'
      let action: 'add' | 'remove' = 'add';

      // CHECK: Did I already react with this emoji?
      if (msg && me && msg.reactions) {
          const users = msg.reactions[emoji] || [];
          if (users.includes(me.id)) {
              action = 'remove'; // Toggle OFF
          }
      }

      sendReaction(messageId, emoji, action);
      onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
      e.stopPropagation();
      e.preventDefault();

      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') select(common[selectedIndex]);
      
      // Horizontal Navigation
      if (e.key === 'ArrowRight' || e.key === 'l') selectedIndex = (selectedIndex + 1) % common.length;
      if (e.key === 'ArrowLeft' || e.key === 'h') selectedIndex = (selectedIndex - 1 + common.length) % common.length;
      
      // Number Hotkeys (1-8)
      const num = parseInt(e.key);
      if (num >= 1 && num <= common.length) select(common[num - 1]);
  }

  onMount(() => container?.focus());
</script>

<div class="backdrop" on:click={onClose}>
    <div class="picker" bind:this={container} tabindex="0" on:keydown={handleKeydown} on:click|stopPropagation>
        <div class="title">React (Toggle)...</div>
        <div class="grid">
            {#each common as emoji, i}
                {@const state = $chatStore}
                {@const msg = state.messages.find(m => m.id === messageId)}
                {@const isActive = msg?.reactions?.[emoji]?.includes(state.currentUser?.id || '')}

                <div 
                    class="item" 
                    class:selected={i === selectedIndex}
                    class:active={isActive} 
                    on:click={() => select(emoji)}
                >
                    <span class="emoji">{emoji}</span>
                    <span class="hotkey">{i + 1}</span>
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
    .backdrop {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.1); /* Subtle dim */
        display: flex; justify-content: center; align-items: center;
        z-index: 2000;
    }
    .picker {
        background: var(--sumi-ink-1);
        border: 1px solid var(--ronin-yellow);
        padding: 10px;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        outline: none;
    }
    .title { font-size: 0.8rem; color: var(--katana-gray); margin-bottom: 8px; text-align: center;}
    .grid { display: flex; gap: 8px; }
    .item { 
        display: flex; flex-direction: column; align-items: center; 
        padding: 6px; border-radius: 3px; cursor: pointer;
        border: 1px solid transparent;
    }
    .item.selected { background: var(--sumi-ink-2); border-color: var(--crystal-blue); }
    .emoji { font-size: 1.5rem; }
    .hotkey { font-size: 0.6rem; color: var(--katana-gray); margin-top: 2px; }
    .backdrop {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.1);
        display: flex; justify-content: center; align-items: center;
        z-index: 2000;
    }
    .picker {
        background: var(--sumi-ink-1);
        border: 1px solid var(--ronin-yellow);
        padding: 10px;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        outline: none;
    }
    .title { font-size: 0.8rem; color: var(--katana-gray); margin-bottom: 8px; text-align: center;}
    .grid { display: flex; gap: 8px; }
    
    .item { 
        display: flex; flex-direction: column; align-items: center; 
        padding: 6px; border-radius: 3px; cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.1s;
    }
    
    /* Selection Cursor */
    .item.selected { background: var(--sumi-ink-2); border-color: var(--crystal-blue); transform: scale(1.1); }
    
    /* Active State (Already reacted) */
    .item.active {
        background: rgba(152, 187, 108, 0.15); /* Spring Green tint */
        border-color: var(--spring-green);
    }
    /* If selected AND active, merge styles */
    .item.selected.active {
        background: rgba(152, 187, 108, 0.3);
        border-color: var(--ronin-yellow);
    }

    .emoji { font-size: 1.5rem; }
    .hotkey { font-size: 0.6rem; color: var(--katana-gray); margin-top: 2px; }
</style>
