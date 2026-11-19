// Search, sorting and paging over `search.json`. Plain functions with no DOM, so they
// run in the browser, in tests and in any framework.
import type { BlogSearchPost, BlogSort, BlogTagInfo } from "./types.js";

/** Lowercase, without accents: "Résumé" is "resume". */
export function normalize(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** A query's words, normalized. Punctuation separates words. */
export function tokenize(query: string): string[] {
  return normalize(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** How much a match in each field counts. */
const WEIGHTS = { title: 10, tags: 6, headings: 4, description: 3, authors: 2, text: 1 } as const;
type Field = keyof typeof WEIGHTS;

/** Each field as ` word word word`, so a word start is `" " + term`. */
type Prepared = Record<Field, string>;

const prepared = new WeakMap<object, Prepared>();

function words(text: string): string {
  return ` ${tokenize(text).join(" ")}`;
}

function prepare(post: BlogSearchPost, tags: Record<string, BlogTagInfo>): Prepared {
  let fields = prepared.get(post);
  if (!fields) {
    fields = {
      title: words(post.title),
      tags: words(post.tags.map((id) => `${id} ${tags[id]?.name ?? ""}`).join(" ")),
      headings: words(post.headings.join(" ")),
      description: words(post.description),
      authors: words(post.authors.map((author) => author.name).join(" ")),
      text: words(post.text),
    };
    prepared.set(post, fields);
  }
  return fields;
}

export interface BlogSearchResult<T> {
  post: T;
  score: number;
}

/**
 * Posts matching every word of the query, best first. A word matches the start
 * of a word in a field (`dns` finds "DNSSEC"); a match inside a word counts for
 * less. Titles count most, then tags, headings, the description, authors and the
 * text. Ties go to the newer post. An empty query matches nothing.
 */
export function searchPosts<T extends BlogSearchPost>(
  posts: T[],
  query: string,
  tags: Record<string, BlogTagInfo> = {},
): BlogSearchResult<T>[] {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];
  const phrase = ` ${terms.join(" ")}`;
  const results: BlogSearchResult<T>[] = [];
  for (const post of posts) {
    const fields = prepare(post, tags);
    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      let termScore = 0;
      for (const field of Object.keys(WEIGHTS) as Field[]) {
        const text = fields[field];
        if (text.includes(` ${term}`)) termScore += WEIGHTS[field];
        else if (text.includes(term)) termScore += WEIGHTS[field] * 0.3;
      }
      if (!termScore) {
        matchedAll = false;
        break;
      }
      score += termScore;
    }
    if (!matchedAll) continue;
    // The words together, in order, in the title or description.
    if (terms.length > 1 && fields.title.includes(phrase)) score += WEIGHTS.title * 2;
    else if (terms.length > 1 && fields.description.includes(phrase))
      score += WEIGHTS.description * 2;
    results.push({ post, score });
  }
  return results.sort(
    (a, b) => b.score - a.score || Date.parse(b.post.date) - Date.parse(a.post.date),
  );
}

/** Posts in date order. `relevance` keeps the order given (from `searchPosts`). */
export function sortPosts<T extends { date: string }>(posts: T[], sort: BlogSort): T[] {
  if (sort === "relevance") return [...posts];
  const direction = sort === "oldest" ? 1 : -1;
  return [...posts].sort((a, b) => direction * (Date.parse(a.date) - Date.parse(b.date)));
}

/** One page of `items`. `page` is clamped to the pages there are. */
export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): { items: T[]; page: number; pageCount: number } {
  const size = pageSize > 0 ? pageSize : items.length || 1;
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  return { items: items.slice((current - 1) * size, current * size), page: current, pageCount };
}

/**
 * The page numbers a pager shows: all of them up to 7, otherwise the first, the
 * last and the ones around the current page, with `"gap"` for the rest.
 */
export function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const shown = new Set([1, pageCount, page - 1, page, page + 1]);
  if (page <= 4) [2, 3, 4, 5].forEach((n) => shown.add(n));
  if (page >= pageCount - 3) [1, 2, 3, 4].forEach((n) => shown.add(pageCount - n));
  const pages = [...shown].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (const n of pages) {
    const last = out[out.length - 1];
    if (typeof last === "number" && n - last > 1) out.push("gap");
    out.push(n);
  }
  return out;
}

/** Posts from a year (`2026`) or a month (`2026-11`); all of them for `""`. */
export function filterByDate<T extends { month: string }>(posts: T[], date: string): T[] {
  return date ? posts.filter((post) => post.month.startsWith(date)) : posts;
}

/** A date filter value: a year or a month, else `""`. */
export function normalizeDate(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  return /^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(text) ? text : "";
}

/** What the search shows, as kept in the address: `?q=dns&date=2026-11&sort=oldest&page=2`. */
export interface BlogExplorerState {
  q: string;
  /** A year (`2026`), a month (`2026-11`) or `""`. */
  date: string;
  sort: BlogSort;
  page: number;
}

const SORTS: BlogSort[] = ["relevance", "newest", "oldest"];

/** The default order: best match with a query, newest without. */
export function defaultSort(query: string): BlogSort {
  return query.trim() ? "relevance" : "newest";
}

/** Reads the state from a query string (`location.search`). */
export function readExplorerState(search: string): BlogExplorerState {
  const params = new URLSearchParams(search);
  const q = (params.get("q") ?? "").slice(0, 100);
  const sortParam = params.get("sort") as BlogSort | null;
  let sort = sortParam && SORTS.includes(sortParam) ? sortParam : defaultSort(q);
  if (sort === "relevance" && !q.trim()) sort = "newest";
  const page = Math.max(1, Math.floor(Number(params.get("page"))) || 1);
  return { q, date: normalizeDate(params.get("date")), sort, page };
}

/** The query string for a state, leaving out defaults: `""` for the plain list. */
export function writeExplorerState(state: BlogExplorerState): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.date) params.set("date", state.date);
  if (state.sort !== defaultSort(state.q)) params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Whether a state needs search results; otherwise the page's own list shows. */
export function isExplorerActive(state: BlogExplorerState): boolean {
  return Boolean(state.q.trim() || state.date) || state.sort !== "newest" || state.page > 1;
}
