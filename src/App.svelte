<script lang="ts">
  import { onMount, tick } from 'svelte';
  
  // Logic & Stores
  import {
    status, connect, sendMessage, sendUpdate, sendDelete,
    fetchThread, fetchHistory, sendOpenPath, sendSaveToDownloads, sendMarkRead
  } from './lib/socketStore';
  import { chatStore, type CursorHint } from './lib/stores/chat';
  import { inspectorStore } from './lib/stores/inspector';
  import { focusStore } from './lib/stores/focus';
  import { editorStore } from './lib/stores/editor';
  import { readStatusStore } from './lib/stores/readStatus';
  import { InputController } from './lib/logic/InputController';
  import { DEFAULT_KEYMAP, type Command } from './lib/logic/keymap';
  import { extractUrls } from './lib/utils/messageUtils';

  // Components
  import Sidebar from './lib/components/Sidebar.svelte';
  import ThreadBanner from './lib/components/ThreadBanner.svelte';
  import MessageList from './lib/components/MessageList.svelte';
  import StatusLine from './lib/components/StatusLine.svelte';
  
  // Modals
  import ChannelSwitcher from './lib/components/ChannelSwitcher.svelte';
  import ReactionPicker from './lib/components/ReactionPicker.svelte';
  import Inspector from './lib/components/Inspector.svelte';

  import { stageFiles } from './lib/socketStore';

  let fileInput: HTMLInputElement;
  let messageListComponent: MessageList;
  let statusLineComponent: StatusLine;

  let showChannelSwitcher = false;
  let showReactionPicker = false;

  // Subscribe to stores
  $: isInsertMode = $focusStore.isInsertMode;
  $: isWindowFocused = $focusStore.isWindowFocused;
  $: editingMessageId = $editorStore;

  const controller = new InputController(DEFAULT_KEYMAP, handleCommand);

  function handleAttach() {
      fileInput?.click();
  }

  function handleFileSelection(e: Event) {
      const target = e.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
           stageFiles(target.files);
           target.value = ''; // Reset to allow re-selection
           // Refocus the input so the user can keep typing
           statusLineComponent.focus(); 
      }
  }

  onMount(() => {
    connect();
  });

  function jumpToBottomAndMarkRead() {
      readStatusStore.clearLastAcked();
      chatStore.jumpToBottom();
      checkReadStatus(true);
      tick().then(() => messageListComponent.scrollToBottom({ instant: true }));
  }

  function handleCommand(cmd: Command) {
      const isReadOnly = chatStore.isChannelReadOnly($chatStore.activeChannel.id);
      const msg = $chatStore.messages[$chatStore.cursorIndex];

      switch (cmd) {
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
              jumpToBottomAndMarkRead();
              break;
          case 'CENTER_VIEW':
              messageListComponent.scrollToCursor();
              break;
          case 'ENTER_INSERT':
              if (!isReadOnly) statusLineComponent.focus();
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
          case 'ACTIVATE_SELECTION':
              handleActivateSelection(msg);
              break;
          case 'GO_BACK':
              chatStore.goBack();
              tick().then(() => messageListComponent?.scrollToCursor());
              break;
          case 'CANCEL':
              handleCancel();
              break;
          case 'START_EDIT':
              if (!isReadOnly) startEdit(msg);
              break;
          case 'DELETE_MESSAGE':
              if (!isReadOnly) deleteMessage(msg);
              break;
          case 'YANK_MESSAGE':
              if (msg?.content) navigator.clipboard.writeText(msg.content);
              break;
          case 'OPEN_LINK':
              if (msg?.content) extractUrls(msg.content).forEach(url => sendOpenPath(url));
              break;
          case 'OPEN_FILE':
              msg?.attachments?.forEach(file => sendOpenPath(file.path));
              break;
          case 'DOWNLOAD_FILE':
              msg?.attachments?.forEach(file => sendSaveToDownloads(file.path));
              break;
          case 'JUMP_TO_CONTEXT':
              handleJumpToContext();
              break;
      }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (showChannelSwitcher) return;
    if (isInsertMode) return; 
    controller.handleKey(e);
  }

  function handleTriageJump(msg: any) {
      const fullChannel = $chatStore.availableChannels.find(c => c.id === msg.sourceChannel.id) || msg.sourceChannel;

      sendMarkRead(msg.sourceChannel.id, msg.id, msg.sourceChannel.service.id);
      chatStore.markReadUpTo(fullChannel, msg);
      chatStore.switchChannel(fullChannel, { jumpTo: msg.id });

      tick().then(() => {
          if ($chatStore.messages.length < 5 && fullChannel.service.id !== 'internal') {
              fetchHistory(fullChannel);
          }
          messageListComponent?.scrollToCursor();
      });
  }

  function handleThreadOpen(msg: any) {
      chatStore.openThread(msg);
      tick().then(() => {
          const newChannel = $chatStore.activeChannel;
          if (newChannel.isThread && newChannel.service.id !== 'internal' && newChannel.parentChannel?.id) {
              const threadRootId = msg.threadId || msg.id;
              fetchThread(newChannel.parentChannel, threadRootId, newChannel.service);
          }
      });
  }

  function handleActivateSelection(msg: any) {
      if (!msg || $chatStore.activeChannel.id.startsWith('thread_')) return;

      if ($chatStore.activeChannel.service.id === 'aggregation' && msg.sourceChannel) {
          return handleTriageJump(msg);
      }
      handleThreadOpen(msg);
  }

  function handleJumpToContext() {
      const channel = $chatStore.activeChannel;

      // Only works when viewing a thread
      if (!channel.isThread || !channel.parentChannel || !channel.threadId) return;

      // Get parent channel with fresh metadata
      const parentChannel = $chatStore.availableChannels.find(
          c => c.id === channel.parentChannel!.id
      ) || channel.parentChannel;

      // Switch to parent channel, positioning cursor at the thread root message
      chatStore.switchChannel(parentChannel, { jumpTo: channel.threadId });

      tick().then(() => {
          // Fetch history if buffer is sparse
          if ($chatStore.messages.length < 5 && parentChannel.service.id !== 'internal') {
              fetchHistory(parentChannel);
          }
          messageListComponent?.scrollToCursor();
      });
  }

  function handleSend(text: string) {
    if (!text) return;
    if (editorStore.isEditing) {
        sendUpdate(editorStore.messageId!, text);
        editorStore.completeEdit();
    } else {
        // Mark as read before sending - replying implies you've read everything above
        const channel = $chatStore.activeChannel;
        const messages = $chatStore.messages;
        const lastMsg = messages[messages.length - 1];

        if (lastMsg && channel.service.id !== 'internal') {
            const realId = channel.id.startsWith('thread_') ? channel.parentChannel?.id : channel.id;
            if (realId) {
                sendMarkRead(realId, lastMsg.id, channel.service.id);
                // Pass the actual channel (thread or regular) - markReadUpTo handles them differently
                chatStore.markReadUpTo(channel, lastMsg);
            }
        }

        sendMessage(text);
    }
  }

  function handleCancel() {
      if (editorStore.isEditing) {
          editorStore.cancelEdit();
          statusLineComponent.setText('');
      }
  }

  function startEdit(msg: any) {
      if (msg && chatStore.isMyMessage(msg)) {
          editorStore.startEdit(msg.id);
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
  function onFocus() { focusStore.enterInsertMode(); }
  function onBlur() { focusStore.exitInsertMode(); }
  function onWindowFocus() { focusStore.onWindowFocus(); }
  function onWindowBlur() {
     focusStore.onWindowBlur();
     if ($chatStore.isAttached) chatStore.detach();
  }

  // --- READ STATUS LOGIC ---
  function checkReadStatus(immediate = false) {
      if (!$focusStore.isWindowFocused) return;
      const msgs = $chatStore.messages;
      const idx = $chatStore.cursorIndex;

      if (idx < 0 || msgs.length === 0) return;

      const isAtBottom = $chatStore.isAttached || idx >= msgs.length - 1;
      if (isAtBottom) {
          chatStore.clearUnreadMarker();
          chatStore.clearUnreadCount($chatStore.activeChannel.id);
      }

      const doMarkRead = () => {
          if (!$chatStore.activeChannel) return;
          const channel = $chatStore.activeChannel;
          const targetMsg = msgs[idx];

          if (!targetMsg || readStatusStore.lastAckedMsgId === targetMsg.id) return;

          if (channel.service.id !== 'internal') {
              const realId = channel.id.startsWith('thread_') ? channel.parentChannel?.id : channel.id;
              if (realId) {
                  sendMarkRead(realId, targetMsg.id, channel.service.id);
                  chatStore.markReadUpTo(channel, targetMsg);
                  readStatusStore.setLastAcked(targetMsg.id);
              }
          }
      };

      readStatusStore.scheduleMarkRead(doMarkRead, immediate);
  }

  // --- REACTIVE ORCHESTRATION (Simplified) ---

  // 1. Channel Switch: Reset read state and scroll to cursor
  $: if (readStatusStore.didChannelChange($chatStore.activeChannel.id)) {
      readStatusStore.onChannelSwitch($chatStore.activeChannel.id);
      tick().then(() => messageListComponent?.scrollToCursor());
  }

  // 2. Cursor Movement: Update unread marker high water mark
  $: if ($chatStore.cursorIndex !== -1) {
      chatStore.updateUnreadMarkerHighWater($chatStore.cursorIndex);
      checkReadStatus();
  }
</script>

<svelte:window on:keydown={handleKeydown} on:focus={onWindowFocus} on:blur={onWindowBlur} />

<main class="cockpit">
  <Sidebar />

  <div class="buffer-container">
      <ThreadBanner />

      <MessageList bind:this={messageListComponent} />

      <StatusLine 
          bind:this={statusLineComponent}
          {isInsertMode}
          {editingMessageId}
          on:submit={(e) => handleSend(e.detail)}
          on:cancel={handleCancel}
          on:focus={onFocus}
          on:blur={onBlur}
          on:attach={handleAttach}
      />
      <input 
          type="file" 
          multiple 
          style="display: none;" 
          bind:this={fileInput} 
          on:change={handleFileSelection} 
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
