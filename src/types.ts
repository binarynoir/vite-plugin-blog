import type { MarkdownIt } from "markdown-it";

/** A tag a post may use, from the `tags` option or `tags.yml`. */
export interface TagInfo {
  name: string;
  description?: string;
}

/** A post's author, from the `authors` option or `authors.yml`. */
export interface AuthorInfo {
  name: string;
  url?: string;
}

/** A `##` or `###` heading, for a table of contents. */
export interface TocEntry {
  level: 2 | 3;
  id: string;
  /** The heading as plain text. */
  text: string;
}

/** A post as read from its Markdown file, before rendering. */
export interface PostSource {
  /** From the folder (`posts/vpn-leaks/index.md`) or file name (`posts/vpn-leaks.md`). */
  slug: string;
  /** Absolute path of the Markdown file. */
  file: string;
  /** Front matter, as written. */
  data: Record<string, unknown>;
  /** Markdown after the front matter. */
  content: string;
}

/** A rendered post. */
export interface Post {
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
  authors: AuthorInfo[];
  draft: boolean;
  /** Dated after the build's `now`. Only built with `preview`. */
  scheduled: boolean;
  featured: boolean;
  series?: string;
  /** The cover image's URL, as the page should reference it. */
  cover?: string;
  /** Front matter, as written, including fields this plugin doesn't know (`tools`, `discuss`). */
  data: Record<string, unknown>;
  /** The article body as HTML. */
  html: string;
  toc: TocEntry[];
  readingMinutes: number;
  words: number;
}

/** Context a directive renders with. */
export interface DirectiveContext {
  /** Everything after the directive's name on its opening line, trimmed. */
  args: string;
  /** A container's body, rendered to HTML. `''` for a leaf directive. */
  body: string;
  post: PostSource;
  md: MarkdownIt;
  /** Fails the build (or shows the error page in dev), naming the post. */
  error(message: string): void;
}

/**
 * A `:::` block. A **leaf** directive is one line (`::: tool check example.com`).
 * A **container** wraps Markdown until a line holding only `:::`.
 */
export interface Directive {
  kind: "leaf" | "container";
  render(context: DirectiveContext): string;
}

/** Helpers passed to the page renderers. */
export interface RenderHelpers {
  escapeHtml: (value: string) => string;
  /** A post's date for readers, in the blog's locale and time zone. */
  formatDate: (date: Date, hasTime?: boolean) => string;
  /** A `<time datetime>` value. */
  dateAttribute: (date: Date, hasTime?: boolean) => string;
  /** A `<nav>` list of the headings, or `''` when there are fewer than two. */
  renderToc: (toc: TocEntry[]) => string;
  /** The default `<head>` tags for a post. */
  renderHead: (post: Post) => string;
  /** The default article markup for a post. */
  renderArticle: (post: Post) => string;
  tags: Record<string, TagInfo>;
  /** Every published post, newest first. */
  posts: Post[];
}

/** One problem with a post, reported by file. */
export interface BlogIssue {
  file: string;
  message: string;
}

export interface BlogOptions {
  /**
   * The content folder. It holds `posts/` (one folder or `.md` file per post),
   * and optionally `tags.yml` and `authors.yml`. Relative to Vite's `root`.
   */
  dir: string;
  /** Where the blog lives on the site. Default `/blog/`. */
  base?: string;
  /** The site's origin, `https://example.com`, for canonical URLs and Open Graph tags. */
  site?: string;
  /**
   * The HTML page shell for posts, relative to Vite's `root`. It must contain
   * `<!--blog:content-->`, and may contain `<!--blog:head-->` (otherwise the
   * head tags go before `</head>`). Scripts and styles in it are bundled by
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
  /** Added after the post title in `<title>`: `" · Example"`. Default `''`. */
  titleSuffix?: string;
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
  tags?: Record<string, TagInfo>;
  /** Known authors, by id. Defaults to `authors.yml` in `dir`. */
  authors?: Record<string, AuthorInfo>;
  /** `:::` directives. `note`, `tip` and `warning` callouts are built in; a directive here with the same name replaces one. */
  directives?: Record<string, Directive>;
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
  validate?: (post: Post) => string[] | void;
  /** Replace the default markup. */
  render?: {
    /** Tags for `<!--blog:head-->`. */
    head?: (post: Post, helpers: RenderHelpers) => string;
    /** Markup for `<!--blog:content-->`. */
    article?: (post: Post, helpers: RenderHelpers) => string;
  };
}
