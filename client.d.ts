// Types for the plugin's virtual modules. Add to tsconfig "types":
// ["@binarynoir/vite-plugin-blog/client"], or reference it from a .d.ts file.

declare module "virtual:blog/posts" {
  import type {
    BlogPostSummary,
    BlogSiteInfo,
    BlogTagInfo,
  } from "@binarynoir/vite-plugin-blog/runtime";
  export type { BlogPostSummary, BlogSiteInfo, BlogTagInfo };
  /** Listed posts (published, not unlisted), newest first. */
  export const posts: BlogPostSummary[];
  /** Every tag, with its name and, when it has a page, its `url`. */
  export const tags: Record<string, BlogTagInfo>;
  /** The blog's address, title, feeds, search index and labels. */
  export const blog: BlogSiteInfo;
  export default posts;
}

declare module "virtual:blog/latest" {
  import type {
    BlogPostSummary,
    BlogSiteInfo,
    BlogTagInfo,
  } from "@binarynoir/vite-plugin-blog/runtime";
  export type { BlogPostSummary, BlogSiteInfo, BlogTagInfo };
  /** The newest listed posts: `latest` of them (default 6). Smaller than `virtual:blog/posts`, for a home page. */
  export const posts: BlogPostSummary[];
  export const tags: Record<string, BlogTagInfo>;
  export const blog: BlogSiteInfo;
  export default posts;
}

declare module "virtual:blog/code.css" {}
