// Markup shared by the static pages and the Vue components, as element trees (see tree.ts).
import { fillLabel } from "./html.js";
import { pageWindow } from "./search.js";
import { el, type BlogElement, type BlogNode } from "./tree.js";
import type { BlogLabels, BlogPostSummary, BlogSort, BlogTagInfo } from "./types.js";

/** What a card shows. Both `BlogPostSummary` and `BlogSearchPost` fit. */
export type BlogCardPost = Pick<
  BlogPostSummary,
  | "url"
  | "title"
  | "description"
  | "dateText"
  | "dateTime"
  | "readingMinutes"
  | "tags"
  | "pinned"
  | "featured"
  | "cover"
>;

export interface BlogCardOptions {
  labels: BlogLabels;
  tags: Record<string, BlogTagInfo>;
  /** The title's heading level. Default 3. */
  headingLevel?: 2 | 3 | 4;
  /** The small label above the title. Default: "Pinned" for a pinned post, else none. */
  label?: string | false;
  /** The large card at the top of a list. */
  featured?: boolean;
  /** Show the cover image when the post has one. Default `true`. */
  cover?: boolean;
}

/** Tag ids as a list of tag links (plain names for tags without a page). */
export function tagListTree(
  ids: string[],
  tags: Record<string, BlogTagInfo>,
  current?: string,
): BlogElement | null {
  if (!ids.length) return null;
  return el(
    "ul",
    { class: "blog-tags" },
    ...ids.map((id) => {
      const tag = tags[id];
      const name = tag?.name ?? id;
      return el(
        "li",
        null,
        tag?.url
          ? el(
              "a",
              {
                class: "blog-tag",
                href: tag.url,
                "aria-current": current === id ? "page" : undefined,
              },
              name,
            )
          : el("span", { class: "blog-tag" }, name),
      );
    }),
  );
}

/**
 * A post as a card: optional cover and label, the title (its link covers the
 * whole card), the description, the date and reading time, and the tags.
 */
export function cardTree(post: BlogCardPost, options: BlogCardOptions): BlogElement {
  const { labels } = options;
  const heading = `h${options.headingLevel ?? 3}`;
  const label =
    options.label === false
      ? undefined
      : (options.label ?? (post.pinned ? labels.pinned : undefined));
  const classes = ["blog-card", options.featured && "is-featured", post.pinned && "is-pinned"]
    .filter(Boolean)
    .join(" ");
  return el(
    "article",
    { class: classes },
    options.cover !== false && post.cover
      ? el("img", {
          class: "blog-card-cover",
          src: post.cover,
          alt: "",
          loading: options.featured ? undefined : "lazy",
          decoding: "async",
        })
      : null,
    el(
      "div",
      { class: "blog-card-body" },
      label ? el("p", { class: "blog-card-label" }, label) : null,
      el(heading, { class: "blog-card-title" }, el("a", { href: post.url }, post.title)),
      el("p", { class: "blog-card-description" }, post.description),
      el(
        "p",
        { class: "blog-meta" },
        el("time", { datetime: post.dateTime }, post.dateText),
        el("span", null, fillLabel(labels.readingTime, { n: post.readingMinutes })),
      ),
      tagListTree(post.tags, options.tags),
    ),
  );
}

/** Cards in a list. */
export function cardListTree(posts: BlogCardPost[], options: BlogCardOptions): BlogElement {
  return el(
    "ul",
    { class: "blog-cards" },
    ...posts.map((post) => el("li", null, cardTree(post, options))),
  );
}

export interface BlogPagerOptions {
  page: number;
  pageCount: number;
  /** A page's address. */
  href: (page: number) => string;
  labels: BlogLabels;
}

/**
 * Numbered page links with Previous and Next. Every link carries `data-page`,
 * so a script can take over the click. `null` for a single page.
 */
export function pagerTree({ page, pageCount, href, labels }: BlogPagerOptions): BlogElement | null {
  if (pageCount <= 1) return null;
  const link = (target: number, className: string, text: string, rel?: string) =>
    el("a", { class: className, href: href(target), rel, "data-page": target }, text);
  return el(
    "nav",
    { class: "blog-pager", "aria-label": labels.pages },
    page > 1 ? link(page - 1, "blog-pager-prev", `← ${labels.previous}`, "prev") : null,
    el(
      "ol",
      null,
      ...pageWindow(page, pageCount).map((item) =>
        el(
          "li",
          null,
          item === "gap"
            ? el("span", { class: "blog-pager-gap", "aria-hidden": "true" }, "…")
            : item === page
              ? el("span", { "aria-current": "page" }, String(item))
              : el(
                  "a",
                  {
                    href: href(item),
                    "data-page": item,
                    "aria-label": fillLabel(labels.page, { n: item }),
                  },
                  String(item),
                ),
        ),
      ),
    ),
    page < pageCount ? link(page + 1, "blog-pager-next", `${labels.next} →`, "next") : null,
  );
}

export interface BlogCrumb {
  name: string;
  /** Leave out for the current page. */
  url?: string;
}

/** A breadcrumb trail. The last item without a `url` is the current page. */
export function breadcrumbTree(items: BlogCrumb[], labels: BlogLabels): BlogElement {
  return el(
    "nav",
    { class: "blog-crumbs", "aria-label": labels.breadcrumb },
    el(
      "ol",
      null,
      ...items.map((item) =>
        el(
          "li",
          null,
          item.url
            ? el("a", { href: item.url }, item.name)
            : el("span", { "aria-current": "page" }, item.name),
        ),
      ),
    ),
  );
}

export interface BlogSearchFormOptions {
  labels: BlogLabels;
  indexUrl: string;
  query: string;
  sort: BlogSort;
  /** On a tag page, the tag's name, for the placeholder. */
  tagName?: string;
  /**
   * `false` in the static page: the sort menu keeps its space but stays hidden
   * until a script runs, since it does nothing without one.
   */
  interactive: boolean;
}

const SEARCH_ICON = el(
  "svg",
  {
    class: "blog-search-icon",
    viewBox: "0 0 24 24",
    width: 20,
    height: 20,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.75",
    "stroke-linecap": "round",
    "aria-hidden": "true",
    focusable: "false",
  },
  el("circle", { cx: 10.5, cy: 10.5, r: 6.5 }),
  el("path", { d: "m15.5 15.5 5 5" }),
);

/**
 * The search field and sort menu. Controls carry `data-blog-control` (`query`,
 * `clear`, `sort`), so a script can bind them.
 */
export function searchFormTree(options: BlogSearchFormOptions): BlogElement {
  const { labels, query, sort, interactive } = options;
  const placeholder = options.tagName
    ? fillLabel(labels.searchTopic, { tag: options.tagName })
    : labels.search;
  const sorts: BlogSort[] = query.trim() ? ["relevance", "newest", "oldest"] : ["newest", "oldest"];
  const sortLabels: Record<BlogSort, string> = {
    relevance: labels.sortRelevance,
    newest: labels.sortNewest,
    oldest: labels.sortOldest,
  };
  const shown = sorts.includes(sort) ? sort : sorts[0]!;
  return el(
    "form",
    {
      class: "blog-search",
      role: "search",
      action: options.indexUrl,
      method: "get",
      "data-blog-control": "form",
    },
    el(
      "div",
      { class: "blog-search-field" },
      el("label", { class: "blog-visually-hidden", for: "blog-search-input" }, placeholder),
      SEARCH_ICON,
      el("input", {
        id: "blog-search-input",
        type: "search",
        name: "q",
        value: query,
        placeholder,
        autocomplete: "off",
        autocapitalize: "off",
        spellcheck: "false",
        enterkeyhint: "search",
        maxlength: 100,
        "aria-keyshortcuts": "/",
        "data-blog-control": "query",
      }),
      query
        ? el(
            "button",
            {
              type: "button",
              class: "blog-search-clear",
              "aria-label": labels.clearSearch,
              "data-blog-control": "clear",
            },
            "×",
          )
        : null,
    ),
    el(
      "label",
      { class: "blog-sort", "data-pending": interactive ? undefined : true },
      el("span", { class: "blog-visually-hidden" }, labels.sort),
      el(
        "select",
        { name: "sort", "data-blog-control": "sort", disabled: interactive ? undefined : true },
        ...sorts.map((value) =>
          el("option", { value, selected: value === shown ? true : undefined }, sortLabels[value]),
        ),
      ),
    ),
  );
}

/** The result count line: "3 posts for “dns”". */
export function resultCount(labels: BlogLabels, count: number, query: string): string {
  const results = count === 1 ? labels.resultsOne : fillLabel(labels.results, { n: count });
  return query.trim() ? fillLabel(labels.resultsFor, { results, q: query.trim() }) : results;
}

export type { BlogNode };
