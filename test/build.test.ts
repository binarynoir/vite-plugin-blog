import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, createServer, type InlineConfig } from "vite";
import { afterAll, describe, expect, it } from "vitest";
import { blogPlugin, type BlogOptions } from "../src/index.js";

const root = fileURLToPath(new URL("./fixtures/site", import.meta.url));
const outDirs: string[] = [];

afterAll(() => {
  for (const dir of outDirs) rmSync(dir, { recursive: true, force: true });
});

function config(options: Partial<BlogOptions> = {}): InlineConfig & { outDir: string } {
  const outDir = mkdtempSync(path.join(tmpdir(), "vite-plugin-blog-"));
  outDirs.push(outDir);
  return {
    root,
    logLevel: "silent",
    configFile: false,
    plugins: [
      blogPlugin({
        dir: "content",
        template: "templates/post.html",
        site: "https://example.com",
        titleSuffix: " · Example",
        now: new Date("2026-11-19T12:00:00Z"),
        ...options,
      }),
    ],
    // Keep the tiny test image a file, so the test sees Vite hash and copy it.
    build: { outDir, emptyOutDir: true, assetsInlineLimit: 0 },
    outDir,
  };
}

function read(outDir: string, file: string): string {
  return readFileSync(path.join(outDir, file), "utf8");
}

describe("build", () => {
  it("writes a page per published post, through Vite's HTML pipeline", async () => {
    const { outDir, ...inline } = config();
    await build(inline);

    expect(existsSync(path.join(outDir, "blog/hello/index.html"))).toBe(true);
    expect(existsSync(path.join(outDir, "blog/later/index.html"))).toBe(true);
    expect(existsSync(path.join(outDir, "blog/draft-post/index.html"))).toBe(false);
    expect(existsSync(path.join(outDir, "blog/future/index.html"))).toBe(false);

    const html = read(outDir, "blog/hello/index.html");
    expect(html).toContain("<title>Hello DNS · Example</title>");
    expect(html).toContain('<link rel="canonical" href="https://example.com/blog/hello/">');
    expect(html).toContain('<h2 id="setup">Setup');
    // The template's script was bundled, and the code CSS extracted to a file.
    expect(html).not.toContain("/src/post.ts");
    expect(html).toMatch(/<link rel="stylesheet"[^>]*href="\/assets\/[^"]+\.css"/);
    // No inline styles anywhere, so the page works under style-src 'self'.
    expect(html).not.toMatch(/\sstyle="/);
    // The image went through Vite: hashed, with its size.
    expect(html).toMatch(
      /<figure><img src="\/assets\/dot-[\w-]+\.png" alt="A tiny dot" width="3" height="2"/,
    );
    expect(html).toContain("<figcaption>The dot, <em>captioned</em></figcaption>");
    expect(html).toContain('<aside class="callout callout-tip">');
    expect(html).toContain('<p class="callout-title">Good to know</p>');
    expect(html).toContain('<aside class="blog-toc blog-toc-side"><nav aria-label="On this page">');
    expect(html).toContain(
      '<details class="blog-toc blog-toc-inline"><summary>On this page</summary>',
    );

    const css = readdirSync(path.join(outDir, "assets"))
      .filter((file) => file.endsWith(".css"))
      .map((file) => read(outDir, `assets/${file}`))
      .join("\n");
    expect(css).toMatch(/\.sk-[\w-]+\{?/);
  });

  it("writes the index and a page per used tag, listing published posts newest first", async () => {
    const { outDir, ...inline } = config({ index: { description: "Notes on DNS." } });
    await build(inline);

    const index = read(outDir, "blog/index.html");
    expect(index).toContain("<title>Blog · Example</title>");
    expect(index).toContain('<link rel="canonical" href="https://example.com/blog/">');
    expect(index).toContain('<p class="blog-lead">Notes on DNS.</p>');
    expect(index).not.toContain("/src/post.ts");
    expect(index.indexOf("/blog/hello/")).toBeLessThan(index.indexOf("/blog/later/"));
    expect(index).not.toContain("/blog/draft-post/");
    expect(index).toContain('<li><a class="blog-tag" href="/blog/tag/dns/">DNS</a></li>');
    expect(index).toContain(
      '<a class="blog-browse-tab" href="/blog/" aria-current="page" data-blog-control="topic">All<span class="blog-browse-count" aria-hidden="true">',
    );

    const dns = read(outDir, "blog/tag/dns/index.html");
    expect(dns).toContain("<title>DNS · Blog · Example</title>");
    expect(dns).toContain('<meta name="description" content="Records and resolvers.">');
    expect(dns).toContain(
      '<a class="blog-browse-tab" href="/blog/tag/dns/" aria-current="page" data-blog-control="topic">DNS<span',
    );
    // A breadcrumb back to the index, with the tag as the current page.
    expect(dns).toContain(
      '<nav class="blog-crumbs" aria-label="Breadcrumb"><ol><li><a href="/blog/">Blog</a></li><li><span aria-current="page">DNS</span></li></ol></nav>',
    );
    expect(dns).toContain("/blog/hello/");
    expect(dns).not.toContain('href="/blog/later/"');
    expect(existsSync(path.join(outDir, "blog/tag/homelab/index.html"))).toBe(true);

    // Posts link their tags to the tag pages.
    expect(read(outDir, "blog/hello/index.html")).toContain(
      '<li><a class="blog-tag" href="/blog/tag/dns/">DNS</a></li>',
    );
  });

  it("writes no tag pages with tagPages: false", async () => {
    const { outDir, ...inline } = config({ tagPages: false });
    await build(inline);
    expect(existsSync(path.join(outDir, "blog/index.html"))).toBe(true);
    expect(existsSync(path.join(outDir, "blog/tag"))).toBe(false);
    expect(read(outDir, "blog/hello/index.html")).toContain(
      '<li><span class="blog-tag">DNS</span></li>',
    );
  });

  it("exports published posts from virtual:blog/posts, newest first", async () => {
    const { outDir, ...inline } = config();
    await build(inline);
    const js = readdirSync(path.join(outDir, "assets"))
      .filter((file) => file.endsWith(".js"))
      .map((file) => read(outDir, `assets/${file}`))
      .join("\n");
    expect(js).toContain("Hello DNS");
    expect(js).toContain("Later");
    expect(js).not.toContain("Scheduled.");
    expect(js.indexOf("Hello DNS")).toBeLessThan(js.indexOf("Published but older."));
  });

  it("builds drafts and scheduled posts with preview, marked noindex", async () => {
    const { outDir, ...inline } = config({ preview: true });
    await build(inline);
    expect(read(outDir, "blog/future/index.html")).toContain(
      '<meta name="robots" content="noindex">',
    );
    expect(existsSync(path.join(outDir, "blog/draft-post/index.html"))).toBe(true);
  });

  it("fails, naming the file, when a post has problems", async () => {
    const { outDir, ...inline } = config({ limits: { title: 5 } });
    await expect(build(inline)).rejects.toThrow(
      /content\/posts\/hello\/index\.md\n\s+- title is 9 characters; the limit is 5/,
    );
    void outDir;
  });

  it("serves posts in dev, and redirects a path without its slash", async () => {
    const { outDir, ...inline } = config();
    void outDir;
    const server = await createServer({ ...inline, server: { port: 0 } });
    await server.listen();
    try {
      const base = server.resolvedUrls!.local[0]!.replace(/\/$/, "");
      const page = await fetch(`${base}/blog/hello/`);
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain("<title>Hello DNS · Example</title>");
      expect(html).toContain("/@vite/client");
      expect(html).toMatch(/src="\/@fs\/[^"]+\/dot\.png"/);

      const index = await fetch(`${base}/blog/`).then((r) => r.text());
      expect(index).toContain("<title>Blog · Example</title>");
      const tag = await fetch(`${base}/blog/tag/dns/`).then((r) => r.text());
      expect(tag).toContain("<title>DNS · Blog · Example</title>");
      const toIndex = await fetch(`${base}/blog`, { redirect: "manual" });
      expect(toIndex.status).toBe(301);
      expect(toIndex.headers.get("location")).toBe("/blog/");

      const redirect = await fetch(`${base}/blog/hello`, { redirect: "manual" });
      expect(redirect.status).toBe(301);
      expect(redirect.headers.get("location")).toBe("/blog/hello/");

      const image = await fetch(html.match(/src="(\/@fs\/[^"]+\.png)"/)![1]!.replace(/^/, base));
      expect(image.status).toBe(200);
      // Drafts aren't served: Vite's own fallback answers instead.
      expect(await fetch(`${base}/blog/draft-post/`).then((r) => r.text())).not.toContain(
        "Draft body",
      );
    } finally {
      await server.close();
    }
  });
});
