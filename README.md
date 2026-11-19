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
- **An index and tag pages.** `/blog/` lists every post, newest first, and each tag
  in use gets `/blog/tag/{tag}/`. All of them use your page shell.
- **Works under a strict Content Security Policy.** Code is highlighted with
  [Shiki](https://shiki.style) at build time, and its colors are written as classes, not
  `style` attributes, so `style-src 'self'` holds.
- **Checks every post.** The build fails, naming the file and line, on a missing or
  too-long title or description, a bad date, a tag not in `tags.yml`, an image without alt
  text or without a file, or a link to a post that doesn't exist (or is still a draft).
- **Drafts and scheduled posts.** `draft: true` and future dates stay out of the build,
  unless `preview` is on. Then they get `noindex`.
- **`:::` directives.** `note`, `tip` and `warning` callouts are built in. Add your own,
  such as a live widget inside a post.
- **Images** next to the post go through Vite (hashed and copied), with `width` and
  `height` set so the page doesn't shift, and `loading="lazy"` after the first.
- **Live reload in dev**, with problems shown in Vite's error overlay.
- **`virtual:blog/posts`** lists published posts, for a "Latest posts" strip or links
  from other pages.

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
import { blog } from "@binarynoir/vite-plugin-blog";

export default defineConfig({
  plugins: [
    blog({
      dir: "content",
      template: "templates/post.html",
      site: "https://example.com",
      titleSuffix: " · Example",
      preview: process.env.BLOG_PREVIEW === "1",
    }),
  ],
});
```

The page shell is any HTML page with two markers. Use root paths (`/src/…`) in it: the
page is served from `/blog/{slug}/`. Leave out `<title>`; the plugin writes it.

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
cover: cover.png
featured: true
draft: false
```

Fields the plugin doesn't know (`tools`, `discuss`) are kept in `post.data`, for your own
checks and markup.

### Light and dark code

Highlighting uses CSS `light-dark()`, so it follows the page's `color-scheme`. Set
`color-scheme: light dark` on `:root`, and `color-scheme: dark` or `light` when your
theme switch picks one.

## Options

| Option           | Default             | What it does                                                            |
| ---------------- | ------------------- | ----------------------------------------------------------------------- |
| `dir`            | (required)          | The content folder, relative to Vite's `root` or absolute               |
| `template`       | (required)          | The page shell, relative to Vite's `root`                               |
| `base`           | `/blog/`            | Where the blog lives on the site                                        |
| `site`           |                     | The site's origin, for canonical URLs and Open Graph tags               |
| `preview`        | `false`             | Also build drafts and scheduled posts, with `noindex`                   |
| `now`            | build time          | What "now" is when deciding whether a post is scheduled                 |
| `timeZone`       | `UTC`               | For dates without an offset, and for showing dates                      |
| `locale`         | `en-US`             | For showing dates                                                       |
| `wordsPerMinute` | `230`               | For reading time                                                        |
| `titleSuffix`    | `''`                | Added after the post title in `<title>`                                 |
| `index`          | `{ title: "Blog" }` | The index's heading and description: `{ title, description }`           |
| `tagPages`       | `true`              | Write a page per tag in use at `{base}tag/{tag}/`                       |
| `limits`         |                     | `{ title: 70, description: 160, minTags: 0, maxTags }`                  |
| `tags`           | `tags.yml`          | The only tags allowed; without either, any tag is                       |
| `authors`        | `authors.yml`       | Known authors, by id                                                    |
| `directives`     |                     | Your own `:::` directives (below)                                       |
| `highlight`      | GitHub themes       | `{ themes: { light, dark }, classPrefix }`, or `false`                  |
| `markdown`       |                     | `(md) => void`: add markdown-it plugins                                 |
| `isKnownPath`    |                     | `(path) => boolean`: also check links to site pages outside the blog    |
| `validate`       |                     | `(post) => string[]`: your own checks; messages fail the build          |
| `render`         |                     | `{ head, article, listHead, list }`: replace the default markup (below) |

### Directives

A **leaf** directive is one line. A **container** wraps Markdown until a line holding
only `:::`, and can nest.

```ts
blog({
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

`render.article` and `render.head` get the post and a set of helpers: `escapeHtml`,
`formatDate`, `dateAttribute`, `renderToc`, `renderHead`, `renderArticle`, `tags` and
`posts` (every published post, newest first, for related posts or series links), plus
`indexUrl`, `tagUrl(tag)` and `usedTags` (tags with a page).

`render.list` and `render.listHead` do the same for the index and tag pages. They get a
page with `kind` (`"index"` or `"tag"`), `url`, `canonical`, `title`, `description`,
`tag` and its `posts`, newest first; the defaults are `renderList` and `renderListHead`.

```ts
render: {
  head: (post, h) => `${h.renderHead(post)}\n<meta property="og:site_name" content="Example">`,
  article: (post, h) => `<article class="post"><h1>${h.escapeHtml(post.title)}</h1>
    ${h.renderToc(post.toc)}<div class="prose">${post.html}</div></article>`,
},
```

The default article uses these classes: `post`, `post-header`, `post-description`,
`post-meta`, `post-tags`, `tag`, `toc`, `toc-title`, `toc-2`, `toc-3`, `prose`.
The default index and tag pages use `post-list`, `post-list-description`,
`post-list-tags` (the current tag has `aria-current="page"`), `post-items`, `post-item`
and `post-list-empty`. Inside posts: `heading-anchor`, `code-block`, `callout`, `callout-note`, `callout-tip`,
`callout-warning`, `callout-title`.

### `virtual:blog/posts`

```ts
import { posts } from "virtual:blog/posts";

for (const post of posts.slice(0, 3)) console.log(post.title, post.url, post.date);
```

Each post has `slug`, `url`, `title`, `description`, `date`, `updated`, `tags`, `authors`,
`featured`, `series`, `readingMinutes` and `data` (the front matter).

## Releasing

Maintainers only. `npm run release:patch` (or `minor`, `major`) bumps the version, tags
and pushes. The tag runs `.github/workflows/release.yml`, which tests, builds and
publishes to npm with Trusted Publishing.

## License

[MIT](LICENSE)
