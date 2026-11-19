import { parse } from "yaml";

export { escapeHtml } from "./shared/html.js";

/** A URL with a scheme (`https:`, `mailto:`) or protocol-relative (`//cdn`). */
export function isExternalUrl(url: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url);
}

/** `base` and `path` joined with exactly one slash between them. */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** `/blog`, `blog/` or `blog` as `/blog/`. */
export function normalizeBase(base: string): string {
  const trimmed = base.replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

// An opening `---` line, an optional YAML body, and a closing `---` line.
const FRONTMATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

/**
 * Splits a Markdown file into its YAML front matter and the content after it.
 * Invalid YAML throws, so callers can report it.
 */
export function readFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
  const source = raw.replace(/^\uFEFF/, "");
  const match = FRONTMATTER.exec(source);
  if (!match) return { data: {}, content: source };
  const data: unknown = match[1] ? parse(match[1], { schema: "core" }) : null;
  return { data: toRecord(data), content: source.slice(match[0].length) };
}

export function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

/** A list, or a single string split on commas. */
export function toStringList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return values.map(toText).filter(Boolean);
}

/** Lowercase words joined by hyphens: "Is your VPN working?" is `is-your-vpn-working`. */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
