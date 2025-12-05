<script lang="ts">
  import { inspectorStore } from '../stores/inspector';
  import { chatStore } from '../stores/chat';
  
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
            <div class="placeholder-art">
                <div class="orbit-system">⚝</div>
                <p class="status">System Nominal</p>
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
        {/if}
    </div>
</aside>

<style>
    .inspector-pane {
        /* Fixed 38% width for the Golden Ratio split */
        width: 38%; 
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
    }

    .content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }

    /* Placeholder Art */
    .orbit-system { font-size: 4rem; color: var(--katana-gray); opacity: 0.5; animation: spin 10s linear infinite; }
    .status { color: var(--katana-gray); margin-top: 10px; font-size: 0.8rem; font-family: var(--font-main); }
    
    @keyframes spin { 100% { transform: rotate(360deg); } }

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
    }
</style>
