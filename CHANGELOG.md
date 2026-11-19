# Changelog

## [Unreleased]

## [0.4.0] - 2026-11-19

### Changed

- The default markup uses `blog-*` class names throughout, so it can't collide with a site's own (`.card`, `.tag`, `.prose`). For example: `post` is now `blog-post`, `prose` is `blog-prose`, `toc` is `blog-toc`, and `post-list` is `blog-list`. The README lists every class. Classes inside posts (`code-block`, `callout`, `heading-anchor`) are unchanged.
- List pages show posts as cards (`blog-card`), with the first page of the index featuring a `featured: true` post or else the newest. The pager is numbered.
- List pages' titles end with `siteName` when it's set ("DNS · Blog · Example"); otherwise with `titleSuffix`, as before.
- Tag pages without a description in `tags.yml` get one from the `tagDescription` label.
- `virtual:blog/posts` no longer includes authors' emails, and each post carries `dateText`, `dateTime` and `cover` for cards.
- A tag entry in `tags.yml` with unknown fields fails the build. This catches descriptions cut short by unquoted commas in `{ name: …, description: … }`.

### Added

- **Search.** `{base}search.json` holds every listed post's summary, headings and text (up to `search.text` characters, default 3000). List pages carry a search form. The `/vue` explorer ranks results, sorts and pages them, keeps its state in the address, and loads the index only when the field is first used. Turn it off with `search: false`.
- **Topics:** list pages link "All posts" and each tag page, with the current one marked.
- **Breadcrumbs** on posts and on tag, announcement and later list pages, with `BreadcrumbList` structured data from the site's home.
- **Structured data and social cards:** `Blog` on the index and `CollectionPage` on tag pages, plus `publisher`, `isPartOf` and `articleSection` on posts. `siteName` and `image` options set `og:site_name` and a fallback share card.
- **End of post:** share links (`share`, no scripts or tracking) and a "Copy link" button, the whole series with the current part marked, and related posts by shared tags (`related`, default 3). Newer and older links show only when there's neither series nor related posts. `renderArticle(post, { end })` adds your own call to action first.
- **Feed links** on every list page ("Subscribe: RSS · Atom · JSON Feed"), and `feeds.discovery: "site"` to link the feeds from every page's `<head>`.
- `virtual:blog/latest`, the newest `latest` posts (default 6), for a home page. Both virtual modules also export `tags` and `blog` (index address, feeds, labels).
- `@binarynoir/vite-plugin-blog/runtime`: framework-free search, sorting, paging and address-state functions, the shared markup as element trees, and `enhanceBlogPage()` (code copy buttons, "Copy link", and a highlight on the contents link for the section being read).
- `@binarynoir/vite-plugin-blog/vue`: `BlogPostCard`, `BlogPostList`, `BlogPager`, `BlogExplorer` and `mountBlogExplorer()`. They render the same markup as the static pages. `vue` is an optional peer dependency.
- `@binarynoir/vite-plugin-blog/styles.css`: default styles for all of it, themed with `--blog-*` custom properties, at zero specificity.
- Helpers: `related`, `series`, `summary`, `tagInfo`, `breadcrumbs`, `siteName`, `searchUrl`, `renderBreadcrumbs`, `renderCard`, `renderPager`, `renderShare`, `renderSeries`, `renderRelated`, `renderTopics`, `renderSearch`, `renderFeedList` and `renderClientConfig`. List pages have `pageUrls`, and posts have `coverPath`.
- New labels for all of the above, and `htmlToText` is exported.

## [0.3.0] - 2026-11-19

### Changed

- **Breaking:** the plugin is now the named export `blogPlugin`, as in the other BinaryNoir Vite plugins; the `blog` and default exports are gone. Types carry a `Blog` prefix: `BlogPost`, `BlogTag`, `BlogAuthor`, `BlogDirective`, `BlogListPage`, `BlogRenderHelpers` and so on.
- `virtual:blog/posts` lists only listed posts, and each has `pinned`.

### Added

- An announcement banner across every page Vite builds, for posts with `announcement: true`, a text, or `{ text, until }`. It counts the other announcements, links to a new `/blog/announcements/` page, remembers when it was closed, and hides before the page draws, with no inline code. Settings under `announcements`.
- RSS 2.0, Atom and JSON Feed 1.1 feeds with whole articles and absolute image addresses, linked from every blog page's `<head>`. Settings under `feeds`; they need `site`.
- A sitemap at `{base}sitemap.xml`.
- `pinned`, `unlisted` and per-author `email` in front matter, and a `defaultAuthor` option.
- `pageSize` splits lists into pages at `.../page/2/`, with `rel="prev"` and `rel="next"`.
- Newer and older post links at the end of the default article, and a byline with the authors.
- A cover's copy at a fixed address for `og:image`, `twitter:card` and the feeds, and `BlogPosting` structured data in the default head.
- `labels` to translate or reword the default markup, with `DEFAULT_LABELS`.
- Helpers: `label`, `labels`, `adjacent`, `announcementsUrl` and `renderFeedLinks`.

## [0.2.0] - 2026-11-19

- An index page at the blog's `base` and a page per tag at `{base}tag/{tag}/`, both from the same page shell, with their own head tags. Turn tag pages off with `tagPages: false`, and set the index's heading and description with `index`.
- `render.list` and `render.listHead` replace the index and tag page markup; helpers gain `indexUrl`, `tagUrl`, `usedTags`, `renderList` and `renderListHead`.
- Tags in the default post markup link to their tag pages.
- Links to the index and to tag pages are checked: a link to a tag no published post uses fails the build.

## [0.1.0]

- First release: Markdown posts as static HTML pages in your own page shell, with front
  matter checks, drafts and scheduled posts, build-time Shiki highlighting as classes,
  `:::` directives with built-in callouts, image sizes, link checks between posts, live
  reload in dev and a `virtual:blog/posts` module.
