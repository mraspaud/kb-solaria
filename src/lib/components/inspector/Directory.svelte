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
        {:else if state.match?.trigger === '#'}
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

                {:else if state.match?.trigger === '#'}
                    <span class="icon">#</span>
                    <span class="name">{item.obj.name}</span>
                    <span class="meta">{item.obj.service.name}</span>

                {:else if state.match?.trigger === ':'}
                    <span class="emoji-icon">{item.obj}</span> <span class="name">:{item.obj}:</span>
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
        display: flex; flex-direction: column;
        height: 100%;
        font-family: var(--font-main);
    }
    .header {
        padding: 10px;
        border-bottom: 1px solid var(--sumi-ink-3);
        color: var(--ronin-yellow);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    .list {
        flex: 1; overflow-y: auto;
        padding: 5px 0;
    }
    .item {
        padding: 6px 15px;
        display: flex; align-items: center; gap: 10px;
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
</style>
