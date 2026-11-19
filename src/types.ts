import type { MarkdownIt } from "markdown-it";
import type { BlogCrumb } from "./shared/markup.js";
import type { BlogLabels, BlogPostSummary, BlogTagInfo } from "./shared/types.js";

export type {
  BlogClientConfig,
  BlogLabels,
  BlogPostSummary,
  BlogSearchIndex,
  BlogSearchPost,
  BlogSiteInfo,
  BlogSort,
  BlogTagInfo,
} from "./shared/types.js";
export type { BlogCrumb } from "./shared/markup.js";

/** A tag a post may use, from the `tags` option or `tags.yml`. */
export interface BlogTag {
  name: string;
  description?: string;
}

/** A post's author, from the `authors` option or `authors.yml`. */
export interface BlogAuthor {
  name: string;
  /** Linked from the author's name. */
  url?: string;
  /** Written into the feeds when set. */
  email?: string;
}

/** A `##` or `###` heading, for a table of contents. */
export interface BlogTocEntry {
  level: 2 | 3;
  id: string;
  /** The heading as plain text. */
  text: string;
}

/** A post as read from its Markdown file, before rendering. */
export interface BlogPostSource {
  /** From the folder (`posts/vpn-leaks/index.md`) or file name (`posts/vpn-leaks.md`). */
  slug: string;
  /** Absolute path of the Markdown file. */
  file: string;
  /** Front matter, as written. */
  data: Record<string, unknown>;
  /** Markdown after the front matter. */
  content: string;
}

/** A post's place in the announcement banner. */
export interface BlogAnnouncement {
  /** The banner's text: the `announcement` string, or the post's title. */
  text: string;
  /** After this moment the banner stops showing the post. */
  until?: Date;
}

/** A rendered post. */
export interface BlogPost {
  slug: string;
  /** Path on the site, with Vite's `base`: `/blog/vpn-leaks/`. */
  url: string;
  /** Absolute URL, when the `site` option is set. */
  canonical?: string;
  file: string;
  title: string;
  description: string;
  date: Date;
  /** Whether the front matter gave a time, so a date alone is never shown with "12:00 AM". */
  dateHasTime: boolean;
  updated?: Date;
  tags: string[];
  authors: BlogAuthor[];
  draft: boolean;
  /** Dated after the build's `now`. Only built with `preview`. */
  scheduled: boolean;
  /** Built and linkable, but left out of lists, feeds, the sitemap and the banner. */
  unlisted: boolean;
  /** Kept at the top of the index and tag pages. */
  pinned: boolean;
  featured: boolean;
  series?: string;
  /** The cover image's URL, as the post's own page should reference it. */
  cover?: string;
  /** The cover image's absolute URL, for social cards and feeds, when the `site` option is set. */
  coverUrl?: string;
  /** The cover image's address from any page (a site path or a URL), for cards in lists. */
  coverPath?: string;
  /** Local images the post shows, as absolute paths. */
  images: string[];
  /** Set when the post is in the announcement banner. */
  announcement?: BlogAnnouncement;
  /** Front matter, as written, including fields this plugin doesn't know (`tools`, `discuss`). */
  data: Record<string, unknown>;
  /** The article body as HTML. */
  html: string;
  toc: BlogTocEntry[];
  readingMinutes: number;
  words: number;
}

/** Context a directive renders with. */
export interface BlogDirectiveContext {
  /** Everything after the directive's name on its opening line, trimmed. */
  args: string;
  /** A container's body, rendered to HTML. `''` for a leaf directive. */
  body: string;
  post: BlogPostSource;
  md: MarkdownIt;
  /** Fails the build (or shows the error overlay in dev), naming the post and line. */
  error(message: string): void;
}

/**
 * A `:::` block. A **leaf** directive is one line (`::: tool check example.com`).
 * A **container** wraps Markdown until a line holding only `:::`.
 */
export interface BlogDirective {
  kind: "leaf" | "container";
  render(context: BlogDirectiveContext): string;
}

/** The index (`/blog/`), a tag's page (`/blog/tag/dns/`) or the announcements (`/blog/announcements/`). */
export interface BlogListPage {
  kind: "index" | "tag" | "announcements";
  /** Path on the site, with Vite's `base`: `/blog/tag/dns/`, or `/blog/tag/dns/page/2/`. */
  url: string;
  /** Absolute URL, when the `site` option is set. */
  canonical?: string;
  title: string;
  description: string;
  /** The tag id, on a tag page. */
  tag?: string;
  /** This page's posts: pinned first, then newest first. */
  posts: BlogPost[];
  /** 1 for the first page. */
  page: number;
  pageCount: number;
  /** The previous and next pages' paths, when the list has more than one page. */
  previousUrl?: string;
  nextUrl?: string;
  /** Every page's path, in order: `pageUrls[0]` is page 1. */
  pageUrls: string[];
}

/** Helpers passed to the page renderers. */
export interface BlogRenderHelpers {
  escapeHtml: (value: string) => string;
  /** A date for readers, in the blog's locale and time zone. */
  formatDate: (date: Date, hasTime?: boolean) => string;
  /** A `<time datetime>` value. */
  dateAttribute: (date: Date, hasTime?: boolean) => string;
  /** A label with `{n}` (and `{count}`) filled in. */
  label: (key: keyof BlogLabels, values?: Record<string, string | number>) => string;
  labels: BlogLabels;
  /** The index's path: `/blog/`. */
  indexUrl: string;
  /** A tag page's path: `/blog/tag/dns/`. Tags without listed posts have no page. */
  tagUrl: (tag: string) => string;
  /** The announcements page's path, when any post is an announcement. */
  announcementsUrl?: string;
  /** Tags with at least one listed post, by id, in `tags.yml` order. */
  usedTags: string[];
  /** The listed posts before and after this one, by date. */
  adjacent: (post: BlogPost) => { newer?: BlogPost; older?: BlogPost };
  /** Up to `limit` listed posts sharing the most tags with this one, newest first among equals. */
  related: (post: BlogPost, limit?: number) => BlogPost[];
  /** The post's series, oldest first, and where the post is in it. `undefined` outside a series. */
  series: (post: BlogPost) => { posts: BlogPost[]; index: number } | undefined;
  /** A post as the client sees it (`virtual:blog/posts`, cards): no HTML, dates preformatted. */
  summary: (post: BlogPost) => BlogPostSummary;
  /** Tags with a name and, when they have a page, its `url`. */
  tagInfo: Record<string, BlogTagInfo>;
  /** The trail above a post or list page, without the page itself for a post. */
  breadcrumbs: (target: BlogPost | BlogListPage) => BlogCrumb[];
  /** The site's name, from the `siteName` option. */
  siteName?: string;
  /** `search.json`'s path, when search is on. */
  searchUrl?: string;
  /** A `<nav>` list of the headings, or `''` when there are fewer than two. */
  renderToc: (toc: BlogTocEntry[]) => string;
  /** A breadcrumb `<nav>`. */
  renderBreadcrumbs: (items: BlogCrumb[]) => string;
  /** A post as a card. */
  renderCard: (
    post: BlogPost,
    options?: { headingLevel?: 2 | 3 | 4; label?: string | false; featured?: boolean },
  ) => string;
  /** Numbered page links for a list, or `''` for one page. */
  renderPager: (page: BlogListPage) => string;
  /** The share links and "Copy link" button, or `''` without `site` or with `share: false`. */
  renderShare: (post: BlogPost) => string;
  /** The post's series, or `''`. */
  renderSeries: (post: BlogPost) => string;
  /** Related posts as cards, or `''`. */
  renderRelated: (post: BlogPost) => string;
  /** The topic filter: "All posts" and a link per tag page. */
  renderTopics: (page?: BlogListPage) => string;
  /** The search form the Vue explorer mounts over, or `''` with search off. */
  renderSearch: (page: BlogListPage) => string;
  /** "Subscribe: RSS · Atom · JSON Feed", or `''` without feeds. */
  renderFeedList: () => string;
  /** The `#blog-config` JSON the client entries read. */
  renderClientConfig: (page?: BlogListPage) => string;
  /** The default `<head>` tags for a post. */
  renderHead: (post: BlogPost) => string;
  /**
   * The default article markup for a post. `parts.end` goes first in the
   * article's footer (a call to action), `parts.beforeBody` between the header
   * and the body.
   */
  renderArticle: (post: BlogPost, parts?: { beforeBody?: string; end?: string }) => string;
  /** The default `<head>` tags for a list page. */
  renderListHead: (page: BlogListPage) => string;
  /**
   * The default markup for a list page. `parts` replaces the eyebrow or lead
   * line, or adds markup after the list.
   */
  renderList: (
    page: BlogListPage,
    parts?: { eyebrow?: string; lead?: string; end?: string },
  ) => string;
  /** `<link rel="alternate">` tags for the feeds, or `''` without any. */
  renderFeedLinks: () => string;
  tags: Record<string, BlogTag>;
  /** Every listed post, newest first. */
  posts: BlogPost[];
}

/** Where the share links go. */
export type BlogShareNetwork =
  "linkedin" | "bluesky" | "x" | "hackernews" | "reddit" | "mastodon" | "email";

/** `{base}search.json` and the explorer's settings. */
export interface BlogSearchOptions {
  /** Most characters of each article's text in the index. `0` indexes titles, descriptions, tags and headings only. Default 3000. */
  text?: number;
  /** Results per page. Default 12. */
  pageSize?: number;
}

/** One problem with a post, reported by file. */
export interface BlogIssue {
  file: string;
  message: string;
}

/** Feeds of the newest listed posts, written under the blog's `base`. They need the `site` option. */
export interface BlogFeedOptions {
  /** RSS 2.0 at `{base}feed.xml`. Default `true`. */
  rss?: boolean;
  /** Atom at `{base}atom.xml`. Default `true`. */
  atom?: boolean;
  /** JSON Feed 1.1 at `{base}feed.json`. Default `true`. */
  json?: boolean;
  /** Most posts in each feed. Default 20. */
  limit?: number;
  /** Default: the index's title. */
  title?: string;
  /** Default: the index's description. */
  description?: string;
  /** Put each post's whole article in the feeds, not only its description. Default `true`. */
  content?: boolean;
  /**
   * Which pages link the feeds from `<head>`, so browsers and feed readers find
   * them. `"blog"` (the default): the blog's pages. `"site"`: every page Vite builds.
   */
  discovery?: "blog" | "site";
}

/** The banner across the top of every page for posts marked `announcement`. */
export interface BlogAnnouncementOptions {
  /**
   * Where the banner goes. `"body"` (the default) puts it first in `<body>`, on
   * every page Vite builds. `"marker"` puts it only where a page has
   * `<!--blog:announcement-->`.
   */
  placement?: "body" | "marker";
  /** Which pages get the banner, by their path (`/`, `/blog/`, `/pricing/`). Default: all. */
  include?: (path: string) => boolean;
  /** Add the default stylesheet. `false` keeps only the rule that hides a dismissed banner. Default `true`. */
  styles?: boolean;
  /** The `localStorage` key that holds dismissed announcements. Default `blog-announcements-dismissed`. */
  storageKey?: string;
}

export interface BlogOptions {
  /**
   * The content folder. It holds `posts/` (one folder or `.md` file per post),
   * and optionally `tags.yml` and `authors.yml`. Relative to Vite's `root`.
   */
  dir: string;
  /** Where the blog lives on the site. Default `/blog/`. */
  base?: string;
  /**
   * The site's origin, `https://example.com`. Canonical URLs, social cards,
   * feeds and the sitemap need it.
   */
  site?: string;
  /**
   * The HTML page shell for every blog page, relative to Vite's `root`. It must
   * contain `<!--blog:content-->`, and may contain `<!--blog:head-->` (otherwise
   * the head tags go before `</head>`). Scripts and styles in it are bundled by
   * Vite as in any other page.
   */
  template: string;
  /** Include drafts and scheduled posts, with `noindex`. Default `false`. */
  preview?: boolean;
  /** What "now" is when deciding whether a post is scheduled. Default: the build's start. */
  now?: Date;
  /** IANA time zone for dates without an offset, and for showing dates. Default `UTC`. */
  timeZone?: string;
  /** For showing dates. Default `en-US`. */
  locale?: string;
  /** Default 230. */
  wordsPerMinute?: number;
  /** Added after a post's title in `<title>`: `" · Example Blog"`. Default `''`. */
  titleSuffix?: string;
  /**
   * The site's name: `og:site_name`, the publisher in structured data, and the
   * end of list pages' titles ("DNS · Blog · Example"). Without it, list pages
   * use `titleSuffix` too.
   */
  siteName?: string;
  /**
   * A social card image for list pages and for posts without a cover: a site
   * path (`/og.png`) or a URL. Needs `site` for a path.
   */
  image?: string;
  /**
   * The index's heading, description and eyebrow (the small line above the
   * heading). Default `{ title: labels.blog, description: "", eyebrow: siteName }`.
   */
  index?: { title?: string; description?: string; eyebrow?: string };
  /** Write a page per tag at `{base}tag/{tag}/`. Default `true`. */
  tagPages?: boolean;
  /** Posts per list page; later pages are at `.../page/2/`. `0` puts every post on one page. Default 0. */
  pageSize?: number;
  /** Feeds, or `false` for none. Default: all three, when `site` is set. */
  feeds?: false | BlogFeedOptions;
  /** `{base}search.json` for the search on list pages, or `false` for none. Default on. */
  search?: false | BlogSearchOptions;
  /** How many posts `virtual:blog/latest` exports. Default 6. */
  latest?: number;
  /**
   * Share links at the end of each post (they need `site`), or `false` for none.
   * Plain links: no scripts, no tracking, nothing loads from the networks.
   * Default `["linkedin", "bluesky", "x", "hackernews", "reddit", "email"]`.
   */
  share?: false | { networks?: BlogShareNetwork[]; mastodon?: string };
  /** Most related posts at the end of a post. `0` for none. Default 3. */
  related?: number;
  /** A sitemap of the blog's pages at `{base}sitemap.xml`. Default `true`, when `site` is set. */
  sitemap?: boolean;
  /** The announcement banner, or `false` for none. Default: on, when a post is an announcement. */
  announcements?: false | BlogAnnouncementOptions;
  /** Words the default markup writes. */
  labels?: Partial<BlogLabels>;
  /** Front matter limits. */
  limits?: {
    /** Longest title, in characters. Default 70. */
    title?: number;
    /** Longest description, in characters. Default 160. */
    description?: number;
    /** Fewest tags a post may have. Default 0. */
    minTags?: number;
    /** Most tags a post may have. Default no limit. */
    maxTags?: number;
  };
  /**
   * The only tags posts may use. Defaults to `tags.yml` in `dir`; without it,
   * any tag is allowed.
   */
  tags?: Record<string, BlogTag>;
  /** Known authors, by id. Defaults to `authors.yml` in `dir`. */
  authors?: Record<string, BlogAuthor>;
  /** An author id for posts that don't name one. */
  defaultAuthor?: string;
  /** `:::` directives. `note`, `tip` and `warning` callouts are built in; one here with the same name replaces it. */
  directives?: Record<string, BlogDirective>;
  /** Code highlighting with Shiki, or `false` for plain `<pre>`. */
  highlight?:
    | false
    | {
        /** Default `{ light: "github-light", dark: "github-dark" }`. */
        themes?: { light: string; dark: string };
        /** Prefix for the generated color classes. Default `sk-`. */
        classPrefix?: string;
      };
  /** Change the markdown-it instance: add plugins, rules or options. */
  markdown?: (md: MarkdownIt) => void;
  /**
   * Whether a link to a site page outside the blog points at a real page. Links
   * between posts are always checked. Without this, other links aren't.
   */
  isKnownPath?: (path: string) => boolean;
  /** Extra checks for a post. Return messages to fail the build. */
  validate?: (post: BlogPost) => string[] | void;
  /** Replace the default markup. */
  render?: {
    /** Tags for `<!--blog:head-->` on a post. */
    head?: (post: BlogPost, helpers: BlogRenderHelpers) => string;
    /** Markup for `<!--blog:content-->` on a post. */
    article?: (post: BlogPost, helpers: BlogRenderHelpers) => string;
    /** Head tags for the list pages. */
    listHead?: (page: BlogListPage, helpers: BlogRenderHelpers) => string;
    /** Markup for the list pages. */
    list?: (page: BlogListPage, helpers: BlogRenderHelpers) => string;
  };
}
