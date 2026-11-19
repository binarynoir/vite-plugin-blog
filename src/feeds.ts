import { readFileSync } from "node:fs";
import path from "node:path";
import type { ResolvedBlogOptions } from "./content.js";
import type { BlogPost } from "./types.js";
import { escapeHtml, joinUrl } from "./util.js";

const PACKAGE = "@binarynoir/vite-plugin-blog";

const IMAGE_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

/** What the feeds share: the blog's own details and how to make a post's HTML stand alone. */
export interface FeedContext {
  options: ResolvedBlogOptions & { site: string };
  title: string;
  description: string;
  /** The index's absolute URL. */
  home: string;
  /** A post's article as HTML with absolute links and image addresses, for feed readers. */
  articleHtml: (post: BlogPost) => string;
  /** The newest moment any post was published or updated. */
  updated: Date;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

/** `<![CDATA[...]]>`, split where the text itself holds `]]>`. */
function cdata(value: string): string {
  return `<![CDATA[${value.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

/**
 * Makes a post's HTML readable away from the site: each local image points at
 * the file the build wrote for it (or, for an image small enough that Vite
 * inlined it, a data URI), and links to site paths become absolute.
 */
export function standaloneHtml(
  post: BlogPost,
  site: string,
  siteBase: string,
  imageUrl: (file: string) => string | undefined,
  renderedUrl: (file: string) => string,
): string {
  let html = post.html;
  for (const file of post.images) {
    const rendered = escapeHtml(renderedUrl(file));
    const built = imageUrl(file);
    let target: string;
    if (built) target = joinUrl(site, joinUrl(siteBase, built));
    else {
      const type = IMAGE_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
      target = `data:${type};base64,${readFileSync(file).toString("base64")}`;
    }
    html = html.split(`src="${rendered}"`).join(`src="${escapeHtml(target)}"`);
  }
  return html.replace(
    /\s(href|src)="(\/(?!\/)[^"]*)"/g,
    (_match, attribute: string, url: string) => ` ${attribute}="${escapeHtml(joinUrl(site, url))}"`,
  );
}

function feedPosts(posts: BlogPost[], context: FeedContext): BlogPost[] {
  const feeds = context.options.feeds || {};
  return posts.slice(0, feeds.limit ?? 20);
}

function withContent(context: FeedContext): boolean {
  const feeds = context.options.feeds || {};
  return feeds.content !== false;
}

function feedUrl(context: FeedContext, file: string): string {
  const { options } = context;
  return joinUrl(options.site, joinUrl(options.siteBase, `${options.base}${file}`));
}

/** RSS 2.0, with the whole article in `content:encoded`. */
export function renderRss(posts: BlogPost[], context: FeedContext, file: string): string {
  const items = feedPosts(posts, context).map((post) => {
    const lines = [
      `<title>${escapeXml(post.title)}</title>`,
      `<link>${escapeXml(post.canonical!)}</link>`,
      `<guid isPermaLink="true">${escapeXml(post.canonical!)}</guid>`,
      `<pubDate>${post.date.toUTCString()}</pubDate>`,
      `<description>${escapeXml(post.description)}</description>`,
      withContent(context)
        ? `<content:encoded>${cdata(context.articleHtml(post))}</content:encoded>`
        : "",
      ...post.authors.map(
        (author) =>
          `<dc:creator>${escapeXml(author.email ? `${author.email} (${author.name})` : author.name)}</dc:creator>`,
      ),
      ...post.tags.map((tag) => `<category>${escapeXml(tag)}</category>`),
      post.coverUrl ? `<media:content url="${escapeXml(post.coverUrl)}" medium="image" />` : "",
    ];
    return `    <item>\n${lines
      .filter(Boolean)
      .map((line) => `      ${line}`)
      .join("\n")}\n    </item>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">',
    "  <channel>",
    `    <title>${escapeXml(context.title)}</title>`,
    `    <link>${escapeXml(context.home)}</link>`,
    `    <description>${escapeXml(context.description || context.title)}</description>`,
    `    <atom:link href="${escapeXml(feedUrl(context, file))}" rel="self" type="application/rss+xml" />`,
    `    <language>${escapeXml(context.options.locale)}</language>`,
    `    <lastBuildDate>${context.updated.toUTCString()}</lastBuildDate>`,
    `    <generator>${PACKAGE}</generator>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

/** Atom 1.0, with the whole article as HTML content. */
export function renderAtom(posts: BlogPost[], context: FeedContext, file: string): string {
  const entries = feedPosts(posts, context).map((post) => {
    const lines = [
      `<title>${escapeXml(post.title)}</title>`,
      `<link rel="alternate" type="text/html" href="${escapeXml(post.canonical!)}" />`,
      `<id>${escapeXml(post.canonical!)}</id>`,
      `<published>${post.date.toISOString()}</published>`,
      `<updated>${(post.updated ?? post.date).toISOString()}</updated>`,
      `<summary>${escapeXml(post.description)}</summary>`,
      withContent(context)
        ? `<content type="html">${escapeXml(context.articleHtml(post))}</content>`
        : "",
      ...post.authors.map(
        (author) =>
          `<author><name>${escapeXml(author.name)}</name>${author.url ? `<uri>${escapeXml(author.url)}</uri>` : ""}${author.email ? `<email>${escapeXml(author.email)}</email>` : ""}</author>`,
      ),
      ...post.tags.map((tag) => `<category term="${escapeXml(tag)}" />`),
    ];
    return `  <entry>\n${lines
      .filter(Boolean)
      .map((line) => `    ${line}`)
      .join("\n")}\n  </entry>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${escapeXml(context.options.locale)}">`,
    `  <title>${escapeXml(context.title)}</title>`,
    context.description ? `  <subtitle>${escapeXml(context.description)}</subtitle>` : "",
    `  <link rel="alternate" type="text/html" href="${escapeXml(context.home)}" />`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(feedUrl(context, file))}" />`,
    `  <id>${escapeXml(context.home)}</id>`,
    `  <updated>${context.updated.toISOString()}</updated>`,
    `  <generator>${PACKAGE}</generator>`,
    ...entries,
    "</feed>",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** JSON Feed 1.1. */
export function renderJsonFeed(posts: BlogPost[], context: FeedContext, file: string): string {
  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: context.title,
    home_page_url: context.home,
    feed_url: feedUrl(context, file),
    ...(context.description ? { description: context.description } : {}),
    language: context.options.locale,
    items: feedPosts(posts, context).map((post) => ({
      id: post.canonical,
      url: post.canonical,
      title: post.title,
      summary: post.description,
      ...(withContent(context) ? { content_html: context.articleHtml(post) } : {}),
      ...(post.coverUrl ? { image: post.coverUrl } : {}),
      date_published: post.date.toISOString(),
      ...(post.updated ? { date_modified: post.updated.toISOString() } : {}),
      ...(post.authors.length
        ? { authors: post.authors.map((author) => ({ name: author.name, url: author.url })) }
        : {}),
      tags: post.tags,
    })),
  };
  return `${JSON.stringify(feed, null, 2)}\n`;
}

/** A sitemap of the blog's pages, each with its last change where known. */
export function renderSitemap(pages: { url: string; lastModified?: Date }[]): string {
  const urls = pages.map(
    ({ url, lastModified }) =>
      `  <url><loc>${escapeXml(url)}</loc>${lastModified ? `<lastmod>${lastModified.toISOString()}</lastmod>` : ""}</url>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
