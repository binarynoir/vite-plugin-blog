import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, createServer, type InlineConfig } from "vite";
import { afterAll, describe, expect, it } from "vitest";
import {
  blogPlugin,
  type BlogOptions,
  type BlogPostSummary,
  type BlogSearchIndex,
  type BlogSiteInfo,
  type BlogTagInfo,
} from "../src/index.js";

type VirtualModule = {
  posts: BlogPostSummary[];
  tags: Record<string, BlogTagInfo>;
  blog: BlogSiteInfo;
};

const root = fileURLToPath(new URL("./fixtures/site", import.meta.url));
const outDirs: string[] = [];

afterAll(() => {
  for (const dir of outDirs) rmSync(dir, { recursive: true, force: true });
});

function config(options: Partial<BlogOptions> = {}): { outDir: string; inline: InlineConfig } {
  const outDir = mkdtempSync(path.join(tmpdir(), "vite-plugin-blog-"));
  outDirs.push(outDir);
  return {
    outDir,
    inline: {
      root,
      logLevel: "silent",
      configFile: false,
      plugins: [
        blogPlugin({
          dir: "content",
          template: "templates/post.html",
          site: "https://example.com",
          siteName: "Example",
          titleSuffix: " · Example Blog",
          now: new Date("2026-11-19T12:00:00Z"),
          ...options,
        }),
      ],
      build: { outDir, emptyOutDir: true, assetsInlineLimit: 0 },
    },
  };
}

async function built(options: Partial<BlogOptions> = {}) {
  const { outDir, inline } = config(options);
  await build(inline);
  const read = (file: string) => readFileSync(path.join(outDir, file), "utf8");
  const has = (file: string) => existsSync(path.join(outDir, file));
  return { read, has };
}

function jsonLd(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(
    (match) => JSON.parse(match[1]!) as Record<string, unknown>,
  );
}

describe("search index", () => {
  it("lists published posts with their text, and no front matter or drafts", async () => {
    const { read } = await built();
    const index = JSON.parse(read("blog/search.json")) as BlogSearchIndex;
    expect(index.version).toBe(1);
    expect(index.posts.map((post) => post.slug)).toEqual(["notice", "hello", "later"]);
    const hello = index.posts.find((post) => post.slug === "hello")!;
    expect(hello.headings).toEqual(["Setup", "Details"]);
    expect(hello.text).toContain("Callouts take Markdown.");
    expect(hello.dateText).toBe("November 1, 2026");
    expect(hello.cover).toMatch(/^\/blog\/images\/dot-\w{8}\.png$/);
    expect(hello).not.toHaveProperty("data");
    // Authors' emails stay out of anything sent to browsers.
    expect(JSON.stringify(index)).not.toContain("jane@example.com");
    expect(index.tags.dns).toEqual({
      name: "DNS",
      description: "Records and resolvers.",
      url: "/blog/tag/dns/",
    });
  });

  it("can leave out the text, or be turned off", async () => {
    const short = await built({ search: { text: 0 } });
    const index = JSON.parse(short.read("blog/search.json")) as BlogSearchIndex;
    expect(index.posts.every((post) => post.text === "")).toBe(true);
    const off = await built({ search: false });
    expect(off.has("blog/search.json")).toBe(false);
    expect(off.read("blog/index.html")).not.toContain("data-blog-explorer");
  });
});

describe("list pages", () => {
  it("carry the search form, topics, a results slot and the client settings", async () => {
    const { read } = await built();
    const index = read("blog/index.html");
    expect(index).toContain(
      '<div class="blog-explorer" data-blog-explorer><form class="blog-search" role="search"',
    );
    // Search form, then the browse bar (topic tabs, date menu, feed icon) in the mount point.
    expect(index).toMatch(
      /<div class="blog-explorer" data-blog-explorer><form[\s\S]*?<\/form><div class="blog-browse"><nav class="blog-browse-topics" aria-label="Topics">/,
    );
    expect(index).toContain(
      '<details class="blog-menu" data-blog-control="date-menu" data-pending>',
    );
    expect(index).toContain('class="blog-browse-feed" href="/blog/feed.xml"');
    expect(index).toContain('<div class="blog-results-slot" data-blog-results></div>');
    expect(index).toContain('<div class="blog-static" data-blog-static>');
    // The newest post is featured on the first page.
    expect(index).toMatch(
      /<article class="blog-card is-featured">[\s\S]*?<p class="blog-card-label">Latest<\/p>/,
    );
    expect(index).toContain('<p class="blog-feeds"><span>Subscribe</span>');

    const tag = read("blog/tag/dns/index.html");
    const config = JSON.parse(
      tag.match(/<script type="application\/json" id="blog-config">(.*?)<\/script>/)![1]!,
    );
    expect(config).toMatchObject({
      indexUrl: "/blog/",
      searchUrl: "/blog/search.json",
      tag: "dns",
      tagName: "DNS",
    });
    expect(tag).toContain('placeholder="Search DNS posts"');
  });

  it("end their titles with the site's name and describe themselves for search engines", async () => {
    const { read } = await built({ image: "/og.png" });
    const index = read("blog/index.html");
    expect(index).toContain("<title>Blog · Example</title>");
    expect(index).toContain('<meta property="og:site_name" content="Example">');
    expect(index).toContain('<meta property="og:image" content="https://example.com/og.png">');
    const [blog] = jsonLd(index);
    expect(blog).toMatchObject({ "@type": "Blog", url: "https://example.com/blog/" });
    expect((blog!.blogPost as unknown[]).length).toBe(3);

    const tag = read("blog/tag/homelab/index.html");
    expect(tag).toContain("<title>Homelab · Blog · Example</title>");
    // No description in tags.yml: the label fills one in.
    expect(tag).toContain('<meta name="description" content="Posts about Homelab.">');
    const [collection, crumbs] = jsonLd(tag);
    expect(collection!["@type"]).toBe("CollectionPage");
    expect(crumbs).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, name: "Example", item: "https://example.com/" },
        { position: 2, name: "Blog", item: "https://example.com/blog/" },
        { position: 3, name: "Homelab", item: "https://example.com/blog/tag/homelab/" },
      ],
    });
  });

  it("number their pages, and give later pages a breadcrumb", async () => {
    const { read } = await built({ pageSize: 1 });
    const second = read("blog/page/2/index.html");
    expect(second).toContain('<li><span aria-current="page">2</span></li>');
    expect(second).toContain(
      '<li><a href="/blog/page/3/" data-page="3" aria-label="Page 3">3</a></li>',
    );
    expect(second).toContain(
      '<li><a href="/blog/">Blog</a></li><li><span aria-current="page">Page 2</span></li>',
    );
  });
});

describe("post pages", () => {
  it("have a breadcrumb to their first tag, share links and related posts", async () => {
    const { read } = await built();
    const html = read("blog/later/index.html");
    expect(html).toContain(
      '<nav class="blog-crumbs" aria-label="Breadcrumb"><ol><li><a href="/blog/">Blog</a></li><li><a href="/blog/tag/homelab/">Homelab</a></li></ol></nav>',
    );
    expect(html).toContain(
      'href="https://news.ycombinator.com/submitlink?u=https%3A%2F%2Fexample.com%2Fblog%2Flater%2F&amp;t=Later"',
    );
    expect(html).toContain(
      'data-blog-copy-link="https://example.com/blog/later/" hidden>Copy link</button>',
    );
    expect(html).toContain('<section class="blog-related" aria-labelledby="blog-related-title">');
    expect(html).toContain('href="/blog/notice/"');
    const types = jsonLd(html).map((data) => data["@type"]);
    expect(types).toEqual(["BlogPosting", "BreadcrumbList"]);
    expect(jsonLd(html)[0]).toMatchObject({
      publisher: { "@type": "Organization", name: "Example" },
      isPartOf: { "@type": "Blog", url: "https://example.com/blog/" },
      articleSection: "Homelab",
    });
  });

  it("leave share links out with share: false", async () => {
    const { read } = await built({ share: false });
    expect(read("blog/later/index.html")).not.toContain("blog-share");
  });
});

describe("feed discovery", () => {
  it("links the feeds from every page with discovery: site", async () => {
    const { read } = await built({ feeds: { discovery: "site" } });
    expect(read("index.html")).toContain(
      '<link rel="alternate" type="application/rss+xml" title="Blog" href="/blog/feed.xml">',
    );
    // Blog pages have them once.
    expect(
      read("blog/index.html").match(/rel="alternate" type="application\/rss\+xml"/g),
    ).toHaveLength(1);
  });

  it("leaves other pages alone by default", async () => {
    const { read } = await built();
    expect(read("index.html")).not.toContain('rel="alternate"');
  });
});

describe("virtual modules and dev", () => {
  it("export the newest posts, the tags and the blog's settings, and serve search.json", async () => {
    const { inline } = config({ latest: 2 });
    const server = await createServer({ ...inline, server: { port: 0 } });
    await server.listen();
    try {
      const latest = (await server.ssrLoadModule("virtual:blog/latest")) as VirtualModule;
      expect(latest.posts.map((post) => post.slug)).toEqual(["notice", "hello"]);
      expect(latest.tags.homelab).toEqual({ name: "Homelab", url: "/blog/tag/homelab/" });
      expect(latest.blog).toMatchObject({ indexUrl: "/blog/", feeds: { rss: "/blog/feed.xml" } });
      expect(latest.posts[1]!.authors).toEqual([
        { name: "Jane Doe", url: "https://example.com/jane" },
      ]);

      const all = (await server.ssrLoadModule("virtual:blog/posts")) as VirtualModule;
      expect(all.posts).toHaveLength(3);

      const base = server.resolvedUrls!.local[0]!.replace(/\/$/, "");
      const search = await fetch(`${base}/blog/search.json`);
      expect(search.headers.get("content-type")).toContain("application/json");
      expect(((await search.json()) as BlogSearchIndex).posts).toHaveLength(3);
    } finally {
      await server.close();
    }
  });
});
