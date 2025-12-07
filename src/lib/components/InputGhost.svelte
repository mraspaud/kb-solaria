<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { inputEngine, ghostText, entityRegex, users } from '../stores/input';
  import { sendTyping } from '../socketStore';  
  import { chatStore } from '../stores/chat';
  import { sendMessage } from '../socketStore';

  let textarea: HTMLTextAreaElement;
  let backdrop: HTMLElement;
  
  $: state = $inputEngine;

  let validEntities = new Set<string>();
  
  $: {
      validEntities.clear();
      const activeServiceId = $chatStore.activeChannel.service.id;
      
      // 1. Scoped Channels
      $chatStore.availableChannels.forEach(c => {
          if (c.service.id === activeServiceId) {
              validEntities.add('#' + c.name);
              validEntities.add('~' + c.name); // Support both in validator
          }
      });
      
      // 2. Scoped Users
      $users.forEach(u => validEntities.add('@' + u.name));
  }

  let typingTimer: number | undefined;

  function handleInput() {
      inputEngine.update(textarea.value, textarea.selectionEnd);
      autoResize();
      syncScroll();
      const chan = $chatStore.activeChannel;
      if (chan.service.id !== 'internal') {
          // If timer is NOT running, send "Typing" now (start of burst)
          if (!typingTimer) {
              const realId = chan.id.startsWith('thread_') ? chan.parentChannel?.id : chan.id;
              if (realId) sendTyping(realId, chan.service.id);
          }
          
          // Clear existing timer
          clearTimeout(typingTimer);
          
          // Set new timer: We assume user stopped typing if no input for 2 seconds.
          // We clear the timer variable so the next keystroke sends a new packet.
          typingTimer = setTimeout(() => {
              typingTimer = undefined;
          }, 2000);
      }
  }

  function handleSelect() {
      // Keep cursor position synced if user clicks/arrows without typing
      inputEngine.update(textarea.value, textarea.selectionEnd);
  }

  function autoResize() {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
      // Sync backdrop height
      if (backdrop) backdrop.style.height = textarea.style.height;
  }

  function syncScroll() {
      if (backdrop) backdrop.scrollTop = textarea.scrollTop;
  }

  async function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          
          if (state.match) {
              // Priority 1: If menu is open, just close it (Soft Reset)
              inputEngine.reset();
          } else {
              // Priority 2: If menu is closed, exit Insert Mode (Hard Blur)
              textarea.blur();
          }
          return;
      }
      // 1. NAVIGATION (If Trigger Active)
      if (state.match) {
          if (e.key === 'Tab' && $ghostText) {
              e.preventDefault();
              const resolved = inputEngine.resolve();
              if (resolved) {
                  // Update DOM immediately
                  textarea.value = $inputEngine.raw;
                  // Restore cursor
                  await tick();
                  textarea.setSelectionRange($inputEngine.cursorPos, $inputEngine.cursorPos);
              }
              return;
          }

          if (e.key === 'ArrowUp' || (e.key === 'k' && e.ctrlKey)) {
              e.preventDefault(); inputEngine.moveSelection(-1); return;
          }
          if (e.key === 'ArrowDown' || (e.key === 'j' && e.ctrlKey)) {
              e.preventDefault(); inputEngine.moveSelection(1); return;
          }
          // ESC cancels autocomplete but keeps text
          if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation(); // Don't trigger global ESC (clear buffer)
              inputEngine.update(textarea.value, textarea.selectionEnd); // soft reset
              return;
          }
      }

      // 2. SUBMISSION
      if (e.key === 'Enter') {
        // Allow Shift+Enter for new lines
        if (e.shiftKey) return;

        e.preventDefault();
        e.stopPropagation();

        // 2. Send Message
        const text = textarea.value.trim();
        if (!text) return;

        sendMessage(text);

        // 3. Cleanup
        textarea.value = '';
        inputEngine.reset();
        autoResize();
        
        // 4. EXIT INSERT MODE
        textarea.blur(); // <--- Triggers App.svelte's onBlur -> isInsertMode = false
      }
  }
  
  export function focus() {
          textarea?.focus();
  }

function renderBackdrop(text: string) {
      let html = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

      if (!$entityRegex) return html;

      // Use the Dynamic Regex for precise replacement
      html = html.replace($entityRegex, (match, trigger1, name1, trigger2, name2) => {
          // Regex structure: (@)(Users) | (#)(Channels)
          // If match is @User, trigger1=@, name1=User
          // If match is #Chan, trigger2=#, name2=Chan
          
          const trigger = trigger1 || trigger2;
          const name = name1 || name2;
          const type = (trigger === '@') ? 'at' : 'hash';
          
          // NBSP TRICK: Replace spaces in the name with &nbsp;
          const safeName = name.replace(/ /g, '&nbsp;');

          return `<span class="highlight-${type}"><span class="marker">${trigger}</span>${safeName}</span>`;
      });
      
      return html;
  }
</script>

<div class="ghost-input">
    <div class="backdrop" bind:this={backdrop} aria-hidden="true">
        {#if state.match}
            {@const pre = state.raw.slice(0, state.cursorPos)}
            {@const post = state.raw.slice(state.cursorPos)}
            {@html renderBackdrop(pre)}<span class="ghost">{$ghostText}</span>{@html renderBackdrop(post)}
        {:else}
            {@html renderBackdrop(state.raw)}
        {/if}
        <br> 
    </div>

    <textarea
        bind:this={textarea}
        spellcheck="false"
        rows="1"
        on:input={handleInput}
        on:keydown={handleKeydown}
        on:select={handleSelect}
        on:scroll={syncScroll}
    ></textarea>
</div>

<style>
    .ghost-input {
        position: relative;
        width: 100%;
        font-family: var(--font-main);
        line-height: 1.5;
        font-size: 0.9rem;
    }

    textarea, .backdrop {
        /* CRITICAL: Typography must match exactly */
        font-family: inherit;
        font-size: inherit;
        line-height: inherit;
        padding: 0;
        margin: 0;
        width: 100%;
        border: none;
        resize: none;
        overflow: hidden;
        white-space: pre-wrap;
        word-wrap: break-word;
        min-height: 1.5em;
    }

    textarea {
        background: transparent;
        color: transparent; /* Text is hidden! We see the backdrop. */
        caret-color: var(--fuji-white); /* Only caret is visible */
        position: relative;
        z-index: 2;
        outline: none;
    }

    /* Fallback: if backdrop fails, show text. 
       Usually we keep color:transparent, but for debugging/selection we might need tweaks. 
       Actually, standard "Smart Compose" keeps textarea text visible and positions ghost absolutely.
       BUT, aligning absolute ghost text after variable width fonts is hard.
       
       Better Strategy implemented here:
       Backdrop contains: [Existing Text][Ghost Span][Remaining Text]
       Textarea contains: [Existing Text][Remaining Text]
       
       We set textarea text color to var(--fuji-white) normally.
       BUT to make the ghost text inline perfectly, we overlay.
       
       Let's use the "Transparent Textarea" method:
       Textarea has color: transparent, caret-color: white.
       Backdrop renders EVERYTHING.
    */
    
    .backdrop {
        position: absolute;
        top: 0;
        left: 0;
        z-index: 1;
        color: var(--fuji-white);
        pointer-events: none; /* Let clicks pass to textarea */
    }

    /* Ghost Text (The suggestion) */
    .ghost {
        opacity: 0.5;
        color: var(--katana-gray);
    }

    /* MENTIONS (Resolved) */
    /* Design Spec: "@ symbol is hidden, Name is Bold/Bright" */
    :global(.ghost-mention) {
        font-weight: bold;
        color: var(--ronin-yellow);
    }
    

    /* CHANNELS */
    /* Design Spec: "# symbol visible but dimmed, Name Bold" */
    :global(.ghost-channel) {
        font-weight: bold;
        color: var(--crystal-blue);
    }
    :global(.ghost-channel .marker) {
        opacity: 0.5;
        font-weight: normal;
    }
    :global(.highlight-at), :global(.highlight-hash) {
        font-weight: bold;
    }

    :global(.highlight-at) { color: var(--ronin-yellow); }
    :global(.highlight-hash) { color: var(--crystal-blue); }

    :global(.marker) {
        font-weight: normal;
        opacity: 0.5; /* Visible but dimmed */
        display: inline; /* Keep flow natural */
    }
</style>
