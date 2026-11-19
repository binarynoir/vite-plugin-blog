// Types for the plugin's virtual modules. Add to tsconfig "types":
// ["@binarynoir/vite-plugin-blog/client"], or reference it from a .d.ts file.

declare module "virtual:blog/posts" {
  export interface BlogPostSummary {
    slug: string;
    /** `/blog/vpn-leaks/` */
    url: string;
    title: string;
    description: string;
    /** ISO 8601 */
    date: string;
    updated?: string;
    tags: string[];
    authors: { name: string; url?: string }[];
    /** Kept at the top of lists. */
    pinned: boolean;
    featured: boolean;
    series?: string;
    readingMinutes: number;
    /** Front matter as written, including fields the plugin doesn't know. */
    data: Record<string, unknown>;
  }
  /** Listed posts (published, not unlisted), newest first. */
  export const posts: BlogPostSummary[];
  export default posts;
}

declare module "virtual:blog/code.css" {}
