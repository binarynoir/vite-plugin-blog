import type { BlogContent, ResolvedBlogOptions } from "./content.js";
import { formatPostDate, toDateTimeAttribute } from "./dates.js";
import type { ListPage, Post, RenderHelpers, TocEntry } from "./types.js";
import { escapeHtml, joinUrl } from "./util.js";

export const HEAD_MARKER = "<!--blog:head-->";
export const CONTENT_MARKER = "<!--blog:content-->";

function meta(attribute: "name" | "property", key: string, value: string | undefined): string {
  return value ? `<meta ${attribute}="${key}" content="${escapeHtml(value)}">` : "";
}

export function renderToc(toc: TocEntry[]): string {
  if (toc.length < 2) return "";
  const items = toc
    .map(
      (entry) =>
        `<li class="toc-${entry.level}"><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.text)}</a></li>`,
    )
    .join("");
  return `<nav class="toc" aria-label="On this page"><p class="toc-title">On this page</p><ol>${items}</ol></nav>`;
}

/** Tags with published posts, in `tags.yml` order, then any others by name. */
export function usedTags(content: BlogContent): string[] {
  const used = new Set(content.posts.flatMap((post) => post.tags));
  const known = Object.keys(content.tags).filter((tag) => used.has(tag));
  const others = [...used].filter((tag) => !Object.hasOwn(content.tags, tag)).sort();
  return [...known, ...others];
}

/** A path on the site without Vite's base: the index is `/blog/`, a tag `/blog/tag/dns/`. */
export function listPath(options: ResolvedBlogOptions, tag?: string): string {
  return tag ? `${options.base}tag/${tag}/` : options.base;
}

/** The index, then a page per used tag (unless `tagPages` is off). */
export function listPages(options: ResolvedBlogOptions, content: BlogContent): ListPage[] {
  const page = (sitePath: string) => ({
    url: joinUrl(options.siteBase, sitePath),
    canonical: options.site
      ? joinUrl(options.site, joinUrl(options.siteBase, sitePath))
      : undefined,
  });
  const pages: ListPage[] = [
    {
      kind: "index",
      ...page(listPath(options)),
      title: options.index?.title ?? "Blog",
      description: options.index?.description ?? "",
      posts: content.posts,
    },
  ];
  if (options.tagPages === false) return pages;
  for (const tag of usedTags(content)) {
    const info = content.tags[tag];
    pages.push({
      kind: "tag",
      ...page(listPath(options, tag)),
      title: info?.name ?? tag,
      description: info?.description ?? "",
      tag,
      posts: content.posts.filter((post) => post.tags.includes(tag)),
    });
  }
  return pages;
}

export function createHelpers(options: ResolvedBlogOptions, content: BlogContent): RenderHelpers {
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

  const tags = usedTags(content);
  const indexUrl = joinUrl(options.siteBase, listPath(options));
  const tagUrl = (tag: string) => joinUrl(options.siteBase, listPath(options, tag));
  /** A tag as a list item, linked to its page when tag pages are on. */
  const tagItem = (tag: string) => {
    const name = escapeHtml(content.tags[tag]?.name ?? tag);
    return options.tagPages === false
      ? `<li class="tag">${name}</li>`
      : `<li class="tag"><a href="${escapeHtml(tagUrl(tag))}">${name}</a></li>`;
  };

  const renderHead = (post: Post) =>
    [
      `<title>${escapeHtml(post.title + options.titleSuffix)}</title>`,
      meta("name", "description", post.description),
      post.draft || post.scheduled ? '<meta name="robots" content="noindex">' : "",
      post.canonical ? `<link rel="canonical" href="${escapeHtml(post.canonical)}">` : "",
      meta("property", "og:type", "article"),
      meta("property", "og:title", post.title),
      meta("property", "og:description", post.description),
      meta("property", "og:url", post.canonical),
      meta("property", "article:published_time", post.date.toISOString()),
      meta("property", "article:modified_time", post.updated?.toISOString()),
      ...post.tags.map((tag) => meta("property", "article:tag", content.tags[tag]?.name ?? tag)),
    ]
      .filter(Boolean)
      .join("\n    ");

  const renderArticle = (post: Post) => {
    const tags = post.tags.map(tagItem).join("");
    const updated = post.updated
      ? ` · Updated <time datetime="${dateAttribute(post.updated)}">${formatDate(post.updated)}</time>`
      : "";
    return [
      '<article class="post">',
      '<header class="post-header">',
      `<h1>${escapeHtml(post.title)}</h1>`,
      `<p class="post-description">${escapeHtml(post.description)}</p>`,
      `<p class="post-meta"><time datetime="${dateAttribute(post.date, post.dateHasTime)}">${formatDate(post.date, post.dateHasTime)}</time>${updated} · ${post.readingMinutes} min read</p>`,
      tags ? `<ul class="post-tags">${tags}</ul>` : "",
      "</header>",
      renderToc(post.toc),
      `<div class="prose" data-pagefind-body>\n${post.html}</div>`,
      "</article>",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const indexTitle = options.index?.title ?? "Blog";

  const renderListHead = (page: ListPage) => {
    const title = page.kind === "index" ? page.title : `${page.title} · ${indexTitle}`;
    return [
      `<title>${escapeHtml(title + options.titleSuffix)}</title>`,
      meta("name", "description", page.description),
      page.canonical ? `<link rel="canonical" href="${escapeHtml(page.canonical)}">` : "",
      meta("property", "og:type", "website"),
      meta("property", "og:title", title),
      meta("property", "og:description", page.description),
      meta("property", "og:url", page.canonical),
    ]
      .filter(Boolean)
      .join("\n    ");
  };

  const renderList = (page: ListPage) => {
    const items = page.posts
      .map((post) => {
        const postTags = post.tags.map(tagItem).join("");
        return [
          '<li class="post-item">',
          `<h2><a href="${escapeHtml(post.url)}">${escapeHtml(post.title)}</a></h2>`,
          `<p class="post-meta"><time datetime="${dateAttribute(post.date, post.dateHasTime)}">${formatDate(post.date, post.dateHasTime)}</time> · ${post.readingMinutes} min read</p>`,
          `<p class="post-description">${escapeHtml(post.description)}</p>`,
          postTags ? `<ul class="post-tags">${postTags}</ul>` : "",
          "</li>",
        ]
          .filter(Boolean)
          .join("");
      })
      .join("\n");
    const tagLinks =
      options.tagPages === false
        ? ""
        : tags
            .map((tag) => {
              const current = page.tag === tag ? ' aria-current="page"' : "";
              return `<li><a href="${escapeHtml(tagUrl(tag))}"${current}>${escapeHtml(content.tags[tag]?.name ?? tag)}</a></li>`;
            })
            .join("");
    return [
      `<section class="post-list" aria-labelledby="post-list-title">`,
      `<h1 id="post-list-title">${escapeHtml(page.title)}</h1>`,
      page.description
        ? `<p class="post-list-description">${escapeHtml(page.description)}</p>`
        : "",
      tagLinks ? `<nav class="post-list-tags" aria-label="Tags"><ul>${tagLinks}</ul></nav>` : "",
      items
        ? `<ul class="post-items">\n${items}\n</ul>`
        : '<p class="post-list-empty">No posts yet.</p>',
      "</section>",
    ]
      .filter(Boolean)
      .join("\n");
  };

  return {
    indexUrl,
    tagUrl,
    usedTags: tags,
    renderListHead,
    renderList,
    escapeHtml,
    formatDate,
    dateAttribute,
    renderToc,
    renderHead,
    renderArticle,
    tags: content.tags,
    posts: content.posts,
  };
}

/** Fills the page shell: head tags at `<!--blog:head-->` (or before `</head>`), the article at `<!--blog:content-->`. */
export function fillTemplate(template: string, head: string, article: string): string {
  const withHead = template.includes(HEAD_MARKER)
    ? template.replace(HEAD_MARKER, () => head)
    : template.replace(/<\/head>/i, () => `  ${head}\n  </head>`);
  return withHead.replace(CONTENT_MARKER, () => article);
}

export function renderPostPage(
  template: string,
  post: Post,
  options: ResolvedBlogOptions,
  helpers: RenderHelpers,
): string {
  const head = options.render?.head?.(post, helpers) ?? helpers.renderHead(post);
  const article = options.render?.article?.(post, helpers) ?? helpers.renderArticle(post);
  return fillTemplate(template, head, article);
}

export function renderListPage(
  template: string,
  page: ListPage,
  options: ResolvedBlogOptions,
  helpers: RenderHelpers,
): string {
  const head = options.render?.listHead?.(page, helpers) ?? helpers.renderListHead(page);
  const body = options.render?.list?.(page, helpers) ?? helpers.renderList(page);
  return fillTemplate(template, head, body);
}

/** The data `virtual:blog/posts` exports: everything but the HTML. */
export function postSummaries(posts: Post[]) {
  return posts.map((post) => ({
    slug: post.slug,
    url: post.url,
    title: post.title,
    description: post.description,
    date: post.date.toISOString(),
    updated: post.updated?.toISOString(),
    tags: post.tags,
    authors: post.authors,
    featured: post.featured,
    series: post.series,
    readingMinutes: post.readingMinutes,
    data: post.data,
  }));
}
