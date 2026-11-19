import { escapeHtml } from "./html.js";

/**
 * A small element tree. The build turns it into HTML with `toHtml`, and the
 * Vue components turn the same tree into virtual nodes, so a card or a pager
 * looks exactly the same in a static page and in live search results.
 */
export interface BlogElement {
  tag: string;
  /** `true` writes a bare attribute (`hidden`); `false` and `undefined` leave it out. */
  attrs?: Record<string, string | number | boolean | undefined>;
  children?: BlogNode[];
}

/** Text is escaped. `null`, `undefined` and `false` render nothing. */
export type BlogNode = BlogElement | string | null | undefined | false;

const VOID = new Set(["img", "input", "br", "hr", "meta", "link", "source", "path", "circle"]);

/** An element: `el("a", { href: "/" }, "Home")`. */
export function el(
  tag: string,
  attrs?: BlogElement["attrs"] | null,
  ...children: BlogNode[]
): BlogElement {
  return { tag, attrs: attrs ?? undefined, children };
}

function attributes(attrs: BlogElement["attrs"]): string {
  if (!attrs) return "";
  let out = "";
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    out += value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`;
  }
  return out;
}

/** The tree as HTML. */
export function toHtml(node: BlogNode): string {
  if (node === null || node === undefined || node === false) return "";
  if (typeof node === "string") return escapeHtml(node);
  const open = `<${node.tag}${attributes(node.attrs)}>`;
  if (VOID.has(node.tag))
    return node.tag === "path" || node.tag === "circle" ? `${open.slice(0, -1)}/>` : open;
  return `${open}${(node.children ?? []).map(toHtml).join("")}</${node.tag}>`;
}
