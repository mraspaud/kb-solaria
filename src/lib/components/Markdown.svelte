<script lang="ts">
  import { Marked } from 'marked';
  import hljs from 'highlight.js/lib/core';
  
  // Register languages
  import python from 'highlight.js/lib/languages/python';
  import typescript from 'highlight.js/lib/languages/typescript';
  import bash from 'highlight.js/lib/languages/bash';
  import json from 'highlight.js/lib/languages/json';
  import markdown from 'highlight.js/lib/languages/markdown';

  hljs.registerLanguage('python', python);
  hljs.registerLanguage('typescript', typescript);
  hljs.registerLanguage('bash', bash);
  hljs.registerLanguage('json', json);
  hljs.registerLanguage('markdown', markdown);

  export let content: string = "";

  // Instantiate a local parser with the custom renderer
  const parser = new Marked({
    renderer: {
      code({ text, lang }: { text: string, lang?: string }) {
        const language = lang && hljs.getLanguage(lang) ? lang : 'bash';
        try {
            const highlighted = hljs.highlight(text, { language }).value;
            return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
        } catch (e) {
            return `<pre><code class="hljs">${text}</code></pre>`;
        }
      }
    }
  });

  let html = "";

  // Reactive statement with SAFETY CHECK
  $: if (content) {
      try {
        // marked.parse can return a Promise if async extensions are used.
        // With standard setup, it returns a string. We cast it to string to be safe.
        const result = parser.parse(content);
        // Handle sync vs async result just in case
        if (result instanceof Promise) {
            result.then(r => html = r);
        } else {
            html = result as string;
        }
      } catch (e) {
        console.error("Markdown parsing error:", e);
        html = content; // Fallback to raw text
      }
  }
</script>

<div class="markdown-body">
    {@html html}
</div>

<style>
  .markdown-body { 
    font-size: 1rem; 
    line-height: 1.5;
    /* Ensure markdown doesn't break layout width */
    max-width: 100%;
    overflow-x: hidden;
  }
  
  /* Reset paragraph margins */
  :global(.markdown-body p) { margin: 0; display: inline; }
  
  /* Code Blocks - Kanagawa Theming */
  :global(pre) {
      display: block;
      padding: 12px;
      margin: 8px 0;
      background: var(--sumi-ink-0); 
      border-radius: 6px;
      border: 1px solid var(--sumi-ink-3);
      overflow-x: auto;
      font-family: var(--font-main);
  }
  
  :global(code) {
      font-family: var(--font-main);
      font-size: 0.9em;
      padding: 2px 4px;
      border-radius: 3px;
      background: rgba(127, 127, 127, 0.1);
  }
  
  /* Ensure code inside pre doesn't get double background */
  :global(pre code) {
      background: transparent;
      padding: 0;
      color: var(--fuji-white);
      border: none;
  }

  /* Kanagawa Highlight.js Mapping */
  :global(.hljs-keyword) { color: var(--ronin-yellow); font-weight: bold; }
  :global(.hljs-string) { color: var(--spring-green); }
  :global(.hljs-number) { color: var(--ronin-yellow); }
  :global(.hljs-function) { color: var(--crystal-blue); }
  :global(.hljs-title) { color: var(--crystal-blue); }
  :global(.hljs-comment) { color: var(--katana-gray); font-style: italic; }
  :global(.hljs-operator) { color: var(--boat-yellow); }
  :global(.hljs-built_in) { color: var(--wave-blue); }
</style>
