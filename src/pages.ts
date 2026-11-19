import type { BlogContent, ResolvedBlogOptions } from "./content.js";
import { formatPostDate, toDateTimeAttribute, toZonedIsoDate } from "./dates.js";
import { fillLabel } from "./shared/html.js";
import {
  breadcrumbTree,
  browseTree,
  cardListTree,
  cardTree,
  pagerTree,
  searchFormTree,
  type BlogCrumb,
} from "./shared/markup.js";
import { el, toHtml } from "./shared/tree.js";
import type {
  BlogBrowse,
  BlogBrowseYear,
  BlogClientConfig,
  BlogPostSummary,
  BlogSiteInfo,
  BlogTagInfo,
} from "./shared/types.js";
import type {
  BlogLabels,
  BlogListPage,
  BlogPost,
  BlogRenderHelpers,
  BlogShareNetwork,
  BlogTocEntry,
} from "./types.js";
import { escapeHtml, isExternalUrl, joinUrl } from "./util.js";

export { fillLabel } from "./shared/html.js";

export const HEAD_MARKER = "<!--blog:head-->";
export const CONTENT_MARKER = "<!--blog:content-->";

/** Feed files under the blog's base, by kind. */
export const FEED_FILES = { rss: "feed.xml", atom: "atom.xml", json: "feed.json" } as const;
export const SITEMAP_FILE = "sitemap.xml";
export const SEARCH_FILE = "search.json";

const FEED_TYPES = {
  rss: "application/rss+xml",
  atom: "application/atom+xml",
  json: "application/feed+json",
} as const;

const FEED_NAMES = { rss: "RSS", atom: "Atom", json: "JSON Feed" } as const;

/** The feed icon on the end-of-list subscribe link, as on the browse bar. */
const FEED_ICON =
  '<svg class="blog-feeds-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M5 11a8 8 0 0 1 8 8"/><path d="M5 5a14 14 0 0 1 14 14"/><circle cx="6" cy="18" r="1.6" fill="currentColor" stroke="none"/></svg>';

const DEFAULT_SHARE: BlogShareNetwork[] = [
  "linkedin",
  "bluesky",
  "x",
  "hackernews",
  "reddit",
  "email",
];

function meta(attribute: "name" | "property", key: string, value: string | undefined): string {
  return value ? `<meta ${attribute}="${key}" content="${escapeHtml(value)}">` : "";
}

/** The feeds this build writes. None without `site`, since feeds need absolute links. */
export function enabledFeeds(options: ResolvedBlogOptions): (keyof typeof FEED_FILES)[] {
  if (!options.site || options.feeds === false) return [];
  const feeds = options.feeds ?? {};
  return (["rss", "atom", "json"] as const).filter((kind) => feeds[kind] !== false);
}

export function sitemapEnabled(options: ResolvedBlogOptions): boolean {
  return Boolean(options.site) && options.sitemap !== false;
}

export function searchEnabled(options: ResolvedBlogOptions): boolean {
  return options.search !== false;
}

/** Tags with listed posts, in `tags.yml` order, then any others by name. */
export function usedTags(content: BlogContent): string[] {
  const used = new Set(content.listed.flatMap((post) => post.tags));
  const known = Object.keys(content.tags).filter((tag) => used.has(tag));
  const others = [...used].filter((tag) => !Object.hasOwn(content.tags, tag)).sort();
  return [...known, ...others];
}

/** A path on the site without Vite's base: `/blog/`, `/blog/tag/dns/`, `/blog/tag/dns/page/2/`. */
export function listPath(
  options: ResolvedBlogOptions,
  kind: BlogListPage["kind"],
  tag?: string,
  page = 1,
): string {
  const first =
    kind === "tag"
      ? `${options.base}tag/${tag}/`
      : kind === "announcements"
        ? `${options.base}announcements/`
        : options.base;
  return page > 1 ? `${first}page/${page}/` : first;
}

/** Pinned posts first, then the rest, each newest first. */
function pinnedFirst(posts: BlogPost[]): BlogPost[] {
  return [...posts.filter((post) => post.pinned), ...posts.filter((post) => !post.pinned)];
}

/**
 * Every list page: the index, a page per used tag (unless `tagPages` is off)
 * and the announcements page when there are announcements, each split into
 * pages of `pageSize` posts.
 */
export function listPages(options: ResolvedBlogOptions, content: BlogContent): BlogListPage[] {
  const absolute = (sitePath: string) => ({
    url: joinUrl(options.siteBase, sitePath),
    canonical: options.site
      ? joinUrl(options.site, joinUrl(options.siteBase, sitePath))
      : undefined,
  });
  const lists: Omit<BlogListPage, "url" | "page" | "pageCount" | "pageUrls">[] = [
    {
      kind: "index",
      title: options.index?.title ?? options.labels.blog,
      description: options.index?.description ?? "",
      posts: pinnedFirst(content.listed),
    },
  ];
  if (options.tagPages !== false) {
    for (const tag of usedTags(content)) {
      const info = content.tags[tag];
      const title = info?.name ?? tag;
      lists.push({
        kind: "tag",
        title,
        description: info?.description ?? fillLabel(options.labels.tagDescription, { tag: title }),
        tag,
        posts: pinnedFirst(content.listed.filter((post) => post.tags.includes(tag))),
      });
    }
  }
  if (content.announcements.length) {
    lists.push({
      kind: "announcements",
      title: options.labels.announcements,
      description: options.labels.announcementsDescription,
      posts: content.announcements,
    });
  }

  const pages: BlogListPage[] = [];
  for (const list of lists) {
    const size = options.pageSize || list.posts.length || 1;
    const pageCount = Math.max(1, Math.ceil(list.posts.length / size));
    const pathFor = (page: number) => listPath(options, list.kind, list.tag, page);
    const pageUrls = Array.from({ length: pageCount }, (_, i) =>
      joinUrl(options.siteBase, pathFor(i + 1)),
    );
    for (let page = 1; page <= pageCount; page++) {
      pages.push({
        ...list,
        ...absolute(pathFor(page)),
        posts: list.posts.slice((page - 1) * size, page * size),
        page,
        pageCount,
        pageUrls,
        previousUrl: page > 1 ? pageUrls[page - 2] : undefined,
        nextUrl: page < pageCount ? pageUrls[page] : undefined,
      });
    }
  }
  return pages;
}

/** Every path the blog writes, without Vite's base, for checking links. */
export function blogPaths(options: ResolvedBlogOptions, content: BlogContent): Set<string> {
  const paths = new Set<string>();
  for (const page of listPages(options, content)) {
    paths.add(page.url.slice(options.siteBase.length - 1));
  }
  for (const post of content.posts) paths.add(`${options.base}${post.slug}/`);
  for (const kind of enabledFeeds(options)) paths.add(`${options.base}${FEED_FILES[kind]}`);
  if (sitemapEnabled(options)) paths.add(`${options.base}${SITEMAP_FILE}`);
  if (searchEnabled(options)) paths.add(`${options.base}${SEARCH_FILE}`);
  return paths;
}

/**
 * Checks each post's links to site paths. A link into the blog must reach a
 * page the blog writes; other links are checked with `isKnownPath`, when given.
 */
export function checkLinks(options: ResolvedBlogOptions, content: BlogContent): void {
  const paths = blogPaths(options, content);
  for (const [post, links] of content.links) {
    for (const { href, line } of links) {
      const where = line ? `line ${line}: ` : "";
      const report = (message: string) =>
        content.issues.push({ file: post.file, message: where + message });
      const pathname = href.split(/[?#]/)[0]!;
      if (!pathname.startsWith(options.base)) {
        if (options.isKnownPath && !options.isKnownPath(pathname)) {
          report(`link to ${href} goes nowhere`);
        }
        continue;
      }
      const normalized = pathname.replace(/\/index\.html$/, "/");
      if (paths.has(normalized) || paths.has(`${normalized}/`)) continue;
      const rest = normalized.slice(options.base.length).replace(/\/$/, "");
      const tag = /^tag\/([^/]+)$/.exec(rest)?.[1];
      const state = content.hidden.get(rest);
      if (tag) report(`link to ${href} goes nowhere: no listed post has the tag "${tag}"`);
      else if (state) report(`link to ${href} goes to a ${state} post, which isn't published yet`);
      else if (!rest.includes("/")) {
        report(`link to ${href} goes nowhere: there's no post "${rest}"`);
      } else report(`link to ${href} goes nowhere`);
    }
  }
}

function tocItems(toc: BlogTocEntry[]): string {
  return toc
    .map(
      (entry) =>
        `<li class="blog-toc-${entry.level}"><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.text)}</a></li>`,
    )
    .join("");
}

/** The table of contents as a `<nav>`, or `''` with fewer than two headings. */
export function renderToc(toc: BlogTocEntry[], title = "On this page"): string {
  if (toc.length < 2) return "";
  const name = escapeHtml(title);
  return `<nav class="blog-toc" aria-label="${name}"><p class="blog-toc-title">${name}</p><ol>${tocItems(toc)}</ol></nav>`;
}

/**
 * A JSON-LD block. Browsers never run `application/ld+json`, so a Content
 * Security Policy allows it. `<` is escaped so the data can't end the element.
 */
function jsonLd(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

/** JSON for `<script type="application/json">`, escaped the same way. */
function jsonScript(id: string, data: unknown): string {
  return `<script type="application/json" id="${id}">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

function shareUrl(
  network: BlogShareNetwork,
  url: string,
  title: string,
  mastodon?: string,
): string | undefined {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  switch (network) {
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "bluesky":
      return `https://bsky.app/intent/compose?text=${encodeURIComponent(`${title} ${url}`)}`;
    case "x":
      return `https://x.com/intent/post?text=${t}&url=${u}`;
    case "hackernews":
      return `https://news.ycombinator.com/submitlink?u=${u}&t=${t}`;
    case "reddit":
      return `https://www.reddit.com/submit?url=${u}&title=${t}`;
    case "mastodon":
      return mastodon
        ? `https://${mastodon.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/share?text=${encodeURIComponent(`${title} ${url}`)}`
        : undefined;
    case "email":
      return `mailto:?subject=${t}&body=${u}`;
  }
}

const NETWORK_NAMES: Record<Exclude<BlogShareNetwork, "email">, string> = {
  linkedin: "LinkedIn",
  bluesky: "Bluesky",
  x: "X",
  hackernews: "Hacker News",
  reddit: "Reddit",
  mastodon: "Mastodon",
};

export function createHelpers(
  options: ResolvedBlogOptions,
  content: BlogContent,
): BlogRenderHelpers {
  const labels = options.labels;
  const label = (key: keyof BlogLabels, values?: Record<string, string | number>) =>
    fillLabel(labels[key], values);
  const display = {
    locale: options.locale,
    timeZone: options.timeZone,
    dateFormat: { year: "numeric", month: "long", day: "numeric" } as const,
    timeFormat: { hour: "numeric", minute: "2-digit", timeZoneName: "short" } as const,
    dateTime: "{date} at {time}",
  };
  const formatDate = (date: Date, hasTime = false) => formatPostDate({ date, hasTime }, display);
  const dateAttribute = (date: Date, hasTime = false) =>
    toDateTimeAttribute({ date, hasTime }, options.timeZone);
  const time = (date: Date, hasTime = false) =>
    `<time datetime="${dateAttribute(date, hasTime)}">${formatDate(date, hasTime)}</time>`;
  const absolute = (sitePath: string) =>
    options.site ? joinUrl(options.site, sitePath) : undefined;

  const tags = usedTags(content);
  const tagsWithPages = new Set(options.tagPages === false ? [] : tags);
  const indexUrl = joinUrl(options.siteBase, listPath(options, "index"));
  const indexTitle = options.index?.title ?? labels.blog;
  const tagUrl = (tag: string) => joinUrl(options.siteBase, listPath(options, "tag", tag));
  const tagName = (tag: string) => content.tags[tag]?.name ?? tag;
  const announcementsUrl = content.announcements.length
    ? joinUrl(options.siteBase, listPath(options, "announcements"))
    : undefined;
  const searchUrl = searchEnabled(options)
    ? joinUrl(options.siteBase, `${options.base}${SEARCH_FILE}`)
    : undefined;
  const siteName = options.siteName;
  /** `<title>`'s ending on list pages. */
  const listSuffix = siteName ? ` · ${siteName}` : options.titleSuffix;
  const image = options.image
    ? isExternalUrl(options.image)
      ? options.image
      : absolute(joinUrl(options.siteBase, options.image))
    : undefined;

  const tagInfo: Record<string, BlogTagInfo> = {};
  for (const tag of new Set([...Object.keys(content.tags), ...tags])) {
    tagInfo[tag] = {
      name: tagName(tag),
      ...(content.tags[tag]?.description ? { description: content.tags[tag]!.description } : {}),
      ...(tagsWithPages.has(tag) ? { url: tagUrl(tag) } : {}),
    };
  }

  const summary = (post: BlogPost): BlogPostSummary => ({
    slug: post.slug,
    url: post.url,
    title: post.title,
    description: post.description,
    date: post.date.toISOString(),
    // Lists show the day alone; the post's own page shows its time.
    dateText: formatDate(post.date),
    dateTime: dateAttribute(post.date),
    month: toZonedIsoDate(post.date, options.timeZone).slice(0, 7),
    ...(post.updated ? { updated: post.updated.toISOString() } : {}),
    tags: post.tags,
    // Names and links only: an author's email stays out of client code.
    authors: post.authors.map((author) => ({
      name: author.name,
      ...(author.url ? { url: author.url } : {}),
    })),
    pinned: post.pinned,
    featured: post.featured,
    ...(post.series ? { series: post.series } : {}),
    ...(post.coverPath ? { cover: post.coverPath } : {}),
    readingMinutes: post.readingMinutes,
    data: post.data,
  });

  const adjacent = (post: BlogPost) => {
    const at = content.listed.indexOf(post);
    if (at < 0) return {};
    return { newer: content.listed[at - 1], older: content.listed[at + 1] };
  };

  const related = (post: BlogPost, limit = options.related ?? 3) =>
    limit <= 0
      ? []
      : content.listed
          .filter((other) => other !== post && other.slug !== post.slug)
          .map((other) => ({
            other,
            shared: other.tags.filter((tag) => post.tags.includes(tag)).length,
          }))
          .filter(({ shared }) => shared > 0)
          .sort((a, b) => b.shared - a.shared || b.other.date.getTime() - a.other.date.getTime())
          .slice(0, limit)
          .map(({ other }) => other);

  const series = (post: BlogPost) => {
    if (!post.series) return undefined;
    const posts = content.listed.filter((other) => other.series === post.series).reverse();
    const index = posts.findIndex((other) => other.slug === post.slug);
    return posts.length > 1 && index >= 0 ? { posts, index } : undefined;
  };

  const breadcrumbs = (target: BlogPost | BlogListPage): BlogCrumb[] => {
    const root: BlogCrumb = { name: indexTitle, url: indexUrl };
    if ("slug" in target) {
      const first = target.tags.find((tag) => tagsWithPages.has(tag));
      return [root, ...(first ? [{ name: tagName(first), url: tagUrl(first) }] : [])];
    }
    const pageCrumb = target.page > 1 ? [{ name: label("page", { n: target.page }) }] : [];
    if (target.kind === "index") return target.page > 1 ? [root, ...pageCrumb] : [];
    const first = target.pageUrls[0]!;
    return [
      root,
      target.page > 1 ? { name: target.title, url: first } : { name: target.title },
      ...pageCrumb,
    ];
  };

  const renderBreadcrumbs = (items: BlogCrumb[]) =>
    items.length ? toHtml(breadcrumbTree(items, labels)) : "";

  /** BreadcrumbList structured data, from the site's home to the page itself. */
  const breadcrumbLd = (items: BlogCrumb[], self?: { name: string; url?: string }) => {
    if (!options.site) return "";
    const trail = [
      { name: siteName ?? "Home", url: absolute(options.siteBase) },
      ...items.map((item) => ({ name: item.name, url: item.url && absolute(item.url) })),
      ...(self ? [self] : []),
    ];
    return jsonLd({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: trail.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: item.name,
        ...(item.url ? { item: item.url } : {}),
      })),
    });
  };

  const feedTitle = (options.feeds && options.feeds.title) || options.index?.title || labels.blog;
  const feedPath = (kind: keyof typeof FEED_FILES) =>
    joinUrl(options.siteBase, `${options.base}${FEED_FILES[kind]}`);
  const renderFeedLinks = () =>
    enabledFeeds(options)
      .map(
        (kind) =>
          `<link rel="alternate" type="${FEED_TYPES[kind]}" title="${escapeHtml(feedTitle)}" href="${escapeHtml(feedPath(kind))}">`,
      )
      .join("\n    ");

  /** Every feed the build writes, for the subscribe dialog. */
  const feedList = () =>
    enabledFeeds(options).map((kind) => ({
      kind,
      url: feedPath(kind),
      type: FEED_TYPES[kind],
      name: FEED_NAMES[kind],
    }));

  /**
   * One "Subscribe" link at the end of a list, to the first feed, with the formats
   * beside it. A script opens the subscribe dialog from it, where the reader picks
   * the format; without one, it opens the feed.
   */
  const renderFeedList = () => {
    const feeds = feedList();
    if (!feeds.length) return "";
    const formats = new Intl.ListFormat(options.locale, { type: "disjunction" }).format(
      feeds.map((feed) => feed.name),
    );
    const first = feeds[0]!;
    return `<p class="blog-feeds"><a class="blog-feeds-link" href="${escapeHtml(first.url)}" type="${first.type}">${FEED_ICON}<span>${escapeHtml(labels.subscribe)}</span></a><span class="blog-feeds-formats">${escapeHtml(formats)}</span></p>`;
  };

  const publisher = siteName
    ? {
        publisher: {
          "@type": "Organization",
          name: siteName,
          ...(options.site ? { url: absolute(options.siteBase) } : {}),
        },
      }
    : {};
  const indexCanonical = absolute(indexUrl);

  const renderHead = (post: BlogPost) => {
    const cardImage = post.coverUrl ?? image;
    const crumbs = breadcrumbs(post);
    return [
      `<title>${escapeHtml(post.title + options.titleSuffix)}</title>`,
      meta("name", "description", post.description),
      post.draft || post.scheduled || post.unlisted ? '<meta name="robots" content="noindex">' : "",
      post.canonical ? `<link rel="canonical" href="${escapeHtml(post.canonical)}">` : "",
      meta("property", "og:type", "article"),
      meta("property", "og:site_name", siteName),
      meta("property", "og:title", post.title),
      meta("property", "og:description", post.description),
      meta("property", "og:url", post.canonical),
      meta("property", "og:image", cardImage),
      meta("property", "article:published_time", post.date.toISOString()),
      meta("property", "article:modified_time", post.updated?.toISOString()),
      meta("property", "article:section", post.tags[0] && tagName(post.tags[0])),
      ...post.tags.map((tag) => meta("property", "article:tag", tagName(tag))),
      meta("name", "twitter:card", cardImage ? "summary_large_image" : "summary"),
      renderFeedLinks(),
      jsonLd({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        datePublished: post.date.toISOString(),
        ...(post.updated ? { dateModified: post.updated.toISOString() } : {}),
        ...(post.canonical ? { url: post.canonical, mainEntityOfPage: post.canonical } : {}),
        ...(cardImage ? { image: cardImage } : {}),
        ...(post.authors.length
          ? {
              author: post.authors.map((author) => ({
                "@type": "Person",
                name: author.name,
                ...(author.url ? { url: author.url } : {}),
              })),
            }
          : {}),
        ...publisher,
        ...(indexCanonical
          ? { isPartOf: { "@type": "Blog", name: indexTitle, url: indexCanonical } }
          : {}),
        ...(post.tags.length ? { articleSection: tagName(post.tags[0]!) } : {}),
        ...(post.tags.length ? { keywords: post.tags.map(tagName).join(", ") } : {}),
        wordCount: post.words,
      }),
      breadcrumbLd(crumbs, { name: post.title, url: post.canonical }),
    ]
      .filter(Boolean)
      .join("\n    ");
  };

  const cardPost = (post: BlogPost) => summary(post);
  const renderCard: BlogRenderHelpers["renderCard"] = (post, cardOptions = {}) =>
    toHtml(cardTree(cardPost(post), { labels, tags: tagInfo, ...cardOptions }));

  const byline = (post: BlogPost) => {
    if (!post.authors.length) return "";
    const names = post.authors.map((author) =>
      author.url
        ? `<a href="${escapeHtml(author.url)}">${escapeHtml(author.name)}</a>`
        : escapeHtml(author.name),
    );
    return `<span>${escapeHtml(labels.by)} ${names.join(", ")}</span>`;
  };

  const renderShare = (post: BlogPost) => {
    if (options.share === false || !post.canonical) return "";
    const share = options.share ?? {};
    const links = (share.networks ?? DEFAULT_SHARE)
      .map((network) => {
        const href = shareUrl(network, post.canonical!, post.title, share.mastodon);
        if (!href) return "";
        const name = network === "email" ? labels.email : NETWORK_NAMES[network];
        const external = network === "email" ? "" : ' target="_blank" rel="noopener noreferrer"';
        return `<li><a class="blog-share-link" data-network="${network}" href="${escapeHtml(href)}"${external}>${escapeHtml(name)}</a></li>`;
      })
      .join("");
    const copy = `<li><button type="button" class="blog-share-copy" data-blog-copy-link="${escapeHtml(post.canonical)}" hidden>${escapeHtml(labels.copyLink)}</button></li>`;
    return `<div class="blog-share"><p class="blog-share-title">${escapeHtml(labels.share)}</p><ul>${links}${copy}</ul></div>`;
  };

  const renderSeries = (post: BlogPost) => {
    const found = series(post);
    if (!found) return "";
    const items = found.posts
      .map((other, i) =>
        i === found.index
          ? `<li><span aria-current="page">${escapeHtml(other.title)}</span></li>`
          : `<li><a href="${escapeHtml(other.url)}">${escapeHtml(other.title)}</a></li>`,
      )
      .join("");
    const part = label("seriesPart", { n: found.index + 1, count: found.posts.length });
    return `<nav class="blog-series" aria-labelledby="blog-series-title"><p class="blog-series-title" id="blog-series-title">${escapeHtml(labels.series)} <span>${escapeHtml(part)}</span></p><ol>${items}</ol></nav>`;
  };

  const renderRelated = (post: BlogPost) => {
    const more = related(post);
    if (!more.length) return "";
    return `<section class="blog-related" aria-labelledby="blog-related-title"><h2 id="blog-related-title">${escapeHtml(labels.relatedPosts)}</h2>${toHtml(
      cardListTree(more.map(cardPost), { labels, tags: tagInfo, headingLevel: 3, cover: false }),
    )}</section>`;
  };

  const postNav = (post: BlogPost) => {
    const { newer, older } = adjacent(post);
    if (!newer && !older) return "";
    const link = (target: BlogPost, kind: "newer" | "older") =>
      `<a class="blog-post-nav-${kind}" rel="${kind === "newer" ? "prev" : "next"}" href="${escapeHtml(target.url)}"><span>${escapeHtml(labels[kind])}</span> ${escapeHtml(target.title)}</a>`;
    return `<nav class="blog-post-nav" aria-label="${escapeHtml(labels.newer)} / ${escapeHtml(labels.older)}">${
      newer ? link(newer, "newer") : ""
    }${older ? link(older, "older") : ""}</nav>`;
  };

  const monthFormat = new Intl.DateTimeFormat(options.locale, { month: "short", timeZone: "UTC" });
  const monthNameFormat = new Intl.DateTimeFormat(options.locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  /** Years with posts, newest first, each with all twelve months and their counts. */
  const dateTree = (posts: BlogPost[]): BlogBrowseYear[] => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      const month = toZonedIsoDate(post.date, options.timeZone).slice(0, 7);
      counts.set(month, (counts.get(month) ?? 0) + 1);
    }
    const years = [...new Set([...counts.keys()].map((month) => month.slice(0, 4)))]
      .sort()
      .reverse();
    return years.map((year) => {
      const months = Array.from({ length: 12 }, (_, i) => {
        const value = `${year}-${String(i + 1).padStart(2, "0")}`;
        const middle = new Date(Date.UTC(Number(year), i, 15));
        return {
          value,
          label: monthFormat.format(middle),
          name: monthNameFormat.format(middle),
          count: counts.get(value) ?? 0,
        };
      });
      return { value: year, count: months.reduce((sum, m) => sum + m.count, 0), months };
    });
  };

  const feedKind = enabledFeeds(options)[0];
  const browseFeed = feedKind
    ? { url: feedPath(feedKind), type: FEED_TYPES[feedKind], name: FEED_NAMES[feedKind] }
    : undefined;

  /** The browse bar's data for a list page: topic tabs, the date menu (with search) and the feed. */
  const browseFor = (page: BlogListPage): BlogBrowse => {
    const scope =
      page.kind === "tag" && page.tag
        ? content.listed.filter((post) => post.tags.includes(page.tag!))
        : content.listed;
    return {
      topics: tagsWithPages.size
        ? [
            { name: labels.all, url: indexUrl, count: content.listed.length },
            ...[...tagsWithPages].map((tag) => ({
              tag,
              name: tagName(tag),
              url: tagUrl(tag),
              count: content.listed.filter((post) => post.tags.includes(tag)).length,
            })),
          ]
        : [],
      dates: searchUrl ? dateTree(scope) : [],
      ...(browseFeed ? { feed: browseFeed } : {}),
    };
  };

  const renderClientConfig = (page?: BlogListPage) => {
    const config: BlogClientConfig = {
      indexUrl,
      ...(searchUrl ? { searchUrl } : {}),
      ...(page?.kind === "tag" && page.tag ? { tag: page.tag, tagName: page.title } : {}),
      pageSize: (options.search && options.search.pageSize) || 12,
      labels,
      ...(page && page.kind !== "announcements" ? { browse: browseFor(page) } : {}),
      ...(feedList().length ? { feeds: feedList(), feedTitle } : {}),
    };
    return jsonScript("blog-config", config);
  };

  const renderArticle: BlogRenderHelpers["renderArticle"] = (post, parts = {}) => {
    const postTags = toHtml(
      el(
        "ul",
        { class: "blog-tags" },
        ...post.tags.map((tag) =>
          el(
            "li",
            null,
            tagsWithPages.has(tag)
              ? el("a", { class: "blog-tag", href: tagUrl(tag) }, tagName(tag))
              : el("span", { class: "blog-tag" }, tagName(tag)),
          ),
        ),
      ),
    );
    const updated = post.updated
      ? `<span>${escapeHtml(labels.updated)} ${time(post.updated)}</span>`
      : "";
    const hasToc = post.toc.length >= 2;
    const toc = escapeHtml(labels.onThisPage);
    // Two copies of the contents: a sticky column on wide screens, and a collapsed
    // list above the article on narrow ones. The stylesheet shows one.
    const tocSide = hasToc
      ? `<aside class="blog-toc blog-toc-side"><nav aria-label="${toc}"><p class="blog-toc-title">${toc}</p><ol>${tocItems(post.toc)}</ol></nav></aside>`
      : "";
    const tocInline = hasToc
      ? `<details class="blog-toc blog-toc-inline"><summary>${toc}</summary><nav aria-label="${toc}"><ol>${tocItems(post.toc)}</ol></nav></details>`
      : "";
    const seriesNav = renderSeries(post);
    const relatedList = renderRelated(post);
    const end = [
      parts.end ?? "",
      renderShare(post),
      seriesNav,
      relatedList,
      // Newer and older posts only when there's nothing closer to read next.
      seriesNav || relatedList ? "" : postNav(post),
    ].filter(Boolean);
    return [
      renderBreadcrumbs(breadcrumbs(post)),
      `<div class="blog-layout${hasToc ? " has-toc" : ""}">`,
      '<article class="blog-post">',
      '<header class="blog-post-head">',
      `<h1>${escapeHtml(post.title)}</h1>`,
      `<p class="blog-lead">${escapeHtml(post.description)}</p>`,
      `<p class="blog-meta">${time(post.date, post.dateHasTime)}${updated}<span>${escapeHtml(label("readingTime", { n: post.readingMinutes }))}</span>${byline(post)}</p>`,
      post.tags.length ? postTags : "",
      "</header>",
      post.cover
        ? `<img class="blog-post-cover" src="${escapeHtml(post.cover)}" alt="" fetchpriority="high" decoding="async">`
        : "",
      parts.beforeBody ?? "",
      tocInline,
      `<div class="blog-prose" data-pagefind-body>\n${post.html}</div>`,
      end.length ? `<footer class="blog-post-end">\n${end.join("\n")}\n</footer>` : "",
      "</article>",
      tocSide,
      "</div>",
      renderClientConfig(),
    ]
      .filter(Boolean)
      .join("\n");
  };

  const pageOf = (page: BlogListPage) => label("pageOf", { n: page.page, count: page.pageCount });
  const listTitle = (page: BlogListPage) => {
    const title = page.kind === "index" ? page.title : `${page.title} · ${indexTitle}`;
    return page.page > 1 ? `${title} · ${pageOf(page)}` : title;
  };

  const renderListHead = (page: BlogListPage) =>
    [
      `<title>${escapeHtml(listTitle(page) + listSuffix)}</title>`,
      meta("name", "description", page.description),
      // The announcements page only repeats posts listed elsewhere.
      page.kind === "announcements" ? '<meta name="robots" content="noindex">' : "",
      page.canonical ? `<link rel="canonical" href="${escapeHtml(page.canonical)}">` : "",
      page.previousUrl ? `<link rel="prev" href="${escapeHtml(page.previousUrl)}">` : "",
      page.nextUrl ? `<link rel="next" href="${escapeHtml(page.nextUrl)}">` : "",
      meta("property", "og:type", "website"),
      meta("property", "og:site_name", siteName),
      meta("property", "og:title", listTitle(page)),
      meta("property", "og:description", page.description),
      meta("property", "og:url", page.canonical),
      meta("property", "og:image", image),
      meta("name", "twitter:card", image ? "summary_large_image" : "summary"),
      renderFeedLinks(),
      page.kind === "announcements" || !page.canonical
        ? ""
        : jsonLd({
            "@context": "https://schema.org",
            "@type": page.kind === "index" ? "Blog" : "CollectionPage",
            name: page.kind === "index" ? page.title : listTitle(page),
            ...(page.description ? { description: page.description } : {}),
            url: page.canonical,
            ...(page.kind === "index"
              ? publisher
              : indexCanonical
                ? { isPartOf: { "@type": "Blog", name: indexTitle, url: indexCanonical } }
                : {}),
            [page.kind === "index" ? "blogPost" : "hasPart"]: page.posts.map((post) => ({
              "@type": "BlogPosting",
              headline: post.title,
              url: post.canonical,
              datePublished: post.date.toISOString(),
            })),
          }),
      page.kind === "index" && page.page === 1
        ? ""
        : breadcrumbLd(
            breadcrumbs(page).filter((item) => item.url),
            {
              name: page.page > 1 ? label("page", { n: page.page }) : page.title,
              url: page.canonical,
            },
          ),
    ]
      .filter(Boolean)
      .join("\n    ");

  const renderTopics = (page?: BlogListPage) => {
    if (!tagsWithPages.size) return "";
    const current = (on: boolean) => (on ? ' aria-current="page"' : "");
    const all = `<li><a class="blog-tag" href="${escapeHtml(indexUrl)}"${current(page?.kind === "index")}>${escapeHtml(labels.allPosts)}</a></li>`;
    const links = [...tagsWithPages]
      .map(
        (tag) =>
          `<li><a class="blog-tag" href="${escapeHtml(tagUrl(tag))}"${current(page?.tag === tag)}>${escapeHtml(tagName(tag))}</a></li>`,
      )
      .join("");
    return `<nav class="blog-topics" aria-label="${escapeHtml(labels.topics)}"><ul>${all}${links}</ul></nav>`;
  };

  const renderSearch = (page: BlogListPage) =>
    searchUrl
      ? `<div class="blog-explorer" data-blog-explorer>${toHtml(
          searchFormTree({
            labels,
            indexUrl,
            query: "",
            sort: "newest",
            tagName: page.kind === "tag" ? page.title : undefined,
            interactive: false,
          }),
        )}</div>`
      : "";

  const renderBrowse = (page: BlogListPage) => {
    const browse = browseFor(page);
    if (!browse.topics.length && !browse.dates.length && !browse.feed) return "";
    const first = page.pageUrls[0]!;
    return toHtml(
      browseTree({
        browse,
        labels,
        current: page.kind === "tag" ? (page.tag ?? "") : page.kind === "index" ? "" : "-",
        date: "",
        dateHref: (date) => (date ? `${first}?date=${date}` : first),
        interactive: false,
      }),
    );
  };

  /** The search form and the browse bar, in the explorer's mount point (or the bar alone without search). */
  const renderExplorer = (page: BlogListPage) => {
    if (!searchUrl) return renderBrowse(page);
    const form = toHtml(
      searchFormTree({
        labels,
        indexUrl,
        query: "",
        sort: "newest",
        tagName: page.kind === "tag" ? page.title : undefined,
        interactive: false,
      }),
    );
    return `<div class="blog-explorer" data-blog-explorer>${form}${renderBrowse(page)}</div>`;
  };

  const renderPager = (page: BlogListPage) =>
    toHtml(
      pagerTree({
        page: page.page,
        pageCount: page.pageCount,
        href: (n) => page.pageUrls[n - 1]!,
        labels,
      }),
    );

  const renderList: BlogRenderHelpers["renderList"] = (page, parts = {}) => {
    const eyebrow =
      parts.eyebrow ??
      (page.kind === "index"
        ? (options.index?.eyebrow ?? siteName)
        : page.kind === "tag"
          ? labels.topic
          : indexTitle);
    const lead = parts.lead ?? page.description;
    // The index's first page features a post marked `featured: true`, or else
    // the first one: a pinned post, or the newest.
    const featured =
      page.kind === "index" && page.page === 1 && page.posts.length > 1
        ? (page.posts.find((post) => post.featured) ?? page.posts[0])
        : undefined;
    const rest = page.posts.filter((post) => post !== featured);
    const listName = page.kind === "announcements" ? labels.announcements : labels.allPosts;
    const cards = rest.length
      ? `<section class="blog-list-posts" aria-labelledby="blog-posts-title"><h2 id="blog-posts-title" class="blog-visually-hidden">${escapeHtml(listName)}</h2>${toHtml(
          cardListTree(rest.map(cardPost), {
            labels,
            tags: tagInfo,
            headingLevel: featured ? 3 : 2,
          }),
        )}</section>`
      : "";
    return [
      `<div class="blog-list" data-kind="${page.kind}">`,
      renderBreadcrumbs(breadcrumbs(page)),
      '<header class="blog-list-head">',
      eyebrow ? `<p class="blog-eyebrow">${escapeHtml(eyebrow)}</p>` : "",
      `<h1>${escapeHtml(page.title)}</h1>`,
      lead ? `<p class="blog-lead">${escapeHtml(lead)}</p>` : "",
      "</header>",
      page.kind === "announcements" ? "" : renderExplorer(page),
      searchUrl && page.kind !== "announcements"
        ? '<div class="blog-results-slot" data-blog-results></div>'
        : "",
      '<div class="blog-static" data-blog-static>',
      featured
        ? toHtml(
            cardTree(cardPost(featured), {
              labels,
              tags: tagInfo,
              headingLevel: 2,
              featured: true,
              label: featured.featured ? labels.featured : labels.latest,
            }),
          )
        : "",
      cards,
      page.posts.length ? "" : `<p class="blog-empty">${escapeHtml(labels.noPosts)}</p>`,
      renderPager(page),
      "</div>",
      parts.end ?? "",
      renderFeedList(),
      renderClientConfig(page),
      "</div>",
    ]
      .filter(Boolean)
      .join("\n");
  };

  return {
    escapeHtml,
    formatDate,
    dateAttribute,
    label,
    labels,
    indexUrl,
    tagUrl,
    announcementsUrl,
    usedTags: tags,
    adjacent,
    related,
    series,
    summary,
    tagInfo,
    breadcrumbs,
    siteName,
    searchUrl,
    renderToc: (toc) => renderToc(toc, labels.onThisPage),
    renderBreadcrumbs,
    renderCard,
    renderPager,
    renderShare,
    renderSeries,
    renderRelated,
    renderTopics,
    renderSearch,
    renderBrowse,
    renderExplorer,
    renderFeedList,
    renderClientConfig,
    renderHead,
    renderArticle,
    renderListHead,
    renderList,
    renderFeedLinks,
    tags: content.tags,
    posts: content.listed,
  };
}

/** Fills the page shell: head tags at `<!--blog:head-->` (or before `</head>`), the body at `<!--blog:content-->`. */
export function fillTemplate(template: string, head: string, body: string): string {
  const withHead = template.includes(HEAD_MARKER)
    ? template.replace(HEAD_MARKER, () => head)
    : template.replace(/<\/head>/i, () => `  ${head}\n  </head>`);
  return withHead.replace(CONTENT_MARKER, () => body);
}

export function renderPostPage(
  template: string,
  post: BlogPost,
  options: ResolvedBlogOptions,
  helpers: BlogRenderHelpers,
): string {
  const head = options.render?.head?.(post, helpers) ?? helpers.renderHead(post);
  const article = options.render?.article?.(post, helpers) ?? helpers.renderArticle(post);
  return fillTemplate(template, head, article);
}

export function renderListPage(
  template: string,
  page: BlogListPage,
  options: ResolvedBlogOptions,
  helpers: BlogRenderHelpers,
): string {
  const head = options.render?.listHead?.(page, helpers) ?? helpers.renderListHead(page);
  const body = options.render?.list?.(page, helpers) ?? helpers.renderList(page);
  return fillTemplate(template, head, body);
}

/** What `virtual:blog/posts` and `virtual:blog/latest` export besides `posts`. */
export function siteInfo(options: ResolvedBlogOptions, helpers: BlogRenderHelpers): BlogSiteInfo {
  const feeds: BlogSiteInfo["feeds"] = {};
  for (const kind of enabledFeeds(options)) {
    feeds[kind] = joinUrl(options.siteBase, `${options.base}${FEED_FILES[kind]}`);
  }
  return {
    indexUrl: helpers.indexUrl,
    title: options.index?.title ?? options.labels.blog,
    description: options.index?.description ?? "",
    feeds,
    feedTitle:
      (options.feeds && options.feeds.title) || options.index?.title || options.labels.blog,
    ...(helpers.searchUrl ? { searchUrl: helpers.searchUrl } : {}),
    labels: options.labels,
  };
}
