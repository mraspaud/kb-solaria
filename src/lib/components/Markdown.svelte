<script lang="ts">
  import { Marked } from 'marked';
  import hljs from 'highlight.js/lib/core';
  // Imports for validation
  import { chatStore } from '../stores/chat';
  import { users } from '../stores/input'; 
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

  let validUsers = new Set<string>();

  $: {
      validUsers.clear();
      $users.forEach(u => validUsers.add(u.name));
  }
  
  const mentionExtension = {
    name: 'mention',
    level: 'inline',
    start(src: string) { return src.match(/@[a-zA-Z0-9_\- ]/)?.index; },
    tokenizer(src: string) {
        // Match @Name (allowing spaces, but stopping at punctuation/newlines)
        // Regex logic: @ followed by words, stopping before typical punctuation
        const rule = /^@([a-zA-Z0-9_\-\.]+)/;
        const match = rule.exec(src);
        if (match) {
            return {
                type: 'mention',
                raw: match[0],
                text: match[1].trim() // The name without @
            };
        }
    },
    renderer(token: any) {
        // Render as a semantic span we can style
        if (validUsers.has(token.text)) {
            return `<span class="mention">${token.text}</span>`;
        } else {
            return `@${token.text}`; // Plain text return
        }
    }
  };

  const parser = new Marked({
    // 1. LOGIC FIX: Turn 'Enter' into <br>
    breaks: true,
    gfm: true, 
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

  parser.use({ extensions: [mentionExtension] });

  let html = "";

  $: if (content) {
      try {
        const result = parser.parse(content);
        if (result instanceof Promise) {
            result.then(r => html = r);
        } else {
            html = result as string;
        }
      } catch (e) {
        console.error("Markdown parsing error:", e);
        html = content;
      }
  }
</script>

<div class="markdown-body">
    {@html html}
</div>

<style>
  .markdown-body { 
    font-size: 1rem; 
    line-height: 1.3;
    max-width: 100%;
    overflow-x: hidden;
  }
  
  /* 2. CSS FIX: Allow paragraphs to stack, but keep them tight */
  :global(.markdown-body p) { 
      margin: 0; 
      /* display: inline;  <-- DELETED THIS. It destroys multiline structure. */
      display: block;      /* Let them stack naturally */
  }
  
  /* Add tiny breathing room between actual paragraphs (Double Enter) */
  :global(.markdown-body p + p) {
      margin-top: 4px;
  }
  
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
  :global(.mention) {
      color: var(--sumi-ink-0);
      background-color: var(--ronin-yellow); /* High contrast highlight */
      font-weight: bold;
      padding: 0 4px;
      border-radius: 3px;
      display: inline-block;
      line-height: 1.2;
      font-size: 0.9em;
      margin: 0 1px;
      transform: translateY(-1px);
  }
/*  :global(.mention) {
      color: var(--ronin-yellow);
      background: rgba(255, 158, 59, 0.1);
      font-weight: bold;
      padding: 0 2px;
      border-radius: 3px;
  } */
</style>
