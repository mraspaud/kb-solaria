<!-- TODO:
- make scrolling smooth
- make u and d move half page/viewport, not number of lines
- mark unread message as read when we move the cursor over them
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
  import { status, connect, sendMessage } from './lib/socketStore';
  import { chatStore } from './lib/stores/chat';
  import ChannelSwitcher from './lib/components/ChannelSwitcher.svelte';
  import Markdown from './lib/components/Markdown.svelte';

  // --- STATE ---
  let inputElement: HTMLInputElement;
  let messageListContainer: HTMLElement;
  let isInsertMode = false;
  let lastMessageCount = 0;
  let isWindowFocused = true;
  let unreadMarkerIndex = -1;
  
  // Modal State
  let showChannelSwitcher = false;
  let lastKeyTime = 0;
  const LEADER_TIMEOUT = 400;

  // --- LIFECYCLE ---
  onMount(() => {
    connect();
  });

  // --- LOGIC: COLOR HASHING ---
  // Generates a consistent color from a string (Username)
  function stringToColor(str: string) {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
          hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      // We map the hash to one of the Kanagawa palette colors
      const colors = [
          '#7E9CD8', '#98BB6C', '#938AA9', '#FF9E3B', '#E82424', '#6A9589', '#C8C093'
      ];
      const index = Math.abs(hash % colors.length);
      return colors[index];
  }

  // --- CONTROLLER ---
  function handleSend() {
    if (inputElement.value.trim()) {
      sendMessage(inputElement.value);
      inputElement.value = ''; 
      unreadMarkerIndex = -1;
      inputElement.blur();
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (showChannelSwitcher) return;

    if (isInsertMode) {
      if (e.key === 'Escape') inputElement.blur();
      return; 
    }

    // Leader Key (<Space><Space>)
    if (e.key === ' ') {
        const now = Date.now();
        if (now - lastKeyTime < LEADER_TIMEOUT) {
            e.preventDefault();
            showChannelSwitcher = true;
            lastKeyTime = 0;
            return;
        }
        lastKeyTime = now;
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
      case 'PageDown':
        e.preventDefault();
        chatStore.moveCursor(10);
        scrollToCursor();
        break;
      case 'u':
      case 'PageUp':
        e.preventDefault();
        chatStore.moveCursor(-10);
        scrollToCursor();
        break;
      case 'G':
        if (e.shiftKey) {
            chatStore.jumpToBottom();
            scrollToBottom();
        }
        break;
      case 'i':
        e.preventDefault();
        inputElement.focus();
        break;
    }
  }

  function onFocus() { isInsertMode = true; }
  function onBlur() { isInsertMode = false; }
  function onWindowFocus() { isWindowFocused = true; }
  function onWindowBlur() {
     isWindowFocused = false;
     if ($chatStore.isAttached) {
        chatStore.detach();
     }
  }

  const SCROLL_OFF = 150;
  async function scrollToCursor() {
      await tick();
      const activeEl = document.getElementById(`msg-${$chatStore.cursorIndex}`);
      // if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (activeEl && messageListContainer) {
        const containerRect = messageListContainer.getBoundingClientRect();
        const elRect = activeEl.getBoundingClientRect();

        const distTop = elRect.top - containerRect.top;
        const distBottom = containerRect.bottom - elRect.bottom;

        if (distTop < SCROLL_OFF) {
          const delta = distTop - SCROLL_OFF;
          messageListContainer.scrollTop += delta;
        } else if (distBottom < SCROLL_OFF) {
          const delta = SCROLL_OFF - distBottom;
          messageListContainer.scrollTop += delta;
        }
      }
      checkReadStatus();
  }

  async function scrollToBottom() {
      await tick();
      if (messageListContainer) messageListContainer.scrollTop = messageListContainer.scrollHeight;
      checkReadStatus();
  }

  function checkReadStatus() {
      if ($chatStore.isAttached && isWindowFocused) unreadMarkerIndex = -1;
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
// --- READ STATUS LOGIC (The Ratchet) ---
  $: {
      const currentCursor = $chatStore.cursorIndex;
      
      // Only run if we actually have an active unread marker
      if (unreadMarkerIndex !== -1) {
          
          // 1. The High Water Mark Check
          // If the cursor moves BELOW the current marker, push the marker down.
          if (currentCursor > unreadMarkerIndex) {
              unreadMarkerIndex = currentCursor;
          }

          // 2. Cleanup Check
          // If the marker hits the very last message, clear it entirely.
          // (User has read everything)
          if (unreadMarkerIndex >= $chatStore.messages.length - 1) {
              unreadMarkerIndex = -1;
          }
      }
  }
</script>

<svelte:window 
    on:keydown={handleGlobalKeydown} 
    on:focus={onWindowFocus}
    on:blur={onWindowBlur}
/>

<main class="cockpit">
  
  <aside class="sidebar">
      <div class="dot hot"></div>
      <div class="dot warm"></div>
      <div class="dot cold"></div>
      <div class="dot cold"></div>
  </aside>

  <div class="buffer-container">
      
      <div class="message-list" bind:this={messageListContainer}>
        {#each $chatStore.messages as msg, index}
          {@const isUnread = unreadMarkerIndex !== -1 && index > unreadMarkerIndex}

          <div 
            id="msg-{index}"
            class="message-line" 
            class:active={index === $chatStore.cursorIndex} 
            class:unread={isUnread}
          >
            <div class="line-content">
                <span class="meta">
                    <span class="time">{msg.timestamp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    <span class="author" style="color: {stringToColor(msg.author)}">{msg.author}</span>
                </span>
                <span class="text">
                    <Markdown content={msg.content} />
                </span>
            </div>
          </div>
        {/each}
      </div>

      <div class="status-line">
          <div class="section mode" class:insert={isInsertMode}>
              {isInsertMode ? 'INSERT' : 'NORMAL'}
          </div>
          <div class="section branch">
               {$chatStore.activeChannelId}
          </div>
          <div class="section spacer">
              <span class="prompt">❯</span>
              <input 
                  bind:this={inputElement}
                  type="text" 
                  on:focus={onFocus}
                  on:blur={onBlur}
                  on:keydown={(e) => e.key === 'Enter' && handleSend()}
                  autocomplete="off"
              />
          </div>
          <div class="section info">
               {$chatStore.cursorIndex + 1}:{$chatStore.messages.length} 
          </div>
          <div class="section encoding">
              utf-8
          </div>
      </div>
  </div>
</main>

{#if showChannelSwitcher}
    <ChannelSwitcher onClose={() => showChannelSwitcher = false} />
{/if}

<style>
  :root {
    /* KANAGAWA PALETTE */
    --sumi-ink-0: #16161D; --sumi-ink-1: #1F1F28; --sumi-ink-2: #2A2A37;
    --sumi-ink-3: #363646; --fuji-white: #DCD7BA; --katana-gray: #727169;
    --crystal-blue: #7E9CD8; --spring-green: #98BB6C; --ronin-yellow: #FF9E3B;
    --samurai-red: #E82424; --wave-blue: #2D4F67; --winter-green: #2B3328;
    
    --font-main: "CodeNewRoman Nerd Font", 'JetBrains Mono', 'Fira Code', monospace; 

  }

  /* RESET & LAYOUT */
  .cockpit {
      display: flex; height: 100vh; width: 100vw;
      background: var(--sumi-ink-1); color: var(--fuji-white);
      font-family: var(--font-main); overflow: hidden;
  }

  /* SIDEBAR (Heatmap) */
  .sidebar {
      width: 12px;
      background: var(--sumi-ink-0);
      border-right: 1px solid var(--sumi-ink-2);
      display: flex; flex-direction: column; align-items: center;
      padding-top: 10px; gap: 8px;
  }
  .dot { width: 4px; height: 4px; border-radius: 50%; }
  .dot.hot { background: var(--samurai-red); box-shadow: 0 0 4px var(--samurai-red); }
  .dot.warm { background: var(--ronin-yellow); }
  .dot.cold { background: var(--sumi-ink-3); }

  /* MAIN AREA */
  .buffer-container {
      flex-grow: 1; display: flex; flex-direction: column; position: relative;
  }

  /* MESSAGES */
  .message-list {
      flex-grow: 1; overflow-y: auto; padding-top: 50px; /* Space for fade */
      display: flex; flex-direction: column;
      
      /* The Fade Mask */
      -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 50px, black 100%);
      mask-image: linear-gradient(to bottom, transparent 0%, black 50px, black 100%);
  }

  .message-line {
      display: flex; padding: 2px 10px;
      border-left: 2px solid transparent; /* The Gutter Marker */
      opacity: 0.7; /* Default: Semantically dim */
      transition: all 0.1s ease;
  }

  .message-line.active {
      background: var(--sumi-ink-2);
      border-left-color: var(--crystal-blue);
      opacity: 1; /* Focus: Bright */
  }

  .message-line.unread {
      border-left-color: var(--samurai-red);
      background: #25252f; /* Very subtle tint */
  }

  .line-content { display: flex; gap: 12px; align-items: baseline; width: 100%; }
  
  .meta { 
      min-width: 140px; text-align: right; 
      font-size: 0.8rem; color: var(--katana-gray);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .time { margin-right: 8px; font-variant-numeric: tabular-nums; opacity: 0.5; }
  .author { font-weight: bold; }

  .text { 
      white-space: pre-wrap; word-break: break-word; flex-grow: 1;
      line-height: 1.5;
  }

  /* STATUS BAR (Lualine style) */
  .status-line {
      height: 24px; display: flex; align-items: center;
      background: var(--sumi-ink-0); border-top: 1px solid var(--sumi-ink-3);
      font-size: 0.8rem;
  }

  .section { padding: 0 10px; height: 100%; display: flex; align-items: center; }
  
  .mode { background: var(--crystal-blue); color: var(--sumi-ink-0); font-weight: bold; }
  .mode.insert { background: var(--spring-green); }
  
  .branch { background: var(--sumi-ink-2); color: var(--fuji-white); }
  
  .spacer { flex-grow: 1; display: flex; gap: 8px; background: var(--sumi-ink-1); }
  
  .info, .encoding { background: var(--sumi-ink-2); color: var(--fuji-white); }

  /* INPUT (Hidden inside status bar) */
  input {
      background: transparent; border: none; outline: none;
      color: var(--fuji-white); font-family: inherit; font-size: 0.9rem;
      width: 100%;
  }
  .prompt { color: var(--crystal-blue); font-weight: bold; }
</style>
