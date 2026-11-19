import type { BlogContent, ResolvedBlogOptions } from "./content.js";
import { formatPostDate, toDateTimeAttribute } from "./dates.js";
import type { Post, RenderHelpers, TocEntry } from "./types.js";
import { escapeHtml } from "./util.js";

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
    const tags = post.tags
      .map((tag) => `<li class="tag">${escapeHtml(content.tags[tag]?.name ?? tag)}</li>`)
      .join("");
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

  return {
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
