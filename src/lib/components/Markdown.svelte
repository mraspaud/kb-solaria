<script lang="ts">
  import { Marked } from 'marked';
  import hljs from 'highlight.js/lib/core';

  import { chatStore } from '../stores/chat';
  import { getUserColor } from '../logic/theme'; 
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

  let nameToId = new Map<string, string>();
  $: {
      nameToId.clear();
      $users.forEach(u => nameToId.set(u.name, u.id));
  }

  let validUsers = new Set<string>();

  $: {
      validUsers.clear();
      $users.forEach(u => validUsers.add(u.name));
  }

  let sortedUserNames: string[] = [];
  $: sortedUserNames = $users.map(u => u.name).sort((a, b) => b.length - a.length);

  const mentionExtension = {
    name: 'mention',
    level: 'inline',
    // Quick check: does the string start with @?
    start(src: string) { return src.indexOf('@'); },
    
    tokenizer(src: string) {
        // We look for @
        if (src[0] !== '@') return undefined;

        // Try to match against known users (Longest First)
        // This is manual matching to support spaces without Regex complexity
        const content = src.slice(1); // Text after @
        
        for (const name of sortedUserNames) {
            if (content.startsWith(name)) {
                return {
                    type: 'mention',
                    raw: '@' + name, // Consume the full name with spaces
                    text: name
                };
            }
        }
        return undefined; // No valid user match found
    },
    renderer(token: any) {
        // Render as a semantic span we can style
        if (validUsers.has(token.text)) {
            const id = nameToId.get(token.text) || 'unknown';
            const color = getUserColor(id);
            return `<span class="mention" style="background-color: ${color}; border-color: ${color}">${token.text.replace(/ /g, '&nbsp;')}</span>`;
            // return `<span class="mention">${token.text}</span>`;
        } else {
            return `@${token.text}`; // Plain text return
        }
    }
  };

let sortedChannelNames: string[] = [];
  
  $: {
      // Sort longest first to match #general-dev before #general
      sortedChannelNames = $chatStore.availableChannels
          .map(c => c.name)
          .sort((a, b) => b.length - a.length);
  }

  const channelExtension = {
    name: 'channel',
    level: 'inline',
    start(src: string) { return src.indexOf('#'); },
    tokenizer(src: string) {
        if (src[0] !== '#') return undefined;
        const content = src.slice(1);
        
        for (const name of sortedChannelNames) {
            // Check start AND ensuring it's not part of a larger word if the name is a subset
            // (Simple startsWith is usually enough if we sort by length)
            if (content.startsWith(name)) {
                return {
                    type: 'channel',
                    raw: '#' + name,
                    text: name
                };
            }
        }
    },
    renderer(token: any) {
        const safeName = token.text.replace(/ /g, '&nbsp;');
        return `<span class="channel">#${safeName}</span>`;
    }
  };

  const parser = new Marked({
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

  parser.use({ extensions: [mentionExtension, channelExtension] });

  let html = "";

  $: if (content || sortedUserNames || sortedChannelNames) {
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
      /* background-color: var(--ronin-yellow); /* High contrast highlight */
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
  /* Channel Links */
  :global(.channel) {
      color: var(--crystal-blue);
      font-weight: bold;
      cursor: pointer; /* Implies clickable, though we haven't wired click-to-join yet */
      display: inline-block;
  }
  
  :global(.channel:hover) {
      text-decoration: underline;
  }
  :global(.markdown-body a) {
      color: #7FB4CA; /* Spring Blue (Distinct from Crystal Blue channels) */
      text-decoration: none;
      border-bottom: 1px solid transparent;
      transition: border-color 0.2s ease, color 0.2s ease;
  }

  :global(.markdown-body a:hover) {
      color: var(--ronin-yellow); /* Interaction feedback */
      border-bottom-color: var(--ronin-yellow);
  }
</style>
