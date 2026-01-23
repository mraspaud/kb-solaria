<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { chatStore } from '../stores/chat';
  import { attachments } from '../stores/input';
  import InputGhost from './InputGhost.svelte';

  export let isInsertMode = false;
  export let editingMessageId: string | null = null;

  let inputComponent: InputGhost;
  const dispatch = createEventDispatcher();

  // API exposed to Parent
  export function focus() {
      inputComponent?.focus();
  }

  export function setText(text: string) {
      inputComponent?.setText(text);
  }

  function handleFocus() {
      dispatch('focus');
  }

  function handleBlur() {
      dispatch('blur');
  }
</script>

<div class="status-line">
    <div class="section mode" class:insert={isInsertMode} class:edit={editingMessageId !== null}>
        {editingMessageId ? 'EDIT' : (isInsertMode ? 'INSERT' : 'NORMAL')}
    </div>
    
    <div class="section branch">
         {$chatStore.activeChannel.name.slice(0, 20)}
    </div>
    
    <div class="section spacer input-wrapper" 
         on:focusin={handleFocus} 
         on:focusout={handleBlur}>
        
        <span class="prompt">❯</span>

        <InputGhost 
            bind:this={inputComponent} 
            on:submit 
            on:cancel
            on:attach
        />

        {#if $attachments.length > 0}
            <div class="attachment-tray">
                {#each $attachments as file}
                    <span class="chip" class:uploading={file.status === 'uploading'}>
                        📎 {file.name}
                        {#if file.status === 'uploading'}
                            <span class="spinner">⟳</span>
                        {/if}
                    </span>
                {/each}
            </div>
        {/if}
    </div>
    
    <div class="section info">
         {$chatStore.cursorIndex + 1}:{$chatStore.messages.length} 
    </div>
    
    <div class="section logo-container">
        <span style="color: var(--ronin-yellow); font-size: 1.2em;">⬢</span>
    </div>
</div>

<style>
  /* Status Bar Styles from App.svelte */
  .status-line { min-height: 24px; display: flex; align-items: stretch; background: var(--sumi-ink-0); border-top: 1px solid var(--sumi-ink-3); font-size: 0.8rem; padding: 1px 0; min-width: 0; }
  .section { padding: 0 10px; display: flex; align-items: center; }
  .mode { background: var(--crystal-blue); color: var(--sumi-ink-0); font-weight: bold; }
  .mode.insert { background: var(--spring-green); }
  .mode.edit { background: var(--ronin-yellow); }
  .branch { background: var(--sumi-ink-2); color: var(--fuji-white); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
  .spacer { flex-grow: 1; display: flex; background: var(--sumi-ink-1); }
  .input-wrapper { display: flex; align-items: center; padding-top: 2px; }
  .prompt { color: var(--crystal-blue); font-weight: bold; margin-right: 8px; align-self: flex-start; margin-top: 1px; }
  .info { background: var(--sumi-ink-2); color: var(--fuji-white); }
  .logo-container { background: var(--sumi-ink-1); }
  .attachment-tray {
        display: flex; gap: 6px; margin-right: 8px;
    }

  .chip {
      font-size: 0.75rem; background: var(--sumi-ink-3);
      padding: 2px 6px; border-radius: 4px;
      color: var(--fuji-white); display: flex; align-items: center; gap: 4px;
  }
  .chip.uploading { opacity: 0.7; }
  .spinner { animation: spin 1s linear infinite; display: inline-block; }
  @keyframes spin { 100% { transform: rotate(360deg); } }
</style>
