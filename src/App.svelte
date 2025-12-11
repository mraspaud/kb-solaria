<script lang="ts">
  import { onMount, tick } from 'svelte';
  
  // Logic & Stores
  import { 
    status, connect, sendMessage, sendUpdate, sendDelete, 
    fetchThread, sendOpenPath, sendSaveToDownloads, sendMarkRead 
  } from './lib/socketStore';
  import { chatStore } from './lib/stores/chat';
  import { inspectorStore } from './lib/stores/inspector';
  import { InputController } from './lib/logic/InputController';
  import { DEFAULT_KEYMAP, type Command } from './lib/logic/keymap';

  // Components
  import Sidebar from './lib/components/Sidebar.svelte';
  import ThreadBanner from './lib/components/ThreadBanner.svelte';
  import MessageList from './lib/components/MessageList.svelte';
  import StatusLine from './lib/components/StatusLine.svelte';
  
  // Modals
  import ChannelSwitcher from './lib/components/ChannelSwitcher.svelte';
  import ReactionPicker from './lib/components/ReactionPicker.svelte';
  import Inspector from './lib/components/Inspector.svelte';

  // --- COMPONENT REFERENCES ---
  let messageListComponent: MessageList;
  let statusLineComponent: StatusLine;

  // --- STATE ---
  let isInsertMode = false;
  let isWindowFocused = true;
  let unreadMarkerIndex = -1;
  let editingMessageId: string | null = null;

  // Modal State
  let showChannelSwitcher = false;
  let showReactionPicker = false;
  
  // Channel Switching & Read State
  let justSwitchedChannel = false;
  let isTargetedJump = false;
  let currentChannelId = "";
  let positionTimer: number | undefined;
  let markReadTimer: number | undefined;
  let lastAckedMsgId: string | null = null;
  let maxReadIndex = -1;

  // --- CONTROLLER SETUP ---
  const controller = new InputController(DEFAULT_KEYMAP, handleCommand);

  onMount(() => {
    connect();
  });

  // --- COMMAND DISPATCHER ---
  function handleCommand(cmd: Command) {
      const currentId = $chatStore.activeChannel.id;
      const isReadOnly = currentId === 'system' || currentId === 'triage' || currentId === 'inbox';
      const msg = $chatStore.messages[$chatStore.cursorIndex];

      switch (cmd) {
          // Navigation
          case 'CURSOR_DOWN':
          case 'SELECT_NEXT':
              chatStore.moveCursor(1);
              messageListComponent.scrollToCursor();
              break;
          case 'CURSOR_UP':
          case 'SELECT_PREV':
              chatStore.moveCursor(-1);
              messageListComponent.scrollToCursor();
              break;
          case 'CURSOR_PAGE_DOWN':
              chatStore.moveCursor(10);
              messageListComponent.scrollToCursor();
              break;
          case 'CURSOR_PAGE_UP':
              chatStore.moveCursor(-10);
              messageListComponent.scrollToCursor();
              break;
          case 'JUMP_BOTTOM':
              // 1. Reset the "Ack" memory. 
              // This forces the next check to actually send the packet to the server.
              lastAckedMsgId = null; 
              
              chatStore.jumpToBottom();
              
              // 2. Force immediate check (don't wait for the reactive loop)
              checkReadStatus(true); 
              
              // 3. Sync view
              tick().then(() => messageListComponent.scrollToBottom({ instant: true }));
              break;
          case 'CENTER_VIEW':
              // We could add a specific method to MessageList for this, 
              // but scrollToCursor handles standard visibility well enough for now.
              messageListComponent.scrollToCursor(); 
              break;

          // Modes
          case 'ENTER_INSERT':
              if (isReadOnly) return;
              statusLineComponent.focus(); 
              break;
          case 'QUICK_SWITCH':
              showChannelSwitcher = true;
              break;
          case 'TOGGLE_INSPECTOR':
              inspectorStore.toggleLab();
              break;
          case 'TOGGLE_REACTION':
              showReactionPicker = true;
              break;

          // Interaction
          case 'ACTIVATE_SELECTION': 
              handleActivateSelection(msg);
              break;
          case 'GO_BACK':
              chatStore.goBack();
              break;
          case 'CANCEL':
              handleCancel();
              break;

          // Message Ops
          case 'START_EDIT':
              if (isReadOnly) return;
              startEdit(msg);
              break;
          case 'DELETE_MESSAGE':
              if (isReadOnly) return;
              deleteMessage(msg);
              break;
          case 'YANK_MESSAGE':
              if (msg?.content) {
                  navigator.clipboard.writeText(msg.content);
                  console.log("Copied to clipboard");
              }
              break;
          case 'OPEN_LINK':
              if (msg) {
                   const urlRegex = /(https?:\/\/[^\s<>)]+)/g;
                   const matches = msg.content.match(urlRegex);
                   if (matches) {
                       matches.forEach(url => sendOpenPath(url));
                   }
              }
              break;
          
          // Files
          case 'OPEN_FILE':
              if (msg?.attachments) {
                  msg.attachments.forEach(file => sendOpenPath(file.path));
              }
              break;
          case 'DOWNLOAD_FILE':
              if (msg?.attachments) {
                  msg.attachments.forEach(file => sendSaveToDownloads(file.path));
              }
              break;
      }
  }

  // --- ACTIONS ---

  function handleKeydown(e: KeyboardEvent) {
    if (showChannelSwitcher) return;
    if (isInsertMode) return; 
    controller.handleKey(e);
  }

  function handleActivateSelection(msg: any) {
      if (!msg || $chatStore.activeChannel.id.startsWith('thread_')) return;

      // Triage Jump
      if ($chatStore.activeChannel.service.id === 'aggregation' && msg.sourceChannel) {
          isTargetedJump = true;
          const realId = msg.sourceChannel.id;
          const serviceId = msg.sourceChannel.service.id;
          
          sendMarkRead(realId, msg.id, serviceId);
          chatStore.markReadUpTo(msg.sourceChannel, msg);

          chatStore.switchChannel(msg.sourceChannel, msg.id);
          tick().then(() => messageListComponent.scrollToCursor());
          return;
      }
      
      // Thread Open
      chatStore.openThread(msg);
      tick().then(() => {
          const newChannel = $chatStore.activeChannel;
          if (newChannel.isThread && newChannel.service.id !== 'internal') {
              const parentId = newChannel.parentChannel?.id;
              if (parentId) {
                   fetchThread(newChannel.parentChannel!, msg.id, newChannel.service);
              }
          }
      });
  }

  function handleSend(text: string) {
    if (!text) return;
    if (editingMessageId) {
        sendUpdate(editingMessageId, text);
        editingMessageId = null;
    } else {
        sendMessage(text);
        unreadMarkerIndex = -1;
    }
  }

  function handleCancel() {
      if (editingMessageId) {
          editingMessageId = null;
          statusLineComponent.setText('');
      }
      // Future: Close inspector or other UI states
  }

  function startEdit(msg: any) {
      if (msg && chatStore.isMyMessage(msg)) {
          editingMessageId = msg.id;
          statusLineComponent.setText(msg.content);
          statusLineComponent.focus();
      }
  }

  function deleteMessage(msg: any) {
      if (msg && chatStore.isMyMessage(msg)) {
          sendDelete(msg.id);
      }
  }

  // --- FOCUS MANAGEMENT ---
  function onFocus() { isInsertMode = true; }
  function onBlur() { isInsertMode = false; }
  function onWindowFocus() { isWindowFocused = true; }
  function onWindowBlur() {
     isWindowFocused = false;
     if ($chatStore.isAttached) chatStore.detach();
  }

  // --- READ STATUS LOGIC ---
  // This remains the "business logic" owner
  function checkReadStatus(immediate = false) {
      if (!isWindowFocused || justSwitchedChannel) return;
      const msgs = $chatStore.messages;
      const idx = $chatStore.cursorIndex;
      
      if (idx < 0 || msgs.length === 0) return;
      
      const isAtBottom = $chatStore.isAttached || idx >= msgs.length - 1;
      if (isAtBottom) { unreadMarkerIndex = -1; }

      if (isAtBottom || immediate) {
          clearTimeout(markReadTimer);
          const doMarkRead = () => {
              if ((!immediate && justSwitchedChannel) || !$chatStore.activeChannel) return;
              const channel = $chatStore.activeChannel;
              const targetMsg = msgs[idx];
              
              if (!targetMsg || lastAckedMsgId === targetMsg.id) return;
              
              if (channel.service.id !== 'internal') {
                  const realId = channel.id.startsWith('thread_') ? channel.parentChannel?.id : channel.id;
                  if (realId) {
                      sendMarkRead(realId, targetMsg.id, channel.service.id);
                      const targetChannel = (channel.id.startsWith('thread_') && channel.parentChannel) 
                                            ? channel.parentChannel 
                                            : channel;

                      chatStore.markReadUpTo(targetChannel, targetMsg);
                      lastAckedMsgId = targetMsg.id;
                  }
              }
          };
          
          if (immediate) doMarkRead();
          else markReadTimer = setTimeout(doMarkRead, 1000);
      }
  }

  // --- REACTIVE ORCHESTRATION ---
  
  // 1. Channel Switching Reset
  $: if ($chatStore.activeChannel.id !== currentChannelId) {
      currentChannelId = $chatStore.activeChannel.id;
      justSwitchedChannel = true;
      unreadMarkerIndex = -1;
      lastAckedMsgId = null;
      maxReadIndex = -1;
      clearTimeout(markReadTimer); 
      clearTimeout(positionTimer);
  }

  // 2. Read Status Trigger
  $: if ($chatStore.cursorIndex !== -1 && !justSwitchedChannel) {
      checkReadStatus();
  }

  // 3. Initial Load / Jump Logic
  $: if ($chatStore.messages) {
      const channel = $chatStore.activeChannel;
      
      if (justSwitchedChannel) {
          clearTimeout(positionTimer);
          positionTimer = setTimeout(() => {
              const finalMsgs = $chatStore.messages;
              if (finalMsgs.length === 0) return;

              const threshold = (channel.lastReadAt || 0) * 1000;
              if (channel.lastReadAt) {
                  const firstUnreadIdx = finalMsgs.findIndex(m => m.timestamp.getTime() > threshold);
                  
                  if (firstUnreadIdx !== -1) {
                      // FIX 2: Suppress Red Marker on Targeted Jump
                      // If we intentionally jumped here, we don't want the visual noise of "Unread".
                      if (!isTargetedJump) {
                          unreadMarkerIndex = firstUnreadIdx === 0 ? -2 : firstUnreadIdx - 1;
                      } else {
                          unreadMarkerIndex = -1; // Force Clear
                      }

                      if (!isTargetedJump) {
                          const targetCursor = Math.max(0, firstUnreadIdx - 1);
                          maxReadIndex = targetCursor;
                          chatStore.jumpTo(targetCursor);
                          tick().then(() => messageListComponent.scrollToCursor());
                      } else {
                          maxReadIndex = $chatStore.cursorIndex;
                      }
                  } else {
                      // All read
                      if (!isTargetedJump) chatStore.jumpToBottom();
                      maxReadIndex = finalMsgs.length - 1;
                  }
              } else {
                  // All read
                  if (!isTargetedJump) {
                      chatStore.jumpToBottom();
                      tick().then(() => messageListComponent.scrollToBottom({ instant: true }));
                  }
                  maxReadIndex = finalMsgs.length - 1;

              }
              
              justSwitchedChannel = false;
              
              // FIX 3: Skip checkReadStatus if we already did it eagerly
              if (!isTargetedJump) {
                  checkReadStatus(false);
              }
              
              isTargetedJump = false; 
          }, 50);
      } 
  }

  // 4. Update Unread Marker High Water Mark
  $: {
      const currentCursor = $chatStore.cursorIndex;
      if (unreadMarkerIndex !== -1) {
          if (currentCursor > unreadMarkerIndex) unreadMarkerIndex = currentCursor;
          if (unreadMarkerIndex >= $chatStore.messages.length - 1) unreadMarkerIndex = -1;
      }
  }
</script>

<svelte:window on:keydown={handleKeydown} on:focus={onWindowFocus} on:blur={onWindowBlur} />

<main class="cockpit">
  <Sidebar />

  <div class="buffer-container">
      <ThreadBanner />

      <MessageList 
          bind:this={messageListComponent} 
          {unreadMarkerIndex}
      />

      <StatusLine 
          bind:this={statusLineComponent}
          {isInsertMode}
          {editingMessageId}
          on:submit={(e) => handleSend(e.detail)}
          on:cancel={handleCancel}
          on:focus={onFocus}
          on:blur={onBlur}
      />
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
    --sumi-ink-0: #16161D;
    --sumi-ink-1: #1F1F28; --sumi-ink-2: #2A2A37;
    --sumi-ink-3: #363646; --fuji-white: #DCD7BA; --katana-gray: #727169;
    --crystal-blue: #7E9CD8; --spring-green: #98BB6C; --ronin-yellow: #FF9E3B;
    --samurai-red: #E82424; --wave-blue: #2D4F67;
    --font-main: "CodeNewRoman Nerd Font", 'JetBrains Mono', monospace; 
  }

  .cockpit { 
      display: flex; 
      height: 100vh; 
      width: 100vw; 
      background: var(--sumi-ink-1); 
      color: var(--fuji-white); 
      font-family: var(--font-main); 
      overflow: hidden; 
  }
  
  .buffer-container { 
      flex-grow: 1; 
      min-width: 0; 
      display: flex; 
      flex-direction: column; 
      position: relative; 
  }
</style>
