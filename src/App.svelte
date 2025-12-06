<!-- TODO:
- make u and d move half page/viewport, not number of lines
- make style transition between unread and read smooth/crossfade
- make text scroll in detached+unfocussed mode when new messages arrive until cursor reaches the buffer zone
- (fuzzy) search messages
- @-mention (fuzzy) autocompletion when in insert mode
- mentions in received messages, should be display them in a special way?
- when a mention comes for me, do I get notified somehow?
- show/access channel header. How do we handle links in channel headers?
-->
<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { status, connect, sendMessage, sendUpdate, sendDelete } from './lib/socketStore';
  import { chatStore } from './lib/stores/chat';
  import { sendReaction } from './lib/socketStore';
  import { inspectorStore } from './lib/stores/inspector';
  import { inputEngine } from './lib/stores/input';
  import { getUserColor } from './lib/logic/theme';
  import { sendMarkRead } from './lib/socketStore';

  import ChannelSwitcher from './lib/components/ChannelSwitcher.svelte';
  import Markdown from './lib/components/Markdown.svelte';
  import ReactionPicker from './lib/components/ReactionPicker.svelte';
  import Inspector from './lib/components/Inspector.svelte';
  import InputGhost from './lib/components/InputGhost.svelte';

  // --- STATE ---
  let inputComponent: InputGhost;
  let messageListContainer: HTMLElement;
  let isInsertMode = false;
  let lastMessageCount = 0;
  let isWindowFocused = true;
  let unreadMarkerIndex = -1;
  
  // Edit Mode State
  let editingMessageId: string | null = null;

  // Modal & Key State
  let showChannelSwitcher = false;
  let lastKeyTime = 0;
  let lastKey = '';
  const LEADER_TIMEOUT = 400;
  let showReactionPicker = false;

  onMount(() => {
    connect();
  });


  // --- CONTROLLER ---
  function handleSend() {
    const text = inputElement.value.trim();
    if (!text) return;

    if (editingMessageId) {
        sendUpdate(editingMessageId, text);
        editingMessageId = null;
    } else {
        sendMessage(text);
        unreadMarkerIndex = -1;
    }
    
    inputElement.value = ''; 
    autoResize(); // Reset height
    inputElement.blur();
  }

  function autoResize() {
      if (!inputElement) return;
      inputElement.style.height = 'auto';
      inputElement.style.height = inputElement.scrollHeight + 'px';
  }

  function handleInputKeydown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
          if (!e.shiftKey) {
              e.stopPropagation();
              e.preventDefault();
              handleSend();
          }
          // Shift+Enter = New Line (default)
      }
      
      if (e.key === 'Escape') {
          e.stopPropagation();
          if (editingMessageId) {
              editingMessageId = null;
              inputElement.value = '';
              autoResize();
          }
          inputElement.blur();
      }
      
      // Recalculate height on next tick
      setTimeout(autoResize, 0); 
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (showChannelSwitcher) return;
    if (isInsertMode) return; // Input handles its own keys
    const isReadOnly = $chatStore.activeChannel.id === 'system';
    const now = Date.now();

    // LEADER KEY (Space Space)
    if (e.key === ' ') {
        if (now - lastKeyTime < LEADER_TIMEOUT && lastKey === ' ') {
            e.preventDefault();
            showChannelSwitcher = true;
            lastKeyTime = 0;
            return;
        }
        lastKeyTime = now;
        lastKey = ' ';
    }

    // OPERATORS (cc, dd)
    if (now - lastKeyTime < LEADER_TIMEOUT) {
        if (e.key === 'c' && lastKey === 'c') {
            if (isReadOnly) return;
            e.preventDefault(); startEdit(); lastKey = ''; return;
        }
        if (e.key === 'd' && lastKey === 'd') {
            if (isReadOnly) return;
            e.preventDefault(); deleteMessage(); lastKey = ''; return;
        }
        if (e.key === 'e' && lastKey === ' ') {
            e.preventDefault(); 
            inspectorStore.toggleLab();
        }
        if (e.key === 'r' && lastKey === ' ') {
             e.preventDefault();
             showReactionPicker = true;
             lastKeyTime = 0;
             return;
        }
    }
    
    if (e.key !== ' ') {
        lastKeyTime = now;
        lastKey = e.key;
    }

    switch(e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault();
        chatStore.moveCursor(1);
        scrollToCursor();
        break;
      case 'k':
      case 'ArrowUp':
        e.preventDefault();
        chatStore.moveCursor(-1);
        scrollToCursor();
        break;
      case 'd': 
        if (e.ctrlKey) {
             e.preventDefault(); chatStore.moveCursor(10); scrollToCursor();
        }
        break;
      case 'u': 
        if (e.ctrlKey) {
             e.preventDefault(); chatStore.moveCursor(-10); scrollToCursor();
        }
        break;
      case 'G':
        if (e.shiftKey) {
            chatStore.jumpToBottom();
            scrollToBottom();
        }
        break;
      case 'i':
        if (isReadOnly) return;
        e.preventDefault();
        inputComponent.focus();
        break;
      case 'Enter':
        e.preventDefault();
        // Prevent recursive threading
        if ($chatStore.activeChannel.id.startsWith('thread_')) return;
        
        const msg = $chatStore.messages[$chatStore.cursorIndex];
        if (msg) chatStore.openThread(msg);
        break;
      case 'Backspace':
        chatStore.goBack();
        break;
    }
  }

  function startEdit() {
      const msg = $chatStore.messages[$chatStore.cursorIndex];
      // Simple auth check (expand later)
      if (msg && chatStore.isMyMessage(msg)) {
          editingMessageId = msg.id;
          inputEngine.update(msg.content, msg.content.length); 
          inputComponent.focus();
      }
  }

  function deleteMessage() {
      const msg = $chatStore.messages[$chatStore.cursorIndex];
      if (msg && chatStore.isMyMessage(msg)) {
          sendDelete(msg.id);
      }
  }

  function onFocus() { isInsertMode = true; }
  function onBlur() { isInsertMode = false; }
  function onWindowFocus() { isWindowFocused = true; }
  function onWindowBlur() {
     isWindowFocused = false;
     if ($chatStore.isAttached) chatStore.detach();
  }

  const SCROLL_OFF = 150;
  async function scrollToCursor() {
      await tick();
      const activeEl = document.getElementById(`msg-${$chatStore.cursorIndex}`);
      
      if (activeEl && messageListContainer) {
          const containerRect = messageListContainer.getBoundingClientRect();
          const elRect = activeEl.getBoundingClientRect();

          const distTop = elRect.top - containerRect.top;
          const distBottom = containerRect.bottom - elRect.bottom;

          let targetScroll = messageListContainer.scrollTop;
          let needsScroll = false;

          if (distTop < SCROLL_OFF) {
              targetScroll -= (SCROLL_OFF - distTop);
              needsScroll = true;
          } 
          else if (distBottom < SCROLL_OFF) {
              targetScroll += (SCROLL_OFF - distBottom);
              needsScroll = true;
          }

          if (needsScroll) {
              messageListContainer.scrollTo({
                  top: targetScroll,
                  behavior: 'smooth'
              });
          }
      }
      checkReadStatus();
  }

  async function scrollToBottom() {
      await tick();
      if (messageListContainer) {
          messageListContainer.scrollTo({ 
              top: messageListContainer.scrollHeight, 
              behavior: 'smooth' 
          });
      }
      checkReadStatus();
  }

  let markReadTimer: number | undefined;

  function checkReadStatus() {
      if ($chatStore.isAttached && isWindowFocused) {
          unreadMarkerIndex = -1;
      }     
      if ($chatStore.isAttached && isWindowFocused) {
          clearTimeout(markReadTimer);
          
          markReadTimer = setTimeout(() => {
              const channel = $chatStore.activeChannel;
              const msgs = $chatStore.messages;
              
              if (msgs.length > 0) {
                  const lastMsg = msgs[msgs.length - 1];
                  
                  // Only send if it's a real service
                  if (channel.service.id !== 'internal') {
                      const realId = channel.id.startsWith('thread_') ? channel.parentChannel?.id : channel.id;
                      
                      if (realId) {
                          sendMarkRead(realId, lastMsg.id, channel.service.id);
                      }
                  }
              }
          }, 1000); // Wait 1 second before telling the backend
      }
  }

  $: if ($chatStore.messages) {
      const count = $chatStore.messages.length;
      if (count > lastMessageCount) {
          const isAway = !$chatStore.isAttached || !isWindowFocused;
          if (isAway && unreadMarkerIndex === -1) unreadMarkerIndex = lastMessageCount - 1;
          lastMessageCount = count;
          if ($chatStore.isAttached) scrollToBottom();
      }
      checkReadStatus();
  }
  
  // High Water Mark Logic
  $: {
      const currentCursor = $chatStore.cursorIndex;
      if (unreadMarkerIndex !== -1) {
          if (currentCursor > unreadMarkerIndex) unreadMarkerIndex = currentCursor;
          if (unreadMarkerIndex >= $chatStore.messages.length - 1) unreadMarkerIndex = -1;
      }
  }
</script>

<svelte:window on:keydown={handleGlobalKeydown} on:focus={onWindowFocus} on:blur={onWindowBlur} />

<main class="cockpit">
  <aside class="sidebar">
      <!-- Placeholder Heatmap -->
      <div class="dot hot"></div><div class="dot warm"></div><div class="dot cold"></div>
  </aside>

  <div class="buffer-container">
      
      <!-- THREAD HEADER -->
      {#if $chatStore.activeChannel?.id?.startsWith('thread_')}
          <div class="thread-banner">
              <div class="thread-meta">
                  <span class="icon">⤴</span> 
                  <span class="title">Thread</span>
                  <span class="hint">[Backspace to return]</span>
              </div>

              {#if $chatStore.activeChannel.parentMessage}
                  <div class="parent-context">
                      <span class="parent-author">{$chatStore.activeChannel.parentMessage.author}:</span>
                      <span class="parent-text">
                        {$chatStore.activeChannel.parentMessage.content.slice(0, 100)}
                        {$chatStore.activeChannel.parentMessage.content.length > 100 ? '...' : ''}
                      </span>
                  </div>
              {/if}
          </div>
      {/if}

      <div class="message-list" bind:this={messageListContainer} class:is-thread={$chatStore.activeChannel.id.startsWith('thread_')}>
        {#each $chatStore.messages as msg, index}
          {@const isUnread = unreadMarkerIndex !== -1 && index > unreadMarkerIndex}
          <div 
            id="msg-{index}"
            class="message-line" 
            class:active={index === $chatStore.cursorIndex} 
            class:unread={isUnread}
          >
            <div class="line-content">
                <!-- COL 1: META -->
                <span class="meta">
                    <span class="time">{msg.timestamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    <span class="author" style="color: {getUserColor(msg.author.id)}">
                        {msg.author.name}
                    </span>
                </span>
                
                <!-- COL 2: TEXT -->
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

                <!-- COL 3: INDICATORS (Right Aligned) -->
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
                        <span class="reply-tag">
                            {msg.replyCount} ↪
                        </span>
                    {/if}
                </div>
            </div>
          </div>
        {/each}
      </div>

      <div class="status-line">
          <div class="section mode" class:insert={isInsertMode} class:edit={editingMessageId !== null}>
              {editingMessageId ? 'EDIT' : (isInsertMode ? 'INSERT' : 'NORMAL')}
          </div>
          <div class="section branch">
               {$chatStore.activeChannel.name.slice(0, 20)}
          </div>
          <div class="section spacer input-wrapper" 
               on:focusin={onFocus} 
               on:focusout={onBlur}>

              <span class="prompt">❯</span>

              <InputGhost bind:this={inputComponent} />
              
          </div>
          <div class="section info">
               {$chatStore.cursorIndex + 1}:{$chatStore.messages.length} 
          </div>
          <div class="section logo-container">
              <span style="color: var(--ronin-yellow); font-size: 1.2em;">⬢</span>
          </div>
      </div>
  </div>
  <Inspector />
</main>

{#if showChannelSwitcher}
    <ChannelSwitcher onClose={() => showChannelSwitcher = false} />
{/if}
{#if showReactionPicker}
    <ReactionPicker 
        messageId={$chatStore.messages[$chatStore.cursorIndex]?.id} 
        onClose={() => showReactionPicker = false} 
    />
{/if}

<style>
  :root {
    --sumi-ink-0: #16161D; --sumi-ink-1: #1F1F28; --sumi-ink-2: #2A2A37;
    --sumi-ink-3: #363646; --fuji-white: #DCD7BA; --katana-gray: #727169;
    --crystal-blue: #7E9CD8; --spring-green: #98BB6C; --ronin-yellow: #FF9E3B;
    --samurai-red: #E82424; --wave-blue: #2D4F67; 
    --font-main: "CodeNewRoman Nerd Font", 'JetBrains Mono', monospace; 
  }

  .cockpit { display: flex; height: 100vh; width: 100vw; background: var(--sumi-ink-1); color: var(--fuji-white); font-family: var(--font-main); overflow: hidden; }
  
  .sidebar { width: 12px; background: var(--sumi-ink-0); border-right: 1px solid var(--sumi-ink-2); display: flex; flex-direction: column; align-items: center; padding-top: 10px; gap: 8px; }
  .dot { width: 4px; height: 4px; border-radius: 50%; }
  .dot.hot { background: var(--samurai-red); box-shadow: 0 0 4px var(--samurai-red); }
  .dot.warm { background: var(--ronin-yellow); }
  .dot.cold { background: var(--sumi-ink-3); }

  .buffer-container {
          flex-grow: 1; 
          min-width: 0;
          display: flex; 
          flex-direction: column; 
          position: relative;
  }

  /* THREAD BANNER */
  .thread-banner { background: var(--sumi-ink-2); border-bottom: 1px solid var(--sumi-ink-3); padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; z-index: 10; }
  .thread-meta { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: var(--ronin-yellow); }
  .thread-meta .hint { color: var(--katana-gray); font-style: italic; margin-left: auto; }
  
  .parent-context { background: rgba(0, 0, 0, 0.2); padding: 6px; border-left: 2px solid var(--crystal-blue); font-size: 0.85rem; display: flex; gap: 8px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .parent-author { font-weight: bold; color: var(--crystal-blue); }
  .parent-text { color: var(--fuji-white); opacity: 0.8; overflow: hidden; text-overflow: ellipsis; }

  /* MESSAGE LIST */
  .message-list { flex-grow: 1; overflow-y: auto; padding-top: 50px; display: flex; flex-direction: column; -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 50px, black 100%); mask-image: linear-gradient(to bottom, transparent 0%, black 50px, black 100%); }
  .message-list.is-thread { background-color: #1a1a22; padding-top: 10px; -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 20px, black 100%); mask-image: linear-gradient(to bottom, transparent 0%, black 20px, black 100%); }

  .message-line { display: flex; padding: 1px 10px; border-left: 2px solid transparent; opacity: 0.7; transition: all 0.1s ease; }
  .message-line.active { background: var(--sumi-ink-2); border-left-color: var(--crystal-blue); opacity: 1; }
  .message-line.unread { border-left-color: var(--samurai-red); background: #25252f; }

  .line-content { display: flex; gap: 12px; align-items: baseline; width: 100%; }
  
  .meta { min-width: 140px; text-align: right; font-size: 0.8rem; color: var(--katana-gray); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; }
  .author { font-weight: bold; }
  
  .text { flex-grow: 1; word-break: break-word; min-width: 0; line-height: 1.3; }

  /* INDICATORS (Right Column) */
  .indicators { margin-left: auto; display: flex; align-items: center; gap: 5px; flex-shrink: 0; transform: translateY(1px); }
  .reply-tag { display: inline-flex; align-items: center; font-size: 0.75rem; color: var(--ronin-yellow); background: rgba(255, 158, 59, 0.05); padding: 0 6px; border-radius: 2px; font-family: var(--font-main); line-height: 1; height: 1.2em; }
  .message-line.active .reply-tag { background: var(--ronin-yellow); color: var(--sumi-ink-0); }

  /* STATUS BAR */
  .status-line { min-height: 24px; display: flex; align-items: stretch; background: var(--sumi-ink-0); border-top: 1px solid var(--sumi-ink-3); font-size: 0.8rem; padding: 1px 0; }
  .section { padding: 0 10px; display: flex; align-items: center; }
  .mode { background: var(--crystal-blue); color: var(--sumi-ink-0); font-weight: bold; }
  .mode.insert { background: var(--spring-green); }
  .mode.edit { background: var(--ronin-yellow); }
  .branch { background: var(--sumi-ink-2); color: var(--fuji-white); }
  .spacer { flex-grow: 1; display: flex; background: var(--sumi-ink-1); }
  .input-wrapper { display: flex; align-items: center; padding-top: 2px; }
  .prompt { color: var(--crystal-blue); font-weight: bold; margin-right: 8px; align-self: flex-start; margin-top: 1px; }
  .info { background: var(--sumi-ink-2); color: var(--fuji-white); }
  .logo-container { background: var(--sumi-ink-1); }
  .reaction-tag {
      background: var(--sumi-ink-3);
      border: 1px solid transparent;
      color: var(--fuji-white);
      border-radius: 4px;
      padding: 0 4px;
      margin-right: 4px;
      font-size: 0.75rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      transition: all 0.1s;
  }
  .reaction-tag:hover { border-color: var(--ronin-yellow); }
  .reaction-tag.active {
      background: rgba(152, 187, 108, 0.2); /* Spring Green tint */
      border-color: var(--spring-green);
      color: var(--spring-green);
  }
  .count { font-size: 0.7em; opacity: 0.8; }
  .attachment-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 4px;
  }
  
  .file-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--sumi-ink-3);
      border: 1px solid var(--sumi-ink-3);
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
      color: var(--fuji-white);
      cursor: pointer;
      transition: all 0.2s ease;
  }

  .file-chip:hover {
      border-color: var(--crystal-blue);
      background: var(--sumi-ink-2);
  }

  .file-chip .icon {
      color: var(--ronin-yellow);
      font-size: 0.9em;
  }

  .file-chip .filename {
      /* Truncate long filenames nicely */
      max-width: 200px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
  }
</style>
