import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { imageSize } from "image-size";
import markdownIt, { type Env, type MarkdownIt, type Token } from "markdown-it";
import { BUILT_IN_DIRECTIVES, directivesPlugin } from "./directives.js";
import { plainBlock, type CodeHighlighter } from "./highlight.js";
import type { BlogDirective, BlogPostSource, BlogTocEntry } from "./types.js";
import { escapeHtml, isExternalUrl, slugify } from "./util.js";

/** What a render collects, and what it needs from the plugin. */
export interface RenderEnv extends Env {
  post: BlogPostSource;
  /** Lines before the Markdown (the front matter), so reported lines match the file. */
  lineOffset: number;
  error(message: string): void;
  /** The URL a page should use for a local file next to the post. */
  assetUrl(file: string): string;
  toc: BlogTocEntry[];
  /** Links to site paths (no scheme, starting with `/`), for checking. */
  links: { href: string; line?: number }[];
  /** Local images this post uses. */
  images: string[];
  imageCount: number;
}

function readSize(file: string): { width?: number; height?: number } {
  try {
    const buffer = readFileSync(file);
    const { width, height } = imageSize(buffer);
    return { width, height };
  } catch {
    return {};
  }
}

/** markdown-it types `env` loosely; this plugin always passes a `RenderEnv`. */
export function asEnv(env: Env | undefined): RenderEnv {
  return env as RenderEnv;
}

/** A token attribute as a string (markdown-it allows numbers). */
function attr(token: Token, name: string): string | undefined {
  const value = token.attrGet(name);
  return value === null ? undefined : String(value);
}

function lineOf(token: Token, env: RenderEnv): string {
  return token.map ? `line ${token.map[0] + env.lineOffset + 1}: ` : "";
}

/** Headings get ids and a `#` link, and `##`/`###` go in the table of contents. */
function headings(md: MarkdownIt): void {
  md.core.ruler.push("blog_headings", (state) => {
    const env = asEnv(state.env);
    const used = new Map<string, number>();
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const open = tokens[i]!;
      if (open.type !== "heading_open") continue;
      const inline = tokens[i + 1]!;
      const text = (inline.children ?? [])
        .filter((child) => child.type === "text" || child.type === "code_inline")
        .map((child) => child.content)
        .join("")
        .trim();
      const base = attr(open, "id") ?? (slugify(text) || "section");
      const count = used.get(base) ?? 0;
      used.set(base, count + 1);
      const id = count ? `${base}-${count}` : base;
      open.attrSet("id", id);
      const level = Number(open.tag.slice(1));
      if (level === 2 || level === 3) env.toc.push({ level, id, text });
      if (level === 1)
        env.error(`${lineOf(open, env)}use the front matter title, not a "#" heading`);
    }
  });
  const defaultClose =
    md.renderer.rules.heading_close ??
    ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
  md.renderer.rules.heading_close = (tokens, index, options, env, self) => {
    const heading = tokens[index - 2];
    const id = heading && attr(heading, "id");
    const anchor = id
      ? ` <a class="heading-anchor" href="#${escapeHtml(id)}" aria-hidden="true" tabindex="-1">#</a>`
      : "";
    return anchor + defaultClose(tokens, index, options, env, self);
  };
}

/**
 * An image alone in its paragraph becomes a `<figure>`, with its title as the
 * caption. Every image needs alt text. Local images must exist, and get their
 * width and height, so the page doesn't shift as they load.
 */
function images(md: MarkdownIt): void {
  md.core.ruler.push("blog_figures", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i + 2 < tokens.length; i++) {
      const [open, inline, close] = [tokens[i]!, tokens[i + 1]!, tokens[i + 2]!];
      if (open.type !== "paragraph_open" || close.type !== "paragraph_close") continue;
      const children = (inline.children ?? []).filter(
        (child) => !(child.type === "text" && !child.content.trim()),
      );
      if (children.length !== 1 || children[0]!.type !== "image") continue;
      open.hidden = true;
      close.hidden = true;
      children[0]!.meta = { ...children[0]!.meta, figure: true };
    }
  });

  md.renderer.rules.image = (tokens, index, options, rawEnv, self) => {
    const env = asEnv(rawEnv);
    const token = tokens[index]!;
    const alt = self.renderInlineAsText(token.children ?? [], options, env).trim();
    const src = attr(token, "src") ?? "";
    const title = attr(token, "title") ?? "";
    const line = token.meta?.line as number | undefined;
    const where = line ? `line ${line}: ` : "";
    if (!alt) env.error(`${where}image "${src}" has no alt text`);

    const attrs: string[] = [];
    let url = src;
    if (src && !isExternalUrl(src) && !src.startsWith("/") && !src.startsWith("data:")) {
      const file = path.resolve(path.dirname(env.post.file), decodeURI(src.split(/[?#]/)[0]!));
      if (!existsSync(file)) {
        env.error(`${where}image "${src}" doesn't exist`);
      } else {
        env.images.push(file);
        url = env.assetUrl(file);
        const { width, height } = readSize(file);
        if (width && height) attrs.push(`width="${width}"`, `height="${height}"`);
      }
    }
    env.imageCount++;
    if (env.imageCount > 1) attrs.push('loading="lazy"');
    attrs.push('decoding="async"');

    const img = `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" ${attrs.join(" ")}>`;
    if (!token.meta?.figure) return img;
    const caption = title ? `<figcaption>${md.renderInline(title, env)}</figcaption>` : "";
    return `<figure>${img}${caption}</figure>\n`;
  };
}

/**
 * Records links to site paths for checking after every post has rendered, and
 * gives images their line in the file (inline tokens have none of their own).
 */
function links(md: MarkdownIt): void {
  md.core.ruler.push("blog_links", (state) => {
    const env = asEnv(state.env);
    for (const block of state.tokens) {
      const line = block.map ? block.map[0] + env.lineOffset + 1 : undefined;
      for (const child of block.children ?? []) {
        if (child.type === "image") child.meta = { ...child.meta, line };
        if (child.type !== "link_open") continue;
        const href = attr(child, "href") ?? "";
        if (href.startsWith("/") && !href.startsWith("//")) env.links.push({ href, line });
      }
    }
  });
}

/** Fenced code through Shiki (or plain), each in a `.code-block` with its language. */
function fences(md: MarkdownIt, highlighter: CodeHighlighter | null): void {
  md.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index]!;
    const lang = token.info.trim().split(/\s+/)[0] ?? "";
    const code = token.content;
    const html = highlighter ? highlighter.highlight(code, lang) : plainBlock(code, lang);
    const attr = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
    return `<div class="code-block"${attr}>${html}</div>\n`;
  };
}

/** The fence languages in some Markdown, so their grammars can load before rendering. */
export function fenceLanguages(md: MarkdownIt, content: string): Set<string> {
  const langs = new Set<string>();
  const walk = (tokens: Token[]) => {
    for (const token of tokens) {
      if (token.type === "fence") {
        const lang = token.info.trim().split(/\s+/)[0];
        if (lang) langs.add(lang);
      }
    }
  };
  const scratch: RenderEnv = {
    post: { slug: "", file: "", data: {}, content },
    lineOffset: 0,
    error() {},
    assetUrl: (file) => file,
    toc: [],
    links: [],
    images: [],
    imageCount: 0,
  };
  walk(md.parse(content, scratch));
  return langs;
}

export function createMarkdown(options: {
  directives: Record<string, BlogDirective>;
  highlighter: CodeHighlighter | null;
  extend?: (md: MarkdownIt) => void;
}): MarkdownIt {
  const md = markdownIt({ html: true, linkify: true, typographer: true });
  directivesPlugin(md, { ...BUILT_IN_DIRECTIVES, ...options.directives });
  headings(md);
  images(md);
  links(md);
  fences(md, options.highlighter);
  options.extend?.(md);
  return md;
}

/** Words in the post's prose, not counting code. */
export function countWords(content: string): number {
  return content
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^:::.*$/gm, "")
    .split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}
