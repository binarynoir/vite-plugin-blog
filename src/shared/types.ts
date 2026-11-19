// Types shared by the build, `virtual:blog/*`, `search.json` and the client entries.

/** The words the default markup and components write, for translating. `{n}` is a number. */
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
  /** The index's heading when the `index` option has no title, and the first breadcrumb. */
  blog: string;
  tags: string;
  noPosts: string;
  previous: string;
  next: string;
  /** "Page {n} of {count}". */
  pageOf: string;
  /** A page number's accessible name: "Page {n}". */
  page: string;
  /** The pager's accessible name. */
  pages: string;
  /** The accessible name of the banner. */
  announcement: string;
  /** The announcements page's heading. */
  announcements: string;
  /** The banner's count badge: "{n} announcements". */
  announcementCount: string;
  /** The announcements page's description. */
  announcementsDescription: string;
  /** The banner's close button. */
  dismiss: string;
  /** The breadcrumb trail's accessible name. */
  breadcrumb: string;
  /** The eyebrow above a tag page's heading. */
  topic: string;
  /** The topic filter's accessible name. */
  topics: string;
  /** The topic filter's first link, back to every post. */
  allPosts: string;
  /** The first tab in the browse bar, back to every post: "All". */
  all: string;
  /** The date menu's button: "Date". */
  date: string;
  /** The date menu's first choice, which clears it: "Any time". */
  anyTime: string;
  /** The feed icon's accessible name: "{name} feed". */
  feed: string;
  /** A tag page's description when `tags.yml` gives none: "Posts about {tag}." */
  tagDescription: string;
  /** Card labels. */
  featured: string;
  pinned: string;
  latest: string;
  relatedPosts: string;
  /** The series navigation's heading. */
  series: string;
  /** "Part {n} of {count}". */
  seriesPart: string;
  share: string;
  /** The email share link. */
  email: string;
  copyLink: string;
  /** After a copy button is pressed. */
  copied: string;
  /** A code block's copy button. */
  copyCode: string;
  /** Before the feed links. */
  subscribe: string;
  /** The search field's label and placeholder. */
  search: string;
  /** The placeholder on a tag page: "Search {tag} posts". */
  searchTopic: string;
  sort: string;
  sortRelevance: string;
  sortNewest: string;
  sortOldest: string;
  /** A result count: "{n} posts". */
  results: string;
  resultsOne: string;
  /** A count with its query: "{results} for “{q}”". */
  resultsFor: string;
  /** A count with its date: "{results} from {date}". */
  resultsFrom: string;
  /** "No posts match “{q}”." */
  noResults: string;
  noResultsHint: string;
  clearSearch: string;
  /** On a tag page, the link that searches every post instead. */
  searchAll: string;
  searchLoading: string;
  searchFailed: string;
}

/** A tag, as the client sees it. `url` is set when the tag has a page. */
export interface BlogTagInfo {
  name: string;
  description?: string;
  url?: string;
}

/**
 * A listed post without its HTML: what `virtual:blog/posts`, `virtual:blog/latest`,
 * `search.json` and the post card use. Dates come preformatted in the blog's
 * locale and time zone, so every page shows them the same way.
 */
export interface BlogPostSummary {
  slug: string;
  /** `/blog/vpn-leaks/` */
  url: string;
  title: string;
  description: string;
  /** ISO 8601 */
  date: string;
  /** The date for readers: "December 2, 2026". */
  dateText: string;
  /** The month in the blog's time zone, `2026-12`, for the date filter. */
  month: string;
  /** A `<time datetime>` value. */
  dateTime: string;
  updated?: string;
  /** Tag ids. Names and pages are in `tags`. */
  tags: string[];
  authors: { name: string; url?: string }[];
  /** Kept at the top of lists. */
  pinned: boolean;
  featured: boolean;
  series?: string;
  /** A cover image's site path or URL, usable from any page. */
  cover?: string;
  readingMinutes: number;
  /** Front matter as written, including fields the plugin doesn't know. */
  data: Record<string, unknown>;
}

/** A post in `search.json`: its summary, minus the front matter, plus its searchable text. */
export interface BlogSearchPost extends Omit<BlogPostSummary, "data"> {
  /** `##` and `###` headings, as plain text. */
  headings: string[];
  /** The article as plain text, cut to the `search.text` limit. */
  text: string;
}

/** `{base}search.json`. */
export interface BlogSearchIndex {
  version: 1;
  tags: Record<string, BlogTagInfo>;
  /** Listed posts, newest first. */
  posts: BlogSearchPost[];
}

/** A tab in the browse bar: a topic, or every post. */
export interface BlogBrowseTopic {
  /** The tag id; absent for "All". */
  tag?: string;
  name: string;
  url: string;
  /** Listed posts. */
  count: number;
}

/** A month in the date menu. */
export interface BlogBrowseMonth {
  /** `2026-11` */
  value: string;
  /** "Nov" */
  label: string;
  /** "November 2026" */
  name: string;
  /** Posts that month; 0 shows the month greyed out. */
  count: number;
}

/** A year in the date menu, with all twelve months. */
export interface BlogBrowseYear {
  /** `2026` */
  value: string;
  count: number;
  months: BlogBrowseMonth[];
}

/**
 * The browse bar under the search field: topic tabs with counts, then the date
 * menu and the feed icon. The build writes it into the page and the client config,
 * so the static page and the Vue explorer render the same markup.
 */
export interface BlogBrowse {
  topics: BlogBrowseTopic[];
  /** Years with listed posts, newest first. Empty when search is off, since filtering needs `search.json`. */
  dates: BlogBrowseYear[];
  /** The feed the icon links to: RSS when it's on, else Atom, else JSON Feed. */
  feed?: { url: string; type: string; name: string };
}

/** How a list of posts is ordered. `relevance` only applies with a query. */
export type BlogSort = "relevance" | "newest" | "oldest";

/**
 * The JSON every blog page carries in `<script type="application/json" id="blog-config">`,
 * for the client entries. Browsers never run JSON, so a Content Security Policy allows it.
 */
export interface BlogClientConfig {
  /** `/blog/` */
  indexUrl: string;
  /** `/blog/search.json`, or absent when search is off. */
  searchUrl?: string;
  /** The tag a tag page lists, so search stays inside it. */
  tag?: string;
  tagName?: string;
  /** Results per page in search. */
  pageSize: number;
  /** The browse bar, on list pages. */
  browse?: BlogBrowse;
  labels: BlogLabels;
}

/** What `virtual:blog/posts` and `virtual:blog/latest` export besides `posts`. */
export interface BlogSiteInfo {
  /** `/blog/` */
  indexUrl: string;
  title: string;
  description: string;
  /** Feed paths that this build writes. */
  feeds: { rss?: string; atom?: string; json?: string };
  searchUrl?: string;
  labels: BlogLabels;
}
