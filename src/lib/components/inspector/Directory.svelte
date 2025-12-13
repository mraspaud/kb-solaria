<script lang="ts">
    import { inputEngine, candidates } from '../../stores/input';
    import { chatStore } from '../../stores/chat';
    import { getUserColor } from '../../logic/theme';

    $: state = $inputEngine;
    $: list = $candidates;
    $: activeIdx = state.selectedIndex;
</script>

<div class="directory-container">
    <div class="header">
        {#if state.match?.trigger === '@'}
            <span>Directory // Users</span>
        {:else if state.match?.trigger === '#' || state.match?.trigger === '~'}
            <span>Directory // Channels</span>
        {:else if state.match?.trigger === ':'}
            <span>Directory // Emojis</span>
        {/if}
    </div>

    <div class="list">
        {#each list as item, i}
            <div class="item" class:active={i === activeIdx}>
             
                {#if state.match?.trigger === '@'}
                    <span class="icon" style="color: {getUserColor(item.obj.id)}">●</span>
                    <span class="name">{item.obj.name}</span>
                    {#if item.obj.id === $chatStore.currentUser?.id}
                         <span class="meta">(Me)</span>
                    {/if}

                {:else if state.match?.trigger === '#' || state.match?.trigger === '~'}
                    <span class="icon">{state.match.trigger}</span>
                    <span class="name">{item.obj.name}</span>
                    <span class="meta">{item.obj.service.name}</span>

                {:else if state.match?.trigger === ':'}
                    {#if item.obj.isCustom}
                        <img src={item.obj.url} class="emoji-icon custom" alt={item.obj.id} />
                    {:else}
                        <span class="emoji-icon">{item.obj.char}</span>
                    {/if}
                    
                    <span class="name">:{item.obj.id}:</span>
                {/if}
            </div>
        {/each}

        {#if list.length === 0}
            <div class="empty">No matches found.</div>
        {/if}
    </div>
</div>

<style>
    .directory-container {
        display: flex; 
        flex-direction: column-reverse;
        height: 100%;
        font-family: var(--font-main);
        justify-content: flex-start; /* Gravity: Push everything to the bottom */
        padding-bottom: 4px; /* Lift up from the status bar */
    }
    
    .list {
        display: flex;
        flex-direction: column-reverse; /* FLIP: Index 0 (Best) goes to the bottom */
        overflow-y: auto; /* Scroll if too tall */
        max-height: 42vh; /* Safety cap */
        padding: 5px 0;
        flex-shrink: 0;
        /* Smooth scrolling */
        scrollbar-width: thin;
        scrollbar-color: var(--sumi-ink-3) transparent;
    }
    
    .header {
        padding: 10px;
        padding-bottom: 40px; /* Lift up from the status bar */
        border-top: 1px solid var(--sumi-ink-3);
        border-bottom: none; 
        color: var(--ronin-yellow);
        order: -1; /* Keep header at the visual bottom? Or visual top? */
        /* Let's try visual bottom (closest to input) */
        flex-shrink: 0;
    }
    .item {
        padding: 6px 15px;
        display: flex; align-items: center;
        gap: 10px;
        color: var(--katana-gray);
        border-left: 2px solid transparent;
        cursor: pointer;
    }
    .item.active {
        background: var(--sumi-ink-1);
        color: var(--fuji-white);
        border-left-color: var(--ronin-yellow);
    }
    .name { font-weight: bold; }
    .meta { font-size: 0.8rem; opacity: 0.7; margin-left: auto; }
    .empty { padding: 20px; text-align: center; color: var(--sumi-ink-3); font-style: italic; }
    
    .emoji-icon { 
        font-size: 1.2em; 
        min-width: 1.5em; 
        text-align: center;
    }
    /* New style for custom emoji images */
    .emoji-icon.custom {
        width: 1.5em;
        height: 1.5em;
        object-fit: contain;
    }
</style>
