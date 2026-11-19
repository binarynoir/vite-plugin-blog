# Changelog

## [Unreleased]

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
