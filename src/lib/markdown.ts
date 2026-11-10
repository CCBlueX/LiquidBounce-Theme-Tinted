// Markdown from marketplace users, lexed with marked and rendered by ui/Markdown.svelte as Svelte markup, so nothing
// in it reaches the page as HTML.
import { Lexer, type MarkedToken, type Token, type Tokens } from "marked";

export type MarkdownImage = { src: string; alt: string };

/** Blocks with the images taken out for a gallery. */
export type MarkdownDocument = { blocks: MarkedToken[]; images: MarkdownImage[] };

/** The link as the browser would load it, when it is http(s); relative, javascript: or data: links give undefined. */
export function webUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

let decoder: HTMLTextAreaElement | undefined;

/** marked leaves character references (&amp;, &copy;) in text; a textarea decodes them without parsing any tags. */
export function decodeEntities(text: string) {
  if (!text.includes("&")) return text;
  decoder ??= document.createElement("textarea");
  decoder.innerHTML = text;
  return decoder.value;
}

// Without extensions the lexer only makes the tokens marked knows
const lex = (source: string) => Lexer.lex(source, { gfm: true }) as MarkedToken[];

/** Calls visit on every token, with whether it sits inside a link. */
function walk(tokens: Token[], visit: (token: MarkedToken, inLink: boolean) => void, inLink = false) {
  for (const token of tokens as MarkedToken[]) {
    visit(token, inLink);
    if (token.type === "list") walk(token.items, visit, inLink);
    else if (token.type === "table") {
      for (const cell of [...token.header, ...token.rows.flat()]) walk(cell.tokens, visit, inLink);
    } else if ("tokens" in token && token.tokens) walk(token.tokens, visit, inLink || token.type === "link");
  }
}

function plainText(tokens: Token[]): string {
  let text = "";
  walk(tokens, (token) => {
    if ((token.type === "text" && !token.tokens) || token.type === "codespan" || token.type === "escape") text += token.text;
  });
  return decodeEntities(text);
}

/** A paragraph of nothing but images and white space, which the gallery leaves empty. */
export function blank(paragraph: Tokens.Paragraph) {
  return paragraph.tokens.every(
    (token) => token.type === "image" || token.type === "br" || (token.type === "text" && !token.text.trim()),
  );
}

const sameText = (a: string, b: string | undefined) => !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The blocks of a description and its images, in order. Images inside a link stay with the link, as its text.
 * Paragraphs left empty go, then headings whose section had only images; a first heading that repeats the title too.
 */
export function markdownDocument(source: string, title?: string): MarkdownDocument {
  const tokens = lex(source);
  const images: MarkdownImage[] = [];
  walk(tokens, (token, inLink) => {
    const src = token.type === "image" && !inLink ? webUrl(token.href) : undefined;
    if (src && token.type === "image") images.push({ src, alt: decodeEntities(token.text) });
  });

  const kept = tokens.filter(
    (token) =>
      token.type !== "space" &&
      token.type !== "def" &&
      !(token.type === "html" && token.block) &&
      !(token.type === "paragraph" && blank(token)),
  );
  // Backwards, so a heading whose subheadings all went is seen as empty as well
  const blocks: MarkedToken[] = [];
  for (let index = kept.length - 1; index >= 0; index--) {
    const token = kept[index];
    const next = blocks[0];
    if (token.type === "heading" && (!next || (next.type === "heading" && next.depth <= token.depth))) continue;
    blocks.unshift(token);
  }
  const first = blocks[0];
  if (first?.type === "heading" && sameText(plainText(first.tokens), title)) blocks.shift();
  return { blocks, images };
}

/**
 * The inline tokens of a summary line without its images. Headings, list items and quotes give their text; a line
 * of only images or the title gives nothing.
 */
export function summaryTokens(source: string, title?: string): Token[] {
  let token: MarkedToken | undefined = lex(source).find((block) => block.type !== "space");
  while (token?.type === "list" || token?.type === "list_item" || token?.type === "blockquote") {
    const children: MarkedToken[] = token.type === "list" ? token.items : (token.tokens as MarkedToken[]);
    token = children.find((child) => child.type !== "checkbox");
  }
  const inline = token && "tokens" in token && token.tokens ? token.tokens.filter((child) => child.type !== "image") : [];
  const text = plainText(inline);
  return !text.trim() || sameText(text, title) ? [] : inline;
}
