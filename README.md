# vite-plugin-blog

[![npm version](https://img.shields.io/npm/v/@binarynoir/vite-plugin-blog.svg)](https://www.npmjs.com/package/@binarynoir/vite-plugin-blog)
[![CI](https://github.com/binarynoir/vite-plugin-blog/actions/workflows/ci.yml/badge.svg)](https://github.com/binarynoir/vite-plugin-blog/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@binarynoir/vite-plugin-blog.svg)](LICENSE)

A static Markdown blog for any [Vite](https://vite.dev) site, without a second framework.
Each post becomes a plain HTML page built from your own page shell, so your header,
scripts, styles and `transformIndexHtml` plugins apply to posts like to every other page.

[![Support me on Buy Me a Coffee](https://img.shields.io/badge/Support%20me-Buy%20Me%20a%20Coffee-orange?style=for-the-badge&logo=buy-me-a-coffee)](https://buymeacoffee.com/binarynoir)
[![Support me on Ko-fi](https://img.shields.io/badge/Support%20me-Ko--fi-blue?style=for-the-badge&logo=ko-fi)](https://ko-fi.com/binarynoir)
[![More tools](https://img.shields.io/badge/Website-binarynoir.tech-8c8c8c?style=for-the-badge)](https://binarynoir.tech)

## What this does

- **Posts are HTML in the page source.** A post reads with no JavaScript.
- **Works under a strict Content Security Policy.** Nothing the plugin writes needs an
  inline script or `style` attribute. Code is highlighted with
  [Shiki](https://shiki.style) at build time, as classes, and the announcement banner's
  script and styles are files.
- **Checks every post.** The build fails, naming the file and line, on a missing or
  too-long title or description, a bad date, a tag not in `tags.yml`, an image without alt
  text or without a file, or a link to a page that doesn't exist (or to a draft).
- **Lists:** an index at `/blog/`, a page per tag, pinned posts first, and pages of
  `pageSize` posts at `.../page/2/`.
- **An announcement banner** across every page of the site for posts marked
  `announcement`, with a count of the others, a close button that remembers, and an
  optional end date.
- **RSS, Atom and JSON feeds** with whole articles and absolute image addresses, and a
  sitemap.
- **Social cards and search data:** Open Graph tags, a stable `og:image` for the cover,
  and `BlogPosting` structured data.
- **Drafts, scheduled and unlisted posts.** Drafts and future dates stay out of the
  build unless `preview` is on. Unlisted posts are built but appear in no list or feed.
- **`:::` directives.** `note`, `tip` and `warning` callouts are built in. Add your own,
  such as a live widget inside a post.
- **Images** next to the post go through Vite (hashed and copied), with `width` and
  `height` set so the page doesn't shift, and `loading="lazy"` after the first.
- **Live reload in dev**, with problems shown in Vite's error overlay.
- **`virtual:blog/posts`** lists posts for the rest of the site, such as a "Latest posts"
  strip on the home page.

## How it compares

|                                    | This plugin              | A docs framework (VitePress, Ox Content) | Markdown-to-HTML plugins            |
| ---------------------------------- | ------------------------ | ---------------------------------------- | ----------------------------------- |
| Your existing Vite site and markup | Yes, your own page shell | No, its theme and router                 | A template, outside Vite's pipeline |
| Works under `script-src 'self'`    | Yes                      | Depends on the theme                     | Often inline scripts                |
| Fails the build on broken posts    | Yes, by file and line    | Dead links only                          | No                                  |
| Tags, pages, feeds, sitemap        | Built in                 | Built in or by plugin                    | Feeds and sitemap at most           |
| Site-wide announcement banner      | Built in, no inline code | By plugin or theme                       | No                                  |

If your site is a docs site, use a docs framework (and
[@binarynoir/vitepress-blog](https://github.com/binarynoir/vitepress-blog) for VitePress).
This plugin is for sites that are already plain Vite pages.

## Install

```sh
npm install --save-dev @binarynoir/vite-plugin-blog
```

Needs Node 22 or later and Vite 6, 7 or 8.

## Usage

```text
content/
  posts/
    vpn-leaks/
      index.md        # served at /blog/vpn-leaks/
      diagram.svg     # images sit next to the post
    short-post.md     # served at /blog/short-post/
  tags.yml            # optional: the only tags allowed
  authors.yml         # optional
templates/
  post.html           # your page shell
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { blogPlugin } from "@binarynoir/vite-plugin-blog";

export default defineConfig({
  plugins: [
    blogPlugin({
      dir: "content",
      template: "templates/post.html",
      site: "https://example.com",
      titleSuffix: " · Example",
      preview: process.env.BLOG_PREVIEW === "1",
    }),
  ],
});
```

The page shell is any HTML page with two markers, used for posts and lists alike. Use
root paths (`/src/post.ts`) in it, since pages are served from `/blog/{slug}/`. Leave out
`<title>`; the plugin writes it.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <!--blog:head-->
  </head>
  <body>
    <main><!--blog:content--></main>
    <script type="module" src="/src/post.ts"></script>
  </body>
</html>
```

```ts
// src/post.ts
import "virtual:blog/code.css"; // the highlighting classes the posts use
```

For types, add `"@binarynoir/vite-plugin-blog/client"` to `types` in `tsconfig.json`.

### Front matter

```yaml
title: Is your VPN actually working? # required, 70 characters at most
description: The four leaks to test. # required, 160 characters at most
date: 2026-12-02 # required; a future date schedules the post
updated: 2026-12-10
tags: [vpn-privacy, homelab]
authors: [jane] # ids from authors.yml
series: building-it
cover: cover.png # also the social card image
pinned: true # kept at the top of lists
featured: true # for your own markup
unlisted: true # built, but in no list, feed or sitemap
draft: false
announcement: true # or the banner's text, or { text, until }
```

Fields the plugin doesn't know (`tools`, `discuss`) are kept in `post.data`, for your own
checks and markup.

```yaml
# authors.yml
jane: { name: Jane Doe, url: https://example.com/jane, email: jane@example.com }
```

### Light and dark code

Highlighting uses CSS `light-dark()`, so it follows the page's `color-scheme`. Set
`color-scheme: light dark` on `:root`, and `color-scheme: dark` or `light` when your
theme switch picks one.

## Announcements

`announcement` puts a post in a banner across the top of every page Vite builds, the
site's own pages included:

```yaml
announcement: true # the banner shows the post's title
announcement: Scheduled maintenance on Friday, 18:00 UTC
announcement:
  text: Early pricing ends Friday
  until: 2026-12-04 # the end of that day, in the blog's time zone; or a date and time
```

- **The newest one shows.** With more than one, a badge counts them and links to
  `/blog/announcements/`, which lists them all.
- **Visitors can close it.** The close button dismisses every current announcement, and
  the browser remembers. A newer announcement brings the banner back.
- **No flash on load.** A small script in `<head>` hides a dismissed banner before the
  page draws. It is a file, not inline, so `script-src 'self'` allows it.
- **Ending.** After `until`, the banner stops showing it, at once in the browser and from
  the next build on. A daily scheduled build keeps the HTML in step.

| Option                     | Default                        | What it does                                                                |
| -------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `announcements.placement`  | `"body"`                       | `"body"`: first in `<body>`. `"marker"`: only at `<!--blog:announcement-->` |
| `announcements.include`    | every page                     | `(path) => boolean`, by the page's path: `/`, `/pricing/`                   |
| `announcements.styles`     | `true`                         | `false` keeps only the rule that hides a dismissed banner                   |
| `announcements.storageKey` | `blog-announcements-dismissed` | The `localStorage` key                                                      |

`announcements: false` turns the banner off. Restyle it with `--blog-announcement-bg` and
`--blog-announcement-color`, or your own rules for `.blog-announcement`,
`.blog-announcement-text`, `.blog-announcement-count` and `.blog-announcement-dismiss`.
The default rules have zero specificity, so yours win.

## Feeds and sitemap

With `site` set, the build writes `/blog/feed.xml` (RSS 2.0), `/blog/atom.xml` and
`/blog/feed.json` (JSON Feed 1.1), each with the newest 20 listed posts and their whole
articles, plus `/blog/sitemap.xml`. Every blog page links the feeds from its `<head>`, and
`renderFeedLinks()` gives you the same tags for other pages. Dev serves them too.

```ts
feeds: { rss: true, atom: false, json: true, limit: 50, content: false },
sitemap: false,
```

## Options

| Option           | Default                | What it does                                                                   |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `dir`            | (required)             | The content folder, relative to Vite's `root` or absolute                      |
| `template`       | (required)             | The page shell, relative to Vite's `root`                                      |
| `base`           | `/blog/`               | Where the blog lives on the site                                               |
| `site`           |                        | The site's origin. Canonical URLs, social cards, feeds and the sitemap need it |
| `preview`        | `false`                | Also build drafts and scheduled posts, with `noindex`                          |
| `now`            | build time             | What "now" is when deciding whether a post is scheduled                        |
| `timeZone`       | `UTC`                  | For dates without an offset, and for showing dates                             |
| `locale`         | `en-US`                | For showing dates, and the feeds' language                                     |
| `wordsPerMinute` | `230`                  | For reading time                                                               |
| `titleSuffix`    | `''`                   | Added after the title in `<title>`                                             |
| `index`          | `{ title: "Blog" }`    | The index's heading and description: `{ title, description }`                  |
| `tagPages`       | `true`                 | Write a page per tag in use at `{base}tag/{tag}/`                              |
| `pageSize`       | `0`                    | Posts per list page; `0` puts them all on one                                  |
| `feeds`          | all three, with `site` | `{ rss, atom, json, limit, title, description, content }`, or `false`          |
| `sitemap`        | `true`, with `site`    | `{base}sitemap.xml`                                                            |
| `announcements`  | on                     | The banner's settings (above), or `false`                                      |
| `labels`         | English                | The words the default markup writes (below)                                    |
| `limits`         |                        | `{ title: 70, description: 160, minTags: 0, maxTags }`                         |
| `tags`           | `tags.yml`             | The only tags allowed; without either, any tag is                              |
| `authors`        | `authors.yml`          | Known authors, by id: `{ name, url, email }`                                   |
| `defaultAuthor`  |                        | An author id for posts that don't name one                                     |
| `directives`     |                        | Your own `:::` directives (below)                                              |
| `highlight`      | GitHub themes          | `{ themes: { light, dark }, classPrefix }`, or `false`                         |
| `markdown`       |                        | `(md) => void`: add markdown-it plugins                                        |
| `isKnownPath`    |                        | `(path) => boolean`: also check links to site pages outside the blog           |
| `validate`       |                        | `(post) => string[]`: your own checks; messages fail the build                 |
| `render`         |                        | `{ head, article, listHead, list }`: replace the default markup (below)        |

### Labels

Translate or reword what the default markup writes. `{n}` and `{count}` are numbers.

```ts
labels: {
  readingTime: "{n} Min. Lesezeit",
  pageOf: "Seite {n} von {count}",
  announcementCount: "{n} Ankündigungen",
  dismiss: "Schließen",
},
```

The keys, with their defaults, are in `DEFAULT_LABELS`: `readingTime`, `updated`, `by`,
`onThisPage`, `newer`, `older`, `blog`, `tags`, `noPosts`, `previous`, `next`, `pageOf`,
`announcement`, `announcements`, `announcementCount` and `dismiss`.

### Directives

A **leaf** directive is one line. A **container** wraps Markdown until a line holding
only `:::`, and can nest.

```ts
blogPlugin({
  // ...
  directives: {
    tool: {
      kind: "leaf",
      render: ({ args, error, post }) => {
        const [name, query] = args.split(/\s+/);
        if (!name) error("needs a tool name");
        return `<div class="tool" data-tool="${name}" data-q="${query ?? ""}"></div>`;
      },
    },
  },
});
```

```md
::: tool check example.com

::: warning Before you start
Back up the zone file.
:::
```

### Your own markup

`render.article` and `render.head` get the post and a set of helpers:

- `escapeHtml`, `formatDate`, `dateAttribute`, `label` and `labels`
- `indexUrl`, `tagUrl(tag)`, `announcementsUrl` and `usedTags` (tags with a page)
- `adjacent(post)`, the newer and older listed posts
- `posts` (every listed post, newest first) and `tags`
- the defaults: `renderHead`, `renderArticle`, `renderListHead`, `renderList`, `renderToc`
  and `renderFeedLinks`

`render.list` and `render.listHead` do the same for list pages. They get a page with
`kind` (`"index"`, `"tag"` or `"announcements"`), `url`, `canonical`, `title`,
`description`, `tag`, its `posts`, and `page`, `pageCount`, `previousUrl` and `nextUrl`.

```ts
render: {
  head: (post, h) => `${h.renderHead(post)}\n<meta property="og:site_name" content="Example">`,
  article: (post, h) => `<article class="post"><h1>${h.escapeHtml(post.title)}</h1>
    ${h.renderToc(post.toc)}<div class="prose">${post.html}</div></article>`,
},
```

The default article uses these classes: `post`, `post-header`, `post-description`,
`post-meta`, `post-tags`, `tag`, `toc`, `toc-title`, `toc-2`, `toc-3`, `prose`, `post-nav`,
`post-nav-newer` and `post-nav-older`. The default lists use `post-list`,
`post-list-description`, `post-list-tags` (the current tag has `aria-current="page"`),
`post-items`, `post-item` (and `pinned`), `post-list-empty` and `post-pages`. Inside posts:
`heading-anchor`, `code-block`, `callout`, `callout-note`, `callout-tip`,
`callout-warning` and `callout-title`.

### `virtual:blog/posts`

```ts
import { posts } from "virtual:blog/posts";

for (const post of posts.slice(0, 3)) console.log(post.title, post.url, post.date);
```

Each listed post has `slug`, `url`, `title`, `description`, `date`, `updated`, `tags`,
`authors`, `pinned`, `featured`, `series`, `readingMinutes` and `data` (the front matter).

## Releasing

Maintainers only. `npm run release:patch` (or `minor`, `major`) bumps the version, tags
and pushes. The tag runs `.github/workflows/release.yml`, which tests, builds and
publishes to npm with Trusted Publishing.

## License

[MIT](LICENSE)
