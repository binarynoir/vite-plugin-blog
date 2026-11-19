// Markup shared by the static pages and the Vue components, as element trees (see tree.ts).
import { fillLabel } from "./html.js";
import { pageWindow } from "./search.js";
import { el, type BlogElement, type BlogNode } from "./tree.js";
import type { BlogBrowse, BlogLabels, BlogPostSummary, BlogSort, BlogTagInfo } from "./types.js";

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

/** The result count line: "3 posts for “dns”", "2 posts from November 2026". */
export function resultCount(
  labels: BlogLabels,
  count: number,
  query: string,
  /** The date filter's name, such as "November 2026". */
  dateName?: string,
): string {
  let results = count === 1 ? labels.resultsOne : fillLabel(labels.results, { n: count });
  if (query.trim()) results = fillLabel(labels.resultsFor, { results, q: query.trim() });
  return dateName ? fillLabel(labels.resultsFrom, { results, date: dateName }) : results;
}

/** The name of a date filter value: "2026" or "November 2026". `""` when it isn't in the menu. */
export function dateName(browse: BlogBrowse | undefined, date: string): string {
  if (!date || !browse) return "";
  const year = browse.dates.find((entry) => date.startsWith(entry.value));
  if (!year) return "";
  return date.length === 4 ? year.value : (year.months.find((m) => m.value === date)?.name ?? "");
}

export interface BlogBrowseOptions {
  browse: BlogBrowse;
  labels: BlogLabels;
  /** The tab for this page: a tag id, or `""` for "All". */
  current: string;
  /** The date filter in use. */
  date: string;
  /** A date choice's address. */
  dateHref: (date: string) => string;
  /**
   * `false` in the static page: the date menu keeps its space but stays hidden
   * until a script runs, since it does nothing without one.
   */
  interactive: boolean;
}

const FEED_ICON = el(
  "svg",
  {
    class: "blog-browse-feed-icon",
    viewBox: "0 0 24 24",
    width: 18,
    height: 18,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.9",
    "stroke-linecap": "round",
    "aria-hidden": "true",
    focusable: "false",
  },
  el("path", { d: "M5 11a8 8 0 0 1 8 8" }),
  el("path", { d: "M5 5a14 14 0 0 1 14 14" }),
  el("circle", { cx: 6, cy: 18, r: 1.6, fill: "currentColor", stroke: "none" }),
);

const CHEVRON = el(
  "svg",
  {
    class: "blog-menu-chevron",
    viewBox: "0 0 24 24",
    width: 14,
    height: 14,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  },
  el("path", { d: "m6 9 6 6 6-6" }),
);

function countLabel(labels: BlogLabels, n: number): string {
  return n === 1 ? labels.resultsOne : fillLabel(labels.results, { n });
}

/**
 * The browse bar: topic tabs with post counts on one rule, then the date menu
 * and the feed icon at its end. Tabs carry `data-blog-control="topic"`, the menu
 * `date-menu` and its choices `date` with `data-date`, so a script can bind them.
 */
export function browseTree(options: BlogBrowseOptions): BlogElement {
  const { browse, labels, current, date, interactive } = options;
  const tabs = el(
    "nav",
    { class: "blog-browse-topics", "aria-label": labels.topics },
    el(
      "ul",
      { class: "blog-browse-tabs" },
      ...browse.topics.map((topic) =>
        el(
          "li",
          null,
          el(
            "a",
            {
              class: "blog-browse-tab",
              href: topic.url,
              "aria-current": (topic.tag ?? "") === current ? "page" : undefined,
              "data-blog-control": "topic",
            },
            topic.name,
            el("span", { class: "blog-browse-count", "aria-hidden": "true" }, String(topic.count)),
            el("span", { class: "blog-visually-hidden" }, ` (${countLabel(labels, topic.count)})`),
          ),
        ),
      ),
    ),
  );

  const choice = (value: string, text: string, count: number, label?: string) =>
    el(
      "a",
      {
        class: "blog-menu-choice",
        href: options.dateHref(value),
        "aria-current": value === date ? "true" : undefined,
        "aria-label": label ? `${label} (${countLabel(labels, count)})` : undefined,
        "data-blog-control": "date",
        "data-date": value,
      },
      text,
    );
  const selected = dateName(browse, date);
  const menu = browse.dates.length
    ? el(
        "details",
        {
          class: ["blog-menu", selected && "is-active"].filter(Boolean).join(" "),
          "data-blog-control": "date-menu",
          "data-pending": interactive ? undefined : true,
        },
        el(
          "summary",
          { class: "blog-menu-button" },
          el("span", { class: "blog-visually-hidden" }, `${labels.date}: `),
          el("span", null, selected || labels.date),
          CHEVRON,
        ),
        el(
          "div",
          { class: "blog-menu-panel" },
          el("p", { class: "blog-menu-any" }, choice("", labels.anyTime, 0)),
          ...browse.dates.map((year) =>
            el(
              "div",
              { class: "blog-menu-year" },
              el(
                "p",
                { class: "blog-menu-year-head" },
                choice(year.value, year.value, year.count, year.value),
                el(
                  "span",
                  { class: "blog-browse-count", "aria-hidden": "true" },
                  String(year.count),
                ),
              ),
              el(
                "ul",
                { class: "blog-menu-months" },
                ...year.months.map((month) =>
                  el(
                    "li",
                    null,
                    month.count
                      ? choice(month.value, month.label, month.count, month.name)
                      : el(
                          "span",
                          { class: "blog-menu-choice is-empty", "aria-hidden": "true" },
                          month.label,
                        ),
                  ),
                ),
              ),
            ),
          ),
        ),
      )
    : null;

  const feed = browse.feed
    ? el(
        "a",
        {
          class: "blog-browse-feed",
          href: browse.feed.url,
          type: browse.feed.type,
          // It opens the subscribe dialog (where the reader picks a format) once a script runs.
          title: labels.subscribe,
          "aria-label": labels.subscribe,
        },
        FEED_ICON,
      )
    : null;

  return el(
    "div",
    { class: "blog-browse" },
    browse.topics.length ? tabs : null,
    menu || feed ? el("div", { class: "blog-browse-tools" }, menu, feed) : null,
  );
}

export type { BlogNode };
