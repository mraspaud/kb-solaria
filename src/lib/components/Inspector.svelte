<script lang="ts">
  import { inspectorStore } from '../stores/inspector';
  import { chatStore } from '../stores/chat';
  import Directory from './inspector/Directory.svelte';
  import StarMap from './inspector/StarMap.svelte';
  
  // Placeholder sub-components (we'll scaffold these next)
  // import Constellation from './inspector/Constellation.svelte';
  // import MediaPreview from './inspector/MediaPreview.svelte';
  // import ThreadContext from './inspector/ThreadContext.svelte';
  
  $: msg = $chatStore.messages[$chatStore.cursorIndex];
</script>

<aside class="inspector-pane">
    <div class="header">
        <span class="title">:: {$inspectorStore}</span>
        <div class="controls">
            </div>
    </div>

    <div class="content">
        {#if $inspectorStore === 'IDLE'}
            <div class="starmap-container">
                <StarMap />
                <div class="overlay-status">
                     <span class="system-status">SYS.NOMINAL</span>
                </div>
            </div>
        {:else if $inspectorStore === 'MEDIA'}
             <div class="preview-stage">
                {#each (msg?.attachments || []) as file}
                    <div class="media-card">
                        <span class="icon">📎</span> {file.name}
                    </div>
                {/each}
             </div>
        {:else if $inspectorStore === 'CONTEXT'}
            <div class="context-thread">
                <h3>Thread History</h3>
                <p>Replies: {msg?.replyCount || 0}</p>
            </div>
        {:else if $inspectorStore === 'LABORATORY'}
            <textarea class="scratchpad" placeholder="-- VI MODE ACTIVE --"></textarea>
        {:else if $inspectorStore === 'DIRECTORY'}
            <Directory />
        {/if}
    </div>
</aside>

<style>
    .inspector-pane {
        width: 38%; 
        flex-shrink: 0;
        background: var(--sumi-ink-0);
        border-left: 1px solid var(--sumi-ink-3);
        display: flex;
        flex-direction: column;
        height: 100vh;
    }

    .header {
        height: 32px;
        background: var(--sumi-ink-1);
        border-bottom: 1px solid var(--sumi-ink-2);
        display: flex;
        align-items: center;
        padding: 0 12px;
        color: var(--ronin-yellow);
        font-size: 0.75rem;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 1px;
        z-index: 10; /* Ensure header sits above canvas if needed */
    }

    .content {
        flex: 1;
        /* REMOVED padding: 20px; to let Canvas hit edges */
        padding: 0; 
        position: relative; /* Anchor for absolute children */
        display: flex;
        flex-direction: column;
    }

    /* Specific container for map to force full height */
    .starmap-container {
        width: 100%;
        height: 100%;
        position: relative;
    }

    .overlay-status {
        position: absolute;
        bottom: 20px;
        left: 0; 
        width: 100%;
        text-align: center;
        pointer-events: none;
    }
    
    .system-status {
        font-size: 0.7rem;
        color: var(--katana-gray);
        letter-spacing: 2px;
        opacity: 0.7;
    }

    /* Restore padding for other views */
    .preview-stage, .context-thread, .scratchpad {
        padding: 20px;
        width: 100%;
    }
    
    /* Media Cards */
    .media-card {
        border: 1px solid var(--sumi-ink-3);
        padding: 20px;
        border-radius: 4px;
        color: var(--fuji-white);
        background: var(--sumi-ink-1);
        margin-bottom: 10px;
        width: 100%;
    }

    .scratchpad {
        width: 100%; height: 100%;
        background: var(--sumi-ink-1);
        border: none; color: var(--fuji-white);
        font-family: var(--font-main);
        padding: 10px; outline: none;
        resize: none;
    }
</style>
