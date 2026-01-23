<script lang="ts">
  import { tick, onMount, onDestroy } from 'svelte';
  import { chatStore } from '../stores/chat';
  import { sendReaction } from '../socketStore';
  import { ViewportLogic } from '../logic/ViewportLogic';
  import { getUserColor } from '../logic/theme';
  import Markdown from './Markdown.svelte';

  // unreadMarkerIndex is now read from the store

  let container: HTMLElement;
  let resizeObserver: ResizeObserver;
  const SCROLL_OFF = 150;

  let lastSeenMessageId: string | null = null
  let previousCursorId: string | null = null; // NEW: Track logical cursor position

  // --- PUBLIC API ---

  export async function scrollToCursor() {
      await tick();
      const activeEl = document.getElementById(`msg-${$chatStore.cursorIndex}`);
      
      if (activeEl && container) {
          const target = ViewportLogic.getScrollToCursor(
              container.getBoundingClientRect(),
              activeEl.getBoundingClientRect(),
              container.scrollTop,
              SCROLL_OFF
          );

          if (target !== null) {
              container.scrollTo({ top: target, behavior: 'smooth' });
          }
      }
  }

  export async function scrollToBottom(options: { instant?: boolean } = {}) {
      await tick();
      if (container) {
          container.scrollTo({ 
                          top: container.scrollHeight, 
                          behavior: options.instant ? 'auto' : 'smooth' });
      }
  }

  // --- INTERNAL REACTIVITY ---

  // Handle Incoming Messages (Conveyor Belt)
  async function handleIncoming() {
      await tick();
      if (!container) return;

      if ($chatStore.isAttached) {
          scrollToBottom();
          return;
      }

      const cursorEl = document.getElementById(`msg-${$chatStore.cursorIndex}`);
      if (!cursorEl) return;

      if (ViewportLogic.shouldConveyorScroll(container.getBoundingClientRect(), cursorEl.getBoundingClientRect())) {
           scrollToBottom();
      }
  }


  // This catches the moment App.svelte decides "All read, go to bottom" (isAttached: false -> true).
  $: if ($chatStore.isAttached && container) {
      // Use instant behavior to avoid visual jumping
      container.scrollTo({ top: container.scrollHeight, behavior: 'instant' });
      
      // Safety Double-Tap: Sometimes the browser needs a frame to acknowledge the layout shift
      requestAnimationFrame(() => {
          if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'instant' });
      });
  }


  // --- LIFECYCLE & OBSERVERS ---
  
  onMount(() => {
      resizeObserver = new ResizeObserver(() => {
          // If the store says we should be at the bottom, ENFORCE IT.
          if ($chatStore.isAttached && container) {
              // Use instant scroll to prevent jitter during load
              container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
          }
      });
      
      if (container) resizeObserver.observe(container);
  });

  onDestroy(() => {
      resizeObserver?.disconnect();
  });

  // Watch for message updates
  $: if ($chatStore.messages) {
      const msgs = $chatStore.messages;
      const lastMsg = msgs[msgs.length - 1];
      const currentId = lastMsg ? lastMsg.id : null;

      // 1. Conveyor Belt Logic (New messages at bottom)
      if (currentId !== lastSeenMessageId) {
          lastSeenMessageId = currentId;
          handleIncoming();
      }

      // 2. History Injection Logic (Messages added at top)
      // Check if the cursor points to the SAME message ID, but the List changed/grew
      if ($chatStore.cursorIndex !== -1) {
          const currentCursorId = msgs[$chatStore.cursorIndex]?.id;
          
          // If we are DETACHED (viewing history) and the cursor ID matches the previous one...
          // ...but the store updated (implying indices likely shifted), force a scroll adjustment.
          if (!$chatStore.isAttached && currentCursorId && currentCursorId === previousCursorId) {
              // Wait for DOM update, then re-snap to cursor
              tick().then(() => scrollToCursor());
          }
          
          previousCursorId = currentCursorId;
      }
  }
</script>

<div class="message-list" bind:this={container} class:is-thread={$chatStore.activeChannel.id.startsWith('thread_')}>
    {#each $chatStore.messages as msg, index}
       {@const isUnread = $chatStore.unreadMarkerIndex !== -1 && index > $chatStore.unreadMarkerIndex}
       {@const prevMsg = $chatStore.messages[index - 1]}
       {@const isNewDay = !prevMsg || prevMsg.timestamp.getDate() !== msg.timestamp.getDate()}
       
       {@const currentSource = msg.sourceChannel?.id || 'current'}
       {@const prevSource = prevMsg?.sourceChannel?.id || 'current'}
       {@const isNewContext = ($chatStore.activeChannel.service.id === 'aggregation') && (currentSource !== prevSource)}

       {#if isNewDay || isNewContext}
            <div class="context-separator">
                <div class="line"></div>
                <div class="label">
                    {#if isNewContext && msg.sourceChannel}
                       <span class="context-tag">
                            [{msg.sourceChannel.service.name}] {#if msg.sourceChannel.isThread && msg.sourceChannel.parentChannel}#{msg.sourceChannel.parentChannel.name}/thread{:else}#{msg.sourceChannel.name}{/if}
                        </span>
                    {/if}
                    
                    {#if isNewDay}
                        <span class="date-tag">
                            {msg.timestamp.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                    {/if}
                </div>
            </div>
       {/if}
       <div 
        id="msg-{index}"
        class="message-line" 
        class:active={index === $chatStore.cursorIndex} 
        class:unread={isUnread}
      >
         <div class="line-content">
           <span class="meta">
                <span class="time">{msg.timestamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                <span class="author" style="color: {getUserColor(msg.author.id)}">{msg.author.name}</span>
            </span>
            
            <span class="text">
                <Markdown content={msg.content} />
                {#if msg.attachments && msg.attachments.length > 0}
                    <div class="attachment-grid">
                        {#each msg.attachments as file}
                            <div class="file-chip" title={file.path}>
                                <span class="icon">📎</span>
                                <span class="filename">{file.name}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </span>

            <div class="indicators">
                {#if msg.reactions}
                    {#each Object.entries(msg.reactions) as [emoji, users]}
                         {@const iReacted = $chatStore.currentUser && users.includes($chatStore.currentUser.id)}
                         <button 
                            class="reaction-tag" 
                            class:active={iReacted}
                            on:click|stopPropagation={() => sendReaction(msg.id, emoji, iReacted ? 'remove' : 'add')}
                         >
                            {emoji} <span class="count">{users.length}</span>
                         </button>
                    {/each}
                {/if}

                {#if msg.replyCount}
                    <span class="reply-tag">{msg.replyCount} ↪</span>
                {/if}
            </div>
        </div>
      </div>
    {/each}
</div>

<style>
  /* Message List Styles from App.svelte */
  .message-list { flex-grow: 1; overflow-y: auto; overflow-x: hidden; min-width: 0; padding-top: 50px; display: flex; flex-direction: column; -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 50px, black 100%); mask-image: linear-gradient(to bottom, transparent 0%, black 50px, black 100%); }
  .message-list.is-thread { background-color: #1a1a22; padding-top: 10px; -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 20px, black 100%); mask-image: linear-gradient(to bottom, transparent 0%, black 20px, black 100%); }
  .message-line { display: flex; padding: 1px 10px; border-left: 2px solid transparent; opacity: 0.7; transition: all 0.1s ease; }
  .message-line.active { background: var(--sumi-ink-2); border-left-color: var(--crystal-blue); opacity: 1; }
  .message-line.unread { border-left-color: var(--samurai-red); background: #25252f; }
  .line-content { display: flex; gap: 12px; align-items: baseline; width: 100%; }
  .meta { width: 140px; flex-shrink: 0; text-align: right; font-size: 0.8rem; color: var(--katana-gray); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; }
  .author { font-weight: bold; }
  .text { flex-grow: 1; word-break: break-word; min-width: 0; line-height: 1.3; }
  .indicators { margin-left: auto; display: flex; align-items: center; gap: 5px; flex-shrink: 0; transform: translateY(1px); }
  .reply-tag { display: inline-flex; align-items: center; font-size: 0.75rem; color: var(--ronin-yellow); background: rgba(255, 158, 59, 0.05); padding: 0 6px; border-radius: 2px; font-family: var(--font-main); line-height: 1; height: 1.2em; }
  .message-line.active .reply-tag { background: var(--ronin-yellow); color: var(--sumi-ink-0); }
  .reaction-tag { background: var(--sumi-ink-3); border: 1px solid transparent; color: var(--fuji-white); border-radius: 4px; padding: 0 4px; margin-right: 4px; font-size: 0.75rem; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; transition: all 0.1s; }
  .reaction-tag:hover { border-color: var(--ronin-yellow); }
  .reaction-tag.active { background: rgba(152, 187, 108, 0.2); border-color: var(--spring-green); color: var(--spring-green); }
  .count { font-size: 0.7em; opacity: 0.8; }
  .attachment-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
  .file-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--sumi-ink-3); border: 1px solid var(--sumi-ink-3); padding: 2px 8px; border-radius: 4px; font-size: 0.8rem; color: var(--fuji-white); cursor: pointer; transition: all 0.2s ease; }
  .file-chip:hover { border-color: var(--crystal-blue); background: var(--sumi-ink-2); }
  .file-chip .icon { color: var(--ronin-yellow); font-size: 0.9em; }
  .file-chip .filename { max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .context-separator { display: flex; align-items: center; gap: 10px; padding: 16px 20px 8px 0; opacity: 0.6; margin-top: 8px; }
  .context-separator .line { flex-grow: 1; height: 1px; background: var(--sumi-ink-3); }
  .context-separator .label { font-size: 0.75rem; color: var(--katana-gray); display: flex; gap: 12px; white-space: nowrap; }
  .context-tag { color: var(--ronin-yellow); font-weight: bold; letter-spacing: 0.5px; }
  .date-tag { font-family: var(--font-main); color: var(--fuji-white); }
</style>
