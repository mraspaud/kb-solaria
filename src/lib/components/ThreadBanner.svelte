<script lang="ts">
  import { chatStore } from '../stores/chat';
</script>

{#if $chatStore.activeChannel?.id?.startsWith('thread_')}
    <div class="thread-banner">
        <div class="thread-meta">
            <span class="icon">⤴</span>
            <span class="title">Thread {#if $chatStore.activeChannel.parentChannel}in #{$chatStore.activeChannel.parentChannel.name}{/if}</span>
            <span class="hint">[Backspace to return]</span>
        </div>

        {#if $chatStore.activeChannel.parentMessage}
            <div class="parent-context">
                <span class="parent-author">{$chatStore.activeChannel.parentMessage.author.name}:</span>
                <span class="parent-text">
                  {$chatStore.activeChannel.parentMessage.content.slice(0, 100)}
                  {$chatStore.activeChannel.parentMessage.content.length > 100 ? '...' : ''}
                </span>
            </div>
        {/if}
    </div>
{/if}

<style>
  /* Copied from App.svelte */
  .thread-banner { 
      background: var(--sumi-ink-2);
      border-bottom: 1px solid var(--sumi-ink-3); 
      padding: 8px 12px; 
      display: flex; 
      flex-direction: column; 
      gap: 6px; 
      z-index: 10;
  }
  .thread-meta { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: var(--ronin-yellow); }
  .thread-meta .hint { color: var(--katana-gray); font-style: italic; margin-left: auto; }
  
  .parent-context { 
      background: rgba(0, 0, 0, 0.2); 
      padding: 6px; 
      border-left: 2px solid var(--crystal-blue); 
      font-size: 0.85rem;
      display: flex; gap: 8px; 
      overflow: hidden; white-space: nowrap; text-overflow: ellipsis; 
  }
  .parent-author { font-weight: bold; color: var(--crystal-blue); }
  .parent-text { color: var(--fuji-white); opacity: 0.8; overflow: hidden; text-overflow: ellipsis; }
</style>
