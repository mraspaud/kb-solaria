<script lang="ts">
  import { onMount, tick, createEventDispatcher } from 'svelte';
  import { inputEngine, ghostText, entityRegex, users } from '../stores/input';
  import { sendTyping } from '../socketStore';  
  import { chatStore } from '../stores/chat';

  import { InputController } from '../logic/InputController';
  import { DEFAULT_KEYMAP } from '../logic/keymap';

  let textarea: HTMLTextAreaElement;
  let backdrop: HTMLElement;
  const dispatch = createEventDispatcher(); 

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
      // 1. ESCAPE: always prioritize cancelling insert mode
      if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          
          if (state.match) {
              inputEngine.reset();
          } else {
              dispatch('cancel');
              textarea.blur();
          }
          return;
      }

      // 2. TAB TRAP (The Fix)
      // Always prevent Tab from moving focus away, regardless of match state
      if (e.key === 'Tab') {
          e.preventDefault(); // Stop the browser from changing focus
          
          // Only perform completion logic if we actually have a match
          if (state.match && $ghostText) {
              const resolved = inputEngine.resolve();
              if (resolved) {
                  textarea.value = $inputEngine.raw;
                  await tick();
                  textarea.setSelectionRange($inputEngine.cursorPos, $inputEngine.cursorPos);
              }
          }
          return;
      }

      const cmd = InputController.resolveKey(e, DEFAULT_KEYMAP);

      // 3. Handle Insert Mode Commands
      if (cmd === 'ATTACH_FILE') {
          e.preventDefault(); // Stop browser "Find"
          e.stopPropagation();
          dispatch('attach');
          return;
      }

      // 3. NAVIGATION (Only if Match Active)
      if (state.match) {
          // Resolve the key using global config
          const cmd = InputController.resolveKey(e, DEFAULT_KEYMAP);

          // We accept specific list commands OR generic cursor commands (like ArrowDown)
          if (cmd === 'SELECT_PREV') {
              e.preventDefault();
              inputEngine.moveSelection(1);
              return;
          }

          if (cmd === 'SELECT_NEXT') {
              e.preventDefault();
              inputEngine.moveSelection(-1);
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

        dispatch('submit', text);

        // 3. Cleanup - clear both DOM and store state
        textarea.value = '';
        inputEngine.reset();
        autoResize();

        // 4. EXIT INSERT MODE - wait for reactivity to settle, then blur
        await tick();
        textarea.blur();
      }
  }
  
  export function focus() {
          textarea?.focus();
  }

  export function setText(text: string) {
      if (textarea) {
          textarea.value = text;
          // Sync the engine so the ghost text aligns
          inputEngine.update(text, text.length);
          autoResize();
      }
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
        spellcheck="true"
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
        box-sizing: border-box;
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
