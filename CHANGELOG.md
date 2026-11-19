# Changelog

## [Unreleased]

- An index page at the blog's `base` and a page per tag at `{base}tag/{tag}/`, both from the same page shell, with their own head tags. Turn tag pages off with `tagPages: false`, and set the index's heading and description with `index`.
- `render.list` and `render.listHead` replace the index and tag page markup; helpers gain `indexUrl`, `tagUrl`, `usedTags`, `renderList` and `renderListHead`.
- Tags in the default post markup link to their tag pages.
- Links to the index and to tag pages are checked: a link to a tag no published post uses fails the build.

## [0.1.0]

- First release: Markdown posts as static HTML pages in your own page shell, with front
  matter checks, drafts and scheduled posts, build-time Shiki highlighting as classes,
  `:::` directives with built-in callouts, image sizes, link checks between posts, live
  reload in dev and a `virtual:blog/posts` module.
