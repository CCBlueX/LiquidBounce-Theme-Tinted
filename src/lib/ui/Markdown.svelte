<script lang="ts">
  import type { MarkedToken, Token } from "marked";
  import { blank, decodeEntities, webUrl } from "../markdown";

  // Lexed Markdown as Svelte markup. Images belong to a gallery, so only an image inside a link shows, as its alt
  // text. Block HTML is left out and inline HTML shows as the text it is. Links go to onlink as written in the source,
  // which the client checks against it; without onlink (inside a button) they are plain text.
  let { tokens, inline = false, onlink }: { tokens: Token[]; inline?: boolean; onlink?: (url: string) => void } = $props();

  function open(event: MouseEvent, href: string) {
    event.preventDefault();
    if (event.button === 0) onlink?.(href);
  }

  const lineBreak = (html: string) => /^<br\s*\/?>$/i.test(html.trim());
</script>

{#snippet spans(list: Token[], inLink: boolean)}
  {#each list as raw, index (index)}
    {@const token = raw as MarkedToken}
    {#if token.type === "strong"}<strong>{@render spans(token.tokens, inLink)}</strong>
    {:else if token.type === "em"}<em>{@render spans(token.tokens, inLink)}</em>
    {:else if token.type === "del"}<del>{@render spans(token.tokens, inLink)}</del>
    {:else if token.type === "codespan"}<code>{token.text}</code>
    {:else if token.type === "br"}<br />
    {:else if token.type === "link"}
      {@const href = onlink && !inLink && webUrl(token.href) ? token.href : undefined}
      {#if href}
        <a {href} onclick={(event) => open(event, href)} onauxclick={(event) => event.preventDefault()}>{@render spans(token.tokens, true)}</a>
      {:else}{@render spans(token.tokens, true)}{/if}
    {:else if token.type === "image"}{#if inLink}{decodeEntities(token.text)}{/if}
    {:else if token.type === "html"}{#if lineBreak(token.text)}<br />{:else}{token.text}{/if}
    {:else if token.type === "text" && token.tokens}{@render spans(token.tokens, inLink)}
    {:else if token.type === "text" || token.type === "escape"}{decodeEntities(token.text)}
    {/if}
  {/each}
{/snippet}

{#snippet blocks(list: Token[])}
  {#each list as raw, index (index)}
    {@const token = raw as MarkedToken}
    {#if token.type === "heading"}
      <svelte:element this={`h${Math.min(6, token.depth + 3)}`} class:minor={token.depth > 2}>{@render spans(token.tokens, false)}</svelte:element>
    {:else if token.type === "paragraph"}
      {#if !blank(token)}<p>{@render spans(token.tokens, false)}</p>{/if}
    {:else if token.type === "text"}
      {@render spans(token.tokens ?? [token], false)}
    {:else if token.type === "list"}
      <svelte:element this={token.ordered ? "ol" : "ul"} start={token.ordered && token.start !== "" ? token.start : undefined}>
        {#each token.items as item, itemIndex (itemIndex)}
          <li class:task={item.task}>
            {#if item.task}<span class="check" class:checked={item.checked} role="img" aria-label={item.checked ? "Done" : "Open"}>{item.checked ? "✓" : ""}</span>{/if}
            {@render blocks(item.tokens)}
          </li>
        {/each}
      </svelte:element>
    {:else if token.type === "blockquote"}
      <blockquote>{@render blocks(token.tokens)}</blockquote>
    {:else if token.type === "code"}
      <pre><code>{token.text}</code></pre>
    {:else if token.type === "hr"}
      <hr />
    {:else if token.type === "table"}
      <div class="table">
        <table>
          <thead>
            <tr>
              {#each token.header as cell, column (column)}<th style:text-align={cell.align}>{@render spans(cell.tokens, false)}</th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each token.rows as row, rowIndex (rowIndex)}
              <tr>
                {#each row as cell, column (column)}<td style:text-align={cell.align}>{@render spans(cell.tokens, false)}</td>{/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/each}
{/snippet}

{#if inline}{@render spans(tokens, false)}{:else}<div class="markdown">{@render blocks(tokens)}</div>{/if}

<style>
  .markdown { color: var(--label-2); overflow-wrap: anywhere; }
  .markdown > :first-child { margin-top: 0; }
  .markdown > :last-child { margin-bottom: 0; }
  p, ul, ol, blockquote, pre, .table { margin: 0 0 8px; }
  h4, h5, h6 { margin: 14px 0 4px; color: var(--label); font-size: 14px; line-height: 20px; font-weight: 600; }
  .minor { font-size: 13px; line-height: 18px; }
  strong { color: var(--label); font-weight: 600; }
  del { opacity: 0.7; }
  a { color: var(--accent); text-underline-offset: 2px; }
  a:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-radius: 3px; }
  code {
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--fill-2);
    font-family: ui-monospace, "Cascadia Mono", "DejaVu Sans Mono", monospace;
    font-size: 0.92em;
  }
  pre {
    padding: 8px 10px;
    border-radius: var(--r-control);
    background: var(--fill);
    overflow-x: auto;
    scrollbar-width: thin;
  }
  pre code { padding: 0; background: none; font-size: 12px; line-height: 16px; }
  ul, ol { padding-left: 18px; }
  ul { list-style: disc; }
  ol { list-style: decimal; }
  li + li { margin-top: 2px; }
  li > p { margin-bottom: 4px; }
  li.task { list-style: none; position: relative; }
  .check {
    position: absolute;
    left: -18px;
    top: 2px;
    width: 13px;
    height: 13px;
    border-radius: 4px;
    display: grid;
    place-items: center;
    font-size: 10px;
    line-height: 1;
    box-shadow: inset 0 0 0 1px var(--fill-3);
  }
  .check.checked { background: var(--accent-fill); box-shadow: none; color: #fff; }
  blockquote { padding-left: 10px; box-shadow: inset 2px 0 0 var(--fill-3); }
  hr { height: 0.5px; margin: 12px 0; border: 0; background: var(--line); }
  .table { overflow-x: auto; scrollbar-width: thin; }
  table { border-collapse: collapse; font-size: 12px; line-height: 16px; }
  th, td { padding: 5px 8px; text-align: left; vertical-align: top; box-shadow: inset 0 -0.5px 0 var(--line); }
  th { color: var(--label); font-weight: 600; }
</style>
