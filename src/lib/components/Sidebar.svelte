<script lang="ts">
  import { hudStore } from '../stores/hud';
</script>

<aside class="sidebar">
    <div class="dot hot" class:active={$hudStore.ego > 0}></div>
    <div class="dot warm" class:active={$hudStore.signal > 0}></div>
    <div class="dot cold"></div>
</aside>

<style>
  /* Copied from App.svelte */
  .sidebar { 
      width: 12px; 
      background: var(--sumi-ink-0); 
      border-right: 1px solid var(--sumi-ink-2);
      display: flex; 
      flex-direction: column; 
      align-items: center; 
      padding-top: 10px; 
      gap: 8px;
  }
  
  .dot { 
      width: 4px; height: 4px; border-radius: 50%; 
      transition: all 0.3s ease;
      opacity: 0.2; 
  }
  
  .dot.active {
      opacity: 1;
      transform: scale(1.5);
      box-shadow: 0 0 8px currentColor; 
      animation: pulse 2s infinite;
  }
  
  @keyframes pulse {
      0% { box-shadow: 0 0 0 0 currentColor; }
      70% { box-shadow: 0 0 10px 4px transparent; }
      100% { box-shadow: 0 0 0 0 transparent; }
  }
  
  .dot.hot { background: var(--samurai-red); box-shadow: 0 0 4px var(--samurai-red); }
  .dot.warm { background: var(--ronin-yellow); }
  .dot.cold { 
      background: var(--crystal-blue);
      opacity: 0.5;
  }
</style>
