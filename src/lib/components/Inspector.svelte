<script lang="ts">
  import { inspectorStore } from '../stores/inspector';
  import { chatStore } from '../stores/chat';
  import { sendOpenPath, sendSaveToDownloads } from '../socketStore';
  import Directory from './inspector/Directory.svelte';
  import StarMap from './inspector/StarMap.svelte';
  import { getUserColor } from '../logic/theme';

  $: msg = $chatStore.messages[$chatStore.cursorIndex];
  
  // Helper to list participants in a thread preview
  $: participants = msg?.replies?.users || []; // Requires backend support (Mattermost/Slack usually send this)


  function handleInspectorKeydown(e: KeyboardEvent) {
      if ($inspectorStore === 'MEDIA') {
          // gf: Open File (Go File)
          if (e.key === 'f' && lastKey === 'g') {
              e.preventDefault();
              const files = msg?.attachments || [];
              if (files.length > 0) sendOpenPath(files[0].path);
              lastKey = '';
              return;
          }
          
          // yy: Download (Yank)
          if (e.key === 'd' && lastKey === 'g') {
              e.preventDefault();
              const files = msg?.attachments || [];
              if (files.length > 0) sendSaveToDownloads(files[0].path);
              lastKey = '';
              return;
          }
          
          // Reset leader tracking
          if (e.key === 'g' || e.key === 'y') {
              lastKey = e.key;
              return;
          }
          lastKey = '';
      }
  }
  
  let lastKey = '';
</script>

<svelte:window on:keydown={handleInspectorKeydown} />

<aside class="inspector-pane">
    <div class="header">
        <span class="title">:: {$inspectorStore}</span>
    </div>

    <div class="stack">
        <div class="layer starmap">
            <StarMap />
            {#if $inspectorStore === 'IDLE'}
                <div class="overlay-status">
                     <span class="system-status">SYS.NOMINAL</span>
                </div>
            {/if}
        </div>

        {#if $inspectorStore !== 'IDLE'}
            <div class="layer content-overlay">
                
                {#if $inspectorStore === 'MEDIA'}
                  <div class="panel">
                    <h3>Attachments</h3>
                    <div class="media-grid">
                        {#each (msg?.attachments || []) as file}
                            <div 
                                class="media-card interactive" 
                                title={file.path}
                                on:click={() => sendOpenPath(file.path)}
                            >
                                <div class="media-icon">📄</div>
                                <div class="media-info">
                                    <div class="media-name">{file.name}</div>
                                    <div class="media-meta">Local Disk ↗</div>
                                </div>
                            </div>
                        {/each}
                    </div>
                  </div>

                {:else if $inspectorStore === 'CONTEXT'}
                    <div class="panel">
                        <h3>Thread Context</h3>
                        
                        {#if $chatStore.activeChannel.isThread && $chatStore.activeChannel.parentMessage}
                             <div class="thread-preview">
                                 <span class="label">OP:</span>
                                 <p>"{$chatStore.activeChannel.parentMessage.content.slice(0, 150)}..."</p>
                             </div>
                        {:else if msg.replyCount}
                             <div class="thread-preview">
                                 <span class="label">Topic:</span>
                                 <p>"{msg.content.slice(0, 80)}..."</p>
                             </div>
                        {/if}

                        <div class="stats-row">
                             <div class="stat">
                                 <span class="val">{msg?.replyCount || $chatStore.messages.length || 0}</span>
                                 <span class="label">Replies</span>
                             </div>
                        </div>

                        {#if participants.length > 0}
                            <h4>Participants</h4>
                            <div class="participants-list">
                                {#each participants as userId}
                                    <div class="user-chip" style="border-color: {getUserColor(userId)}">
                                        <span class="uid">{userId}</span> 
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </div>

                {:else if $inspectorStore === 'LABORATORY'}
                    <textarea class="scratchpad" placeholder="-- VI MODE ACTIVE --"></textarea>

                {:else if $inspectorStore === 'DIRECTORY'}
                    <div class="panel full-height">
                        <Directory />
                    </div>
                {/if}
                
            </div>
        {/if}
    </div>
</aside>

<style>
    .inspector-pane {
        width: 38%; flex-shrink: 0;
        background: var(--sumi-ink-0);
        border-left: 1px solid var(--sumi-ink-3);
        display: flex; flex-direction: column; height: 100vh;
    }

    .header {
        height: 32px; background: var(--sumi-ink-1);
        border-bottom: 1px solid var(--sumi-ink-2);
        display: flex; align-items: center; padding: 0 12px;
        color: var(--ronin-yellow); font-size: 0.75rem;
        font-weight: bold; text-transform: uppercase; letter-spacing: 1px;
        z-index: 20;
    }

    /* STACKING CONTEXT */
    .stack {
        flex: 1; position: relative; overflow: hidden;
    }

    .layer {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
    }

    .starmap { z-index: 1; }
    
    .content-overlay { 
        z-index: 10; 
        background: rgba(22, 22, 29, 0.3); /* Semi-transparent Sumi-Ink */
        /* backdrop-filter: blur(2px); */
        padding: 20px;
        overflow-y: auto;
    }

    /* PANELS */
    .panel { color: var(--fuji-white); }
    .panel.full-height { height: 100%; }

    h3 { font-size: 0.9rem; color: var(--crystal-blue); margin-bottom: 12px; text-transform: uppercase; }
    h4 { font-size: 0.8rem; color: var(--katana-gray); margin: 12px 0 8px 0; }

    /* MEDIA */
    .media-card {
        display: flex; align-items: center; gap: 12px;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid var(--sumi-ink-3);
        padding: 10px; border-radius: 4px; margin-bottom: 8px;
    }

    .media-card.interactive {
        cursor: pointer;
        transition: border-color 0.2s, background-color 0.2s;
    }
    .media-card.interactive:hover {
        border-color: var(--ronin-yellow);
        background: rgba(255, 255, 255, 0.1);
    }
    .media-icon { font-size: 1.5rem; }
    .media-name { font-weight: bold; font-size: 0.9rem; word-break: break-all; }
    .media-meta { font-size: 0.75rem; color: var(--katana-gray); }

    /* CONTEXT */
    .stats-row { display: flex; gap: 20px; margin-bottom: 20px; }
    .stat { display: flex; flex-direction: column; }
    .stat .val { font-size: 1.5rem; color: var(--ronin-yellow); }
    .stat .label { font-size: 0.75rem; color: var(--katana-gray); }

    .participants-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .user-chip {
        padding: 2px 8px; border: 1px solid; border-radius: 12px;
        font-size: 0.75rem; color: var(--fuji-white); opacity: 0.8;
    }

    .scratchpad {
        width: 100%; height: 100%;
        background: transparent;
        border: none; color: var(--fuji-white);
        font-family: var(--font-main);
        outline: none; resize: none;
    }

    .overlay-status {
        position: absolute; bottom: 20px; left: 0; width: 100%;
        text-align: center; pointer-events: none;
    }
    .system-status { font-size: 0.7rem; color: var(--katana-gray); letter-spacing: 2px; opacity: 0.7; }
    .empty-state { font-style: italic; color: var(--katana-gray); }
    .thread-preview {
        background: rgba(255,255,255,0.05);
        padding: 10px;
        border-left: 2px solid var(--ronin-yellow);
        margin-bottom: 15px;
        font-style: italic;
        color: var(--fuji-white);
    }
    .thread-preview .label {
        font-weight: bold; color: var(--ronin-yellow); font-style: normal;
        font-size: 0.75rem; display: block; margin-bottom: 4px;
    }
</style>
