import type { MarkdownIt } from "markdown-it";

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
}

/** The words the default markup writes, for translating. `{n}` is a number. */
export interface BlogLabels {
  /** Reading time: "{n} min read". */
  readingTime: string;
  /** Before an updated date: "Updated". */
  updated: string;
  /** Before the authors: "By". */
  by: string;
  onThisPage: string;
  newer: string;
  older: string;
  /** The index's heading when the `index` option has no title. */
  blog: string;
  tags: string;
  noPosts: string;
  previous: string;
  next: string;
  /** "Page {n} of {count}". */
  pageOf: string;
  /** The accessible name of the banner, and the announcements page's heading. */
  announcement: string;
  announcements: string;
  /** The banner's count badge: "{n} announcements". */
  announcementCount: string;
  /** The banner's close button. */
  dismiss: string;
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
  /** A `<nav>` list of the headings, or `''` when there are fewer than two. */
  renderToc: (toc: BlogTocEntry[]) => string;
  /** The default `<head>` tags for a post. */
  renderHead: (post: BlogPost) => string;
  /** The default article markup for a post. */
  renderArticle: (post: BlogPost) => string;
  /** The default `<head>` tags for a list page. */
  renderListHead: (page: BlogListPage) => string;
  /** The default markup for a list page. */
  renderList: (page: BlogListPage) => string;
  /** `<link rel="alternate">` tags for the feeds, or `''` without any. */
  renderFeedLinks: () => string;
  tags: Record<string, BlogTag>;
  /** Every listed post, newest first. */
  posts: BlogPost[];
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
  /** Added after the title in `<title>`: `" · Example"`. Default `''`. */
  titleSuffix?: string;
  /** The index's heading and description. Default `{ title: labels.blog, description: "" }`. */
  index?: { title?: string; description?: string };
  /** Write a page per tag at `{base}tag/{tag}/`. Default `true`. */
  tagPages?: boolean;
  /** Posts per list page; later pages are at `.../page/2/`. `0` puts every post on one page. Default 0. */
  pageSize?: number;
  /** Feeds, or `false` for none. Default: all three, when `site` is set. */
  feeds?: false | BlogFeedOptions;
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
