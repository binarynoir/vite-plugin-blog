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
- **Lists people can find their way around:** an index at `/blog/` with a featured
  post, a page per topic, pinned posts first, cards, numbered pages at `.../page/2/`,
  and breadcrumbs back up. A browse bar puts the topics on one line as tabs with post
  counts, with a date menu (years and months) and a feed icon at its end.
- **Search without a server.** A `search.json` index built with the site, and a search
  field that ranks, sorts and pages results in the browser, keeps them in the address
  (`?q=dns&date=2026-11&sort=oldest`) and loads the index only when someone starts typing. No
  WebAssembly and no extra build step, so it works under `script-src 'self'`.
- **Reach:** share links that load nothing from the networks, feed links on every page,
  related posts, series navigation, and `virtual:blog/latest` for a home page strip.
- **An announcement banner** across every page of the site for posts marked
  `announcement`, with a count of the others, a close button that remembers, and an
  optional end date.
- **RSS, Atom and JSON feeds** with whole articles and absolute image addresses, and a
  sitemap.
- **Social cards and search data:** Open Graph tags, a stable `og:image` for the cover
  (or a site-wide fallback), and `BlogPosting`, `Blog`, `CollectionPage` and
  `BreadcrumbList` structured data.
- **Optional Vue components and default styles.** The same card, pager and search
  markup as the static pages, themed with a few `--blog-*` custom properties.
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
| Search with no server or WASM      | Built in                 | Usually a hosted service or WASM         | No                                  |
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
import "@binarynoir/vite-plugin-blog/styles.css"; // optional: default styles
import { enhanceBlogPage } from "@binarynoir/vite-plugin-blog/runtime";
import { mountBlogExplorer } from "@binarynoir/vite-plugin-blog/vue"; // needs vue

enhanceBlogPage(); // copy buttons, "Copy link", contents highlight
mountBlogExplorer(); // search on the index and tag pages; does nothing elsewhere
```

Every page reads without that script. It adds the extras.

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

## Search, navigation and Vue components

### How readers move around

| Page               | Shows                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/blog/`           | Eyebrow, title and lead; search; the browse bar (topic tabs with counts, date menu, feed icon); the featured post; cards; numbered pages; feed links |
| `/blog/tag/dns/`   | Breadcrumb `Blog / DNS`; the same, with search kept inside the topic and a "Search all posts" link                                                   |
| `/blog/page/2/`    | Breadcrumb `Blog / Page 2`                                                                                                                           |
| `/blog/vpn-leaks/` | Breadcrumb `Blog / {first tag}`; the article and its contents; your call to action; share links; the series; related posts                           |

The topic is in the path, which gives each topic a real page that search engines can
index. The search and date are in the query string, so they can be shared and Back
works. Switching topic keeps the search and date. The date menu lists each year with
posts, newest first, and its twelve months (empty months greyed out); picking one
filters the list in the browser, from `search.json`, so the menu needs search on and
shows once the explorer runs. The feed icon links RSS, else Atom, else JSON Feed.
The breadcrumb's "Blog" always goes to the plain index.

### Search

The build writes `{base}search.json` (`BlogSearchIndex`). It holds each listed post's
summary, its headings and up to `search.text` characters of its text, but no front
matter. Results rank title matches first, then tags, headings, the description, authors
and the text. Every word must match, either at the start of a word or, for less, inside
one. Accents and case don't matter.

```ts
search: { text: 3000, pageSize: 12 }, // or search: false
```

At a few hundred posts the index stays at a few hundred KB, fetched once and only when
the field is used. For thousands of posts, set `text: 0` (titles, descriptions and
headings only), or use Pagefind with `data-pagefind-body`, which the article already has.

### `/runtime`, with no framework

```ts
import {
  loadSearchIndex,
  searchPosts,
  sortPosts,
  paginate,
  readExplorerState,
  writeExplorerState,
  cardTree,
  toHtml,
  readBlogConfig,
} from "@binarynoir/vite-plugin-blog/runtime";

const config = readBlogConfig(); // the page's #blog-config JSON
const index = await loadSearchIndex(config!.searchUrl!);
const found = searchPosts(index.posts, "dns", index.tags).map((result) => result.post);
const { items } = paginate(sortPosts(found, "newest"), 1, 12);
list.innerHTML = items
  .map((post) => toHtml(cardTree(post, { labels: config!.labels, tags: index.tags })))
  .join("");
```

`cardTree`, `pagerTree`, `breadcrumbTree`, `searchFormTree` and `tagListTree` return
element trees. They give the same markup the build writes, so React, Svelte or plain DOM
code can render them too.

### `/vue`

Install `vue` (3.4 or later). The components render the same trees, so a card in search
results or on your home page matches the cards on the blog's own pages.

| Component / function  | Props                                                                  | Use                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BlogPostCard`        | `post`, `tags`, `labels`, `headingLevel`, `label`, `featured`, `cover` | One card                                                                                                                                                |
| `BlogPostList`        | `posts`, `tags`, `labels`, `headingLevel`, `limit`, `cover`            | A list of cards, such as a home page strip                                                                                                              |
| `BlogPager`           | `page`, `pageCount`, `href`, `labels`; emits `navigate`                | Numbered pages whose links also work without a script                                                                                                   |
| `BlogExplorer`        | `config`, `staticSelector`, `resultsSelector`, `shortcut`, `browse`    | Search, date filter, sort and pages for a list page, with the browse bar from `config.browse`. Press `/` to search, Esc to clear or close the date menu |
| `mountBlogExplorer()` | `{ selector, config, setup }`                                          | Mounts `BlogExplorer` on `[data-blog-explorer]`, if the page has one, with the browse bar when the build wrote one there                                |

A home page strip:

```vue
<script setup lang="ts">
import "@binarynoir/vite-plugin-blog/styles.css";
import { BlogPostList } from "@binarynoir/vite-plugin-blog/vue";
import { blog, posts, tags } from "virtual:blog/latest";
</script>

<template>
  <section v-if="posts.length">
    <h2>From the blog</h2>
    <BlogPostList :posts="posts" :tags="tags" :labels="blog.labels" :limit="3" />
    <a :href="blog.indexUrl">All posts →</a>
  </section>
</template>
```

If some builds of your site leave the blog out, give those builds an empty
`virtual:blog/latest` (`export const posts = []; export const tags = {}; export const blog = null;`).

### Styles

`@binarynoir/vite-plugin-blog/styles.css` styles everything above. Its rules have zero
specificity, so your own rules always win. To match your site, map its tokens:

```css
:root {
  --blog-text: var(--text);
  --blog-muted: var(--text-secondary);
  --blog-surface: var(--surface);
  --blog-border: var(--border);
  --blog-muted-bg: var(--subtle);
  --blog-accent: var(--brand);
  --blog-accent-tint: var(--brand-tint);
  --blog-font-display: var(--font-heading);
  --blog-radius: 16px;
}
```

The full list is at the top of `styles.css`. Both themes follow, as long as your tokens
change with the theme.

### Reusing it on another site

1. `npm install -D @binarynoir/vite-plugin-blog` (and `vue` for the components).
2. Add `blogPlugin({ dir, template, site, siteName, image })` to `vite.config.ts`.
3. Write a page shell with `<!--blog:head-->` and `<!--blog:content-->`. Its script
   imports `virtual:blog/code.css` and the styles, then calls `enhanceBlogPage()` and
   `mountBlogExplorer()`.
4. Map the `--blog-*` tokens to your design system.
5. Add `"@binarynoir/vite-plugin-blog/client"` to `tsconfig.json` `types`.
6. Optional: a home page strip from `virtual:blog/latest`, `feeds: { discovery: "site" }`,
   and `render.article: (post, h) => h.renderArticle(post, { end: yourCallToAction })`.

## Feeds and sitemap

With `site` set, the build writes `/blog/feed.xml` (RSS 2.0), `/blog/atom.xml` and
`/blog/feed.json` (JSON Feed 1.1), each with the newest 20 listed posts and their whole
articles, plus `/blog/sitemap.xml`. Every blog page links the feeds from its `<head>`, and
`renderFeedLinks()` gives you the same tags for other pages. Dev serves them too.

```ts
feeds: { rss: true, atom: false, json: true, limit: 50, content: false, discovery: "site" },
sitemap: false,
```

`discovery: "site"` links the feeds from every page's `<head>`, home page included, so
browsers and feed readers find them from anywhere on the site.

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
| `titleSuffix`    | `''`                   | Added after a post's title in `<title>`                                        |
| `siteName`       |                        | `og:site_name`, the publisher, and the end of list pages' titles               |
| `image`          |                        | Share card for list pages and posts without a cover (path or URL)              |
| `index`          | `{ title: "Blog" }`    | The index's `{ title, description, eyebrow }`                                  |
| `tagPages`       | `true`                 | Write a page per tag in use at `{base}tag/{tag}/`                              |
| `pageSize`       | `0`                    | Posts per list page; `0` puts them all on one                                  |
| `feeds`          | all three, with `site` | `{ rss, atom, json, limit, title, description, content }`, or `false`          |
| `sitemap`        | `true`, with `site`    | `{base}sitemap.xml`                                                            |
| `search`         | on                     | `{ text: 3000, pageSize: 12 }`, or `false`                                     |
| `latest`         | `6`                    | Posts in `virtual:blog/latest`                                                 |
| `share`          | six networks           | `{ networks, mastodon }`, or `false`. Needs `site`                             |
| `related`        | `3`                    | Related posts at the end of a post; `0` for none                               |
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

Every key, with its default, is in `DEFAULT_LABELS` (exported from the package and
from `/runtime`). Among them are `tagDescription` ("Posts about {tag}."), `topic`,
`allPosts`, `search`, `searchTopic`, `sortNewest`, `results`, `noResults`, `share`,
`relatedPosts`, `series`, `seriesPart` and `subscribe`. The Vue components get the same
labels through the page's `#blog-config` JSON, or through `blog.labels` from the virtual
modules.

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

`render.article` and `render.head` get the post and a set of helpers. Most sites only
need to add something to the default article:

```ts
render: {
  article: (post, h) => h.renderArticle(post, { end: `<aside class="cta">…</aside>` }),
},
```

The helpers:

- `escapeHtml`, `formatDate`, `dateAttribute`, `label` and `labels`
- `indexUrl`, `tagUrl(tag)`, `announcementsUrl`, `searchUrl`, `siteName`, `usedTags`
  (tags with a page) and `tagInfo`
- `adjacent(post)`, `related(post, limit)`, `series(post)`, `breadcrumbs(postOrPage)` and
  `summary(post)`
- `posts` (every listed post, newest first) and `tags`
- pieces: `renderBreadcrumbs`, `renderCard`, `renderPager`, `renderShare`,
  `renderSeries`, `renderRelated`, `renderTopics`, `renderSearch`, `renderBrowse`,
  `renderExplorer` (the search form and the browse bar, as list pages use), `renderFeedList`,
  `renderClientConfig`, `renderToc` and `renderFeedLinks`
- the defaults: `renderHead`, `renderArticle(post, { beforeBody, end })`,
  `renderListHead` and `renderList(page, { eyebrow, lead, end })`

List pages get `kind` (`"index"`, `"tag"` or `"announcements"`), `url`, `canonical`,
`title`, `description`, `tag`, their `posts`, and `page`, `pageCount`, `pageUrls`,
`previousUrl` and `nextUrl`.

If you write your own list markup, keep `data-blog-explorer` (the search form, and the
browse bar if you want it: `renderExplorer(page)` writes both),
`data-blog-results` (where results go) and `data-blog-static` (the list that results
replace) for the explorer, and `renderClientConfig(page)` for its settings.

**Classes.** Posts use `blog-crumbs`, `blog-layout` (`has-toc`), `blog-post`,
`blog-post-head`, `blog-lead`, `blog-meta`, `blog-tags`, `blog-tag`, `blog-post-cover`,
`blog-toc`, `blog-toc-side`, `blog-toc-inline`, `blog-toc-title`, `blog-toc-2`,
`blog-toc-3`, `blog-prose`, `blog-post-end`, `blog-share`, `blog-share-link`,
`blog-share-copy`, `blog-series`, `blog-related` and `blog-post-nav`. Lists use
`blog-list`, `blog-list-head`, `blog-eyebrow`, `blog-explorer`, `blog-search`,
`blog-sort`, `blog-topics`, `blog-browse`, `blog-browse-topics`, `blog-browse-tabs`,
`blog-browse-tab`, `blog-browse-count`, `blog-browse-tools`, `blog-browse-feed`,
`blog-menu` (`is-active`), `blog-menu-button`, `blog-menu-panel`, `blog-menu-year`,
`blog-menu-months`, `blog-menu-choice` (`is-empty`), `blog-static`, `blog-results`, `blog-cards`, `blog-card`
(`is-featured`, `is-pinned`), `blog-card-cover`, `blog-card-body`, `blog-card-label`,
`blog-card-title`, `blog-card-description`, `blog-pager`, `blog-feeds` and `blog-empty`.
Inside posts: `heading-anchor`, `code-block`, `code-copy`, `callout`, `callout-note`,
`callout-tip`, `callout-warning` and `callout-title`.

### `virtual:blog/posts`

```ts
import { posts } from "virtual:blog/posts";

for (const post of posts.slice(0, 3)) console.log(post.title, post.url, post.date);
```

Each listed post has `slug`, `url`, `title`, `description`, `date`, `dateText` and
`dateTime` (formatted in the blog's locale and time zone), `updated`, `tags`, `authors`
(names and links only), `pinned`, `featured`, `series`, `cover`, `readingMinutes` and
`data` (the front matter). The module also exports `tags` and `blog`.
`virtual:blog/latest` is the same, with only the newest `latest` posts.

## Releasing

Maintainers only. `npm run release:patch` (or `minor`, `major`) bumps the version, tags
and pushes. The tag runs `.github/workflows/release.yml`, which tests, builds and
publishes to npm with Trusted Publishing.

## License

[MIT](LICENSE)

<!-- binarynoir:more:start (generated from binarynoir.github.io/products.json) -->

## More from BinaryNoir

<p align="center">
  <a href="https://binarynoir.tech">
    <img alt="BinaryNoir" src="https://binarynoir.tech/logo-horizontal.png" width="320">
  </a>
</p>

Blog for Vite is one of a family of open-source tools from BinaryNoir.

**Pairs well with Blog for Vite**

- [Blog](https://binarynoir.tech/plugins/blog/): posts anywhere, a main blog and section blogs, with RSS feeds
- [Optimize Images](https://binarynoir.tech/plugins/optimize-images): smaller images in the build output
- [Image Fallback](https://binarynoir.tech/plugins/image-fallback): a placeholder instead of a failed build

**See them all:** VitePress plugins, Vite plugins, editor extensions and command-line tools, with documentation and live demos, at **[binarynoir.tech](https://binarynoir.tech)**.

<!-- binarynoir:more:end -->
