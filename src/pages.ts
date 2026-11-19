import type { BlogContent, ResolvedBlogOptions } from "./content.js";
import { formatPostDate, toDateTimeAttribute } from "./dates.js";
import type {
  BlogLabels,
  BlogListPage,
  BlogPost,
  BlogRenderHelpers,
  BlogTocEntry,
} from "./types.js";
import { escapeHtml, joinUrl } from "./util.js";

export const HEAD_MARKER = "<!--blog:head-->";
export const CONTENT_MARKER = "<!--blog:content-->";

/** Feed files under the blog's base, by kind. */
export const FEED_FILES = { rss: "feed.xml", atom: "atom.xml", json: "feed.json" } as const;
export const SITEMAP_FILE = "sitemap.xml";

const FEED_TYPES = {
  rss: "application/rss+xml",
  atom: "application/atom+xml",
  json: "application/feed+json",
} as const;

function meta(attribute: "name" | "property", key: string, value: string | undefined): string {
  return value ? `<meta ${attribute}="${key}" content="${escapeHtml(value)}">` : "";
}

/** A label with its `{n}` and `{count}` filled in. */
export function fillLabel(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
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
  const lists: Omit<BlogListPage, "url" | "page" | "pageCount">[] = [
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
      lists.push({
        kind: "tag",
        title: info?.name ?? tag,
        description: info?.description ?? "",
        tag,
        posts: pinnedFirst(content.listed.filter((post) => post.tags.includes(tag))),
      });
    }
  }
  if (content.announcements.length) {
    lists.push({
      kind: "announcements",
      title: options.labels.announcements,
      description: "",
      posts: content.announcements,
    });
  }

  const pages: BlogListPage[] = [];
  for (const list of lists) {
    const size = options.pageSize || list.posts.length || 1;
    const pageCount = Math.max(1, Math.ceil(list.posts.length / size));
    const pathFor = (page: number) => listPath(options, list.kind, list.tag, page);
    for (let page = 1; page <= pageCount; page++) {
      pages.push({
        ...list,
        ...absolute(pathFor(page)),
        posts: list.posts.slice((page - 1) * size, page * size),
        page,
        pageCount,
        previousUrl: page > 1 ? joinUrl(options.siteBase, pathFor(page - 1)) : undefined,
        nextUrl: page < pageCount ? joinUrl(options.siteBase, pathFor(page + 1)) : undefined,
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

export function renderToc(toc: BlogTocEntry[], title = "On this page"): string {
  if (toc.length < 2) return "";
  const items = toc
    .map(
      (entry) =>
        `<li class="toc-${entry.level}"><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.text)}</a></li>`,
    )
    .join("");
  const name = escapeHtml(title);
  return `<nav class="toc" aria-label="${name}"><p class="toc-title">${name}</p><ol>${items}</ol></nav>`;
}

/**
 * A JSON-LD block. Browsers never run `application/ld+json`, so a Content
 * Security Policy allows it. `<` is escaped so the data can't end the element.
 */
function jsonLd(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

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
  const readingTime = (post: BlogPost) =>
    escapeHtml(label("readingTime", { n: post.readingMinutes }));

  const tags = usedTags(content);
  const tagsWithPages = new Set(options.tagPages === false ? [] : tags);
  const indexUrl = joinUrl(options.siteBase, listPath(options, "index"));
  const tagUrl = (tag: string) => joinUrl(options.siteBase, listPath(options, "tag", tag));
  const announcementsUrl = content.announcements.length
    ? joinUrl(options.siteBase, listPath(options, "announcements"))
    : undefined;
  /** A tag as a list item, linked when it has a page. */
  const tagItem = (tag: string) => {
    const name = escapeHtml(content.tags[tag]?.name ?? tag);
    return tagsWithPages.has(tag)
      ? `<li class="tag"><a href="${escapeHtml(tagUrl(tag))}">${name}</a></li>`
      : `<li class="tag">${name}</li>`;
  };

  const adjacent = (post: BlogPost) => {
    const at = content.listed.indexOf(post);
    if (at < 0) return {};
    return { newer: content.listed[at - 1], older: content.listed[at + 1] };
  };

  const feedTitle = (options.feeds && options.feeds.title) || options.index?.title || labels.blog;
  const renderFeedLinks = () =>
    enabledFeeds(options)
      .map((kind) => {
        const href = joinUrl(options.siteBase, `${options.base}${FEED_FILES[kind]}`);
        return `<link rel="alternate" type="${FEED_TYPES[kind]}" title="${escapeHtml(feedTitle)}" href="${escapeHtml(href)}">`;
      })
      .join("\n    ");

  const renderHead = (post: BlogPost) =>
    [
      `<title>${escapeHtml(post.title + options.titleSuffix)}</title>`,
      meta("name", "description", post.description),
      post.draft || post.scheduled || post.unlisted ? '<meta name="robots" content="noindex">' : "",
      post.canonical ? `<link rel="canonical" href="${escapeHtml(post.canonical)}">` : "",
      meta("property", "og:type", "article"),
      meta("property", "og:title", post.title),
      meta("property", "og:description", post.description),
      meta("property", "og:url", post.canonical),
      meta("property", "og:image", post.coverUrl),
      meta("property", "article:published_time", post.date.toISOString()),
      meta("property", "article:modified_time", post.updated?.toISOString()),
      ...post.tags.map((tag) => meta("property", "article:tag", content.tags[tag]?.name ?? tag)),
      meta("name", "twitter:card", post.coverUrl ? "summary_large_image" : "summary"),
      renderFeedLinks(),
      jsonLd({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.description,
        datePublished: post.date.toISOString(),
        ...(post.updated ? { dateModified: post.updated.toISOString() } : {}),
        ...(post.canonical ? { url: post.canonical, mainEntityOfPage: post.canonical } : {}),
        ...(post.coverUrl ? { image: post.coverUrl } : {}),
        ...(post.authors.length
          ? {
              author: post.authors.map((author) => ({
                "@type": "Person",
                name: author.name,
                ...(author.url ? { url: author.url } : {}),
              })),
            }
          : {}),
        ...(post.tags.length
          ? { keywords: post.tags.map((tag) => content.tags[tag]?.name ?? tag).join(", ") }
          : {}),
        wordCount: post.words,
      }),
    ]
      .filter(Boolean)
      .join("\n    ");

  const byline = (post: BlogPost) => {
    if (!post.authors.length) return "";
    const names = post.authors.map((author) =>
      author.url
        ? `<a href="${escapeHtml(author.url)}">${escapeHtml(author.name)}</a>`
        : escapeHtml(author.name),
    );
    return ` · ${escapeHtml(labels.by)} ${names.join(", ")}`;
  };

  const postNav = (post: BlogPost) => {
    const { newer, older } = adjacent(post);
    if (!newer && !older) return "";
    const link = (target: BlogPost, kind: "newer" | "older") =>
      `<a class="post-nav-${kind}" rel="${kind === "newer" ? "prev" : "next"}" href="${escapeHtml(target.url)}"><span>${escapeHtml(labels[kind])}</span> ${escapeHtml(target.title)}</a>`;
    return `<nav class="post-nav" aria-label="${escapeHtml(labels.newer)} / ${escapeHtml(labels.older)}">${
      newer ? link(newer, "newer") : ""
    }${older ? link(older, "older") : ""}</nav>`;
  };

  const renderArticle = (post: BlogPost) => {
    const postTags = post.tags.map(tagItem).join("");
    const updated = post.updated ? ` · ${escapeHtml(labels.updated)} ${time(post.updated)}` : "";
    return [
      '<article class="post">',
      '<header class="post-header">',
      `<h1>${escapeHtml(post.title)}</h1>`,
      `<p class="post-description">${escapeHtml(post.description)}</p>`,
      `<p class="post-meta">${time(post.date, post.dateHasTime)}${updated} · ${readingTime(post)}${byline(post)}</p>`,
      postTags ? `<ul class="post-tags">${postTags}</ul>` : "",
      "</header>",
      renderToc(post.toc, labels.onThisPage),
      `<div class="prose" data-pagefind-body>\n${post.html}</div>`,
      postNav(post),
      "</article>",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const indexTitle = options.index?.title ?? labels.blog;
  const pageOf = (page: BlogListPage) => label("pageOf", { n: page.page, count: page.pageCount });
  const listTitle = (page: BlogListPage) => {
    const title = page.kind === "index" ? page.title : `${page.title} · ${indexTitle}`;
    return page.page > 1 ? `${title} · ${pageOf(page)}` : title;
  };

  const renderListHead = (page: BlogListPage) =>
    [
      `<title>${escapeHtml(listTitle(page) + options.titleSuffix)}</title>`,
      meta("name", "description", page.description),
      // The announcements page only repeats posts listed elsewhere.
      page.kind === "announcements" ? '<meta name="robots" content="noindex">' : "",
      page.canonical ? `<link rel="canonical" href="${escapeHtml(page.canonical)}">` : "",
      page.previousUrl ? `<link rel="prev" href="${escapeHtml(page.previousUrl)}">` : "",
      page.nextUrl ? `<link rel="next" href="${escapeHtml(page.nextUrl)}">` : "",
      meta("property", "og:type", "website"),
      meta("property", "og:title", listTitle(page)),
      meta("property", "og:description", page.description),
      meta("property", "og:url", page.canonical),
      renderFeedLinks(),
    ]
      .filter(Boolean)
      .join("\n    ");

  const renderList = (page: BlogListPage) => {
    const items = page.posts
      .map((post) => {
        const postTags = post.tags.map(tagItem).join("");
        return [
          `<li class="post-item${post.pinned ? " pinned" : ""}">`,
          `<h2><a href="${escapeHtml(post.url)}">${escapeHtml(post.title)}</a></h2>`,
          `<p class="post-meta">${time(post.date, post.dateHasTime)} · ${readingTime(post)}</p>`,
          `<p class="post-description">${escapeHtml(post.description)}</p>`,
          postTags ? `<ul class="post-tags">${postTags}</ul>` : "",
          "</li>",
        ]
          .filter(Boolean)
          .join("");
      })
      .join("\n");
    const tagLinks = [...tagsWithPages]
      .map((tag) => {
        const current = page.tag === tag ? ' aria-current="page"' : "";
        return `<li><a href="${escapeHtml(tagUrl(tag))}"${current}>${escapeHtml(content.tags[tag]?.name ?? tag)}</a></li>`;
      })
      .join("");
    const pager =
      page.pageCount > 1
        ? `<nav class="post-pages" aria-label="${escapeHtml(pageOf(page))}">${
            page.previousUrl
              ? `<a rel="prev" href="${escapeHtml(page.previousUrl)}">${escapeHtml(labels.previous)}</a>`
              : ""
          }<span>${escapeHtml(pageOf(page))}</span>${
            page.nextUrl
              ? `<a rel="next" href="${escapeHtml(page.nextUrl)}">${escapeHtml(labels.next)}</a>`
              : ""
          }</nav>`
        : "";
    return [
      `<section class="post-list" aria-labelledby="post-list-title">`,
      `<h1 id="post-list-title">${escapeHtml(page.title)}</h1>`,
      page.description
        ? `<p class="post-list-description">${escapeHtml(page.description)}</p>`
        : "",
      tagLinks
        ? `<nav class="post-list-tags" aria-label="${escapeHtml(labels.tags)}"><ul>${tagLinks}</ul></nav>`
        : "",
      items
        ? `<ul class="post-items">\n${items}\n</ul>`
        : `<p class="post-list-empty">${escapeHtml(labels.noPosts)}</p>`,
      pager,
      "</section>",
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
    renderToc: (toc) => renderToc(toc, labels.onThisPage),
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

/** What `virtual:blog/posts` exports for each listed post: everything but the HTML. */
export function postSummaries(posts: BlogPost[]) {
  return posts.map((post) => ({
    slug: post.slug,
    url: post.url,
    title: post.title,
    description: post.description,
    date: post.date.toISOString(),
    updated: post.updated?.toISOString(),
    tags: post.tags,
    authors: post.authors,
    pinned: post.pinned,
    featured: post.featured,
    series: post.series,
    readingMinutes: post.readingMinutes,
    data: post.data,
  }));
}
