import type { BlogSearchIndex, BlogSearchPost } from "./shared/types.js";
import type { BlogPost, BlogRenderHelpers } from "./types.js";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** An article's HTML as plain text: no tags, heading anchors, scripts or styles. */
export function htmlToText(html: string): string {
  return (
    html
      .replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<a class="heading-anchor"[\s\S]*?<\/a>/g, "")
      // Block elements separate words; inline ones (<strong>, <a>) don't.
      .replace(
        /<\/?(?:p|div|h[1-6]|li|ul|ol|pre|blockquote|figure|figcaption|table|thead|tbody|tr|td|th|br|hr|section|aside|details|summary|dl|dt|dd)\b[^>]*>/gi,
        " ",
      )
      .replace(/<[^>]+>/g, "")
      .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
        if (entity[0] === "#") {
          const code =
            entity[1]?.toLowerCase() === "x"
              ? parseInt(entity.slice(2), 16)
              : Number(entity.slice(1));
          return Number.isFinite(code) ? String.fromCodePoint(code) : match;
        }
        return ENTITIES[entity.toLowerCase()] ?? match;
      })
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Cuts text at a word boundary, at most `limit` characters. */
function cut(text: string, limit: number): string {
  if (limit <= 0) return "";
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit);
  const space = slice.lastIndexOf(" ");
  return space > limit * 0.8 ? slice.slice(0, space) : slice;
}

/** `search.json`: every listed post's summary and searchable text, newest first. */
export function buildSearchIndex(
  posts: BlogPost[],
  helpers: BlogRenderHelpers,
  textLimit: number,
): BlogSearchIndex {
  return {
    version: 1,
    tags: helpers.tagInfo,
    posts: posts.map((post): BlogSearchPost => {
      // The front matter stays out: it can hold anything, and the index is public.
      const { data, ...summary } = helpers.summary(post);
      void data;
      return {
        ...summary,
        headings: post.toc.map((entry) => entry.text),
        text: cut(htmlToText(post.html), textLimit),
      };
    }),
  };
}
