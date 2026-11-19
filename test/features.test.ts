import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  return { outDir, read, has };
}

describe("announcement banner", () => {
  it("goes first in <body> on every page, with the newest announcement and a count", async () => {
    const { read, has, outDir } = await built();
    for (const page of ["index.html", "blog/index.html", "blog/hello/index.html"]) {
      const html = read(page);
      expect(html).toMatch(/<body>\s*<div class="blog-announcement" role="region"/);
      expect(html).toContain(
        '<html lang="en" data-blog-announcement="notice@2026-11-15T00:00:00.000Z">',
      );
    }
    const home = read("index.html");
    // The newest announcement (its title, since it's `true`), linked to its post.
    expect(home).toContain(
      '<a class="blog-announcement-text" href="/blog/notice/">Maintenance notice</a>',
    );
    // Two are current: the ended one (`until` passed) isn't counted.
    expect(home).toContain(
      '<a class="blog-announcement-count" href="/blog/announcements/" aria-label="2 announcements"',
    );
    expect(home).not.toContain("later@");

    // The script and styles are files, so the page needs no inline code.
    const script = home.match(
      /<script src="(\/assets\/blog-announcement-\w+\.js)"><\/script>\s*<\/head>/,
    )?.[1];
    const styles = home.match(
      /<link rel="stylesheet" href="(\/assets\/blog-announcement-\w+\.css)">/,
    )?.[1];
    expect(script && has(script.slice(1))).toBe(true);
    expect(styles && has(styles.slice(1))).toBe(true);
    expect(home).not.toMatch(/<script>(?!\s*<\/script>)|<script(?![^>]*\b(src|type)=)[^>]*>[^<]/);
    expect(home).not.toMatch(/\sstyle="/);
    expect(readFileSync(path.join(outDir, script!.slice(1)), "utf8")).toContain(
      "blog-announcement-dismissed",
    );

    const list = read("blog/announcements/index.html");
    expect(list).toContain('<meta name="robots" content="noindex">');
    expect(list).toContain("/blog/notice/");
    expect(list).toContain("/blog/hello/");
    expect(list).not.toContain('href="/blog/later/"');
  });

  it("goes only where a page asks, with placement: marker", async () => {
    const { read } = await built({ announcements: { placement: "marker" } });
    expect(read("index.html")).not.toContain("blog-announcement");
  });

  it("skips pages include() turns down, and can be turned off", async () => {
    const some = await built({ announcements: { include: (page) => page.startsWith("/blog/") } });
    expect(some.read("index.html")).not.toContain("blog-announcement");
    expect(some.read("blog/index.html")).toContain('class="blog-announcement"');

    const none = await built({ announcements: false });
    expect(none.read("blog/index.html")).not.toContain('class="blog-announcement"');
    expect(none.has("blog/announcements/index.html")).toBe(true);
  });
});

describe("feeds and sitemap", () => {
  it("writes RSS, Atom and JSON feeds of listed, published posts with whole articles", async () => {
    const { read } = await built();
    const rss = read("blog/feed.xml");
    expect(rss).toContain('<atom:link href="https://example.com/blog/feed.xml" rel="self"');
    expect(rss).toContain("<dc:creator>jane@example.com (Jane Doe)</dc:creator>");
    // Images in the article point at the built file, by absolute URL.
    expect(rss).toMatch(
      /<content:encoded><!\[CDATA\[[\s\S]*src="https:\/\/example\.com\/assets\/dot-[\w-]+\.png"/,
    );
    expect(rss).toContain('href="https://example.com/blog/later/"');
    for (const hidden of ["quiet", "draft-post", "future"])
      expect(rss).not.toContain(`/blog/${hidden}/`);

    const atom = read("blog/atom.xml");
    expect(atom).toContain('<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en-US">');
    expect(atom).toContain("<id>https://example.com/blog/hello/</id>");

    const json = JSON.parse(read("blog/feed.json")) as { items: { url: string; image?: string }[] };
    expect(json.items.map((item) => item.url)).toEqual([
      "https://example.com/blog/notice/",
      "https://example.com/blog/hello/",
      "https://example.com/blog/later/",
    ]);
    expect(json.items[1]!.image).toMatch(/^https:\/\/example\.com\/blog\/images\/dot-\w{8}\.png$/);
  });

  it("writes a sitemap of the blog's indexable pages", async () => {
    const { read } = await built();
    const sitemap = read("blog/sitemap.xml");
    expect(sitemap).toContain("<loc>https://example.com/blog/</loc>");
    expect(sitemap).toContain("<loc>https://example.com/blog/tag/dns/</loc>");
    expect(sitemap).toContain(
      "<loc>https://example.com/blog/hello/</loc><lastmod>2026-11-03T00:00:00.000Z</lastmod>",
    );
    expect(sitemap).not.toContain("/blog/quiet/");
    expect(sitemap).not.toContain("/blog/announcements/");
  });

  it("writes neither without the site option", async () => {
    const { has } = await built({ site: undefined });
    expect(has("blog/feed.xml")).toBe(false);
    expect(has("blog/sitemap.xml")).toBe(false);
  });
});

describe("posts", () => {
  it("get social card tags, structured data, feed links and a byline", async () => {
    const { read, has } = await built();
    const html = read("blog/hello/index.html");
    const image = html.match(
      /<meta property="og:image" content="https:\/\/example\.com\/(blog\/images\/dot-\w{8}\.png)">/,
    )?.[1];
    expect(image && has(image)).toBe(true);
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain(
      '<link rel="alternate" type="application/rss+xml" title="Blog" href="/blog/feed.xml">',
    );
    const data = JSON.parse(
      html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]!,
    ) as Record<string, unknown>;
    expect(data["@type"]).toBe("BlogPosting");
    expect(data.author).toEqual([
      { "@type": "Person", name: "Jane Doe", url: "https://example.com/jane" },
    ]);
    expect(html).toContain('By <a href="https://example.com/jane">Jane Doe</a>');
  });

  it("link to the newer and older listed posts when none are related", async () => {
    const { read } = await built({ related: 0 });
    const html = read("blog/hello/index.html");
    expect(html).toContain('<a class="blog-post-nav-newer" rel="prev" href="/blog/notice/">');
    expect(html).toContain('<a class="blog-post-nav-older" rel="next" href="/blog/later/">');
    // The unlisted post (dated between them) is skipped.
    expect(html).not.toContain('href="/blog/quiet/"');
  });

  it("can be unlisted: built and noindex, but in no list or feed", async () => {
    const { read } = await built();
    expect(read("blog/quiet/index.html")).toContain('<meta name="robots" content="noindex">');
    expect(read("blog/index.html")).not.toContain("/blog/quiet/");
  });
});

describe("lists", () => {
  it("split into pages of pageSize posts", async () => {
    const { read, has } = await built({ pageSize: 1 });
    expect(read("blog/index.html")).toContain(
      '<a class="blog-pager-next" href="/blog/page/2/" rel="next" data-page="2">Next →</a>',
    );
    const second = read("blog/page/2/index.html");
    expect(second).toContain("<title>Blog · Page 2 of 3</title>");
    expect(second).toContain('<link rel="prev" href="/blog/">');
    expect(second).toContain("/blog/hello/");
    expect(has("blog/page/3/index.html")).toBe(true);
    expect(has("blog/tag/homelab/page/2/index.html")).toBe(true);
  });

  it("use the labels given", async () => {
    const { read } = await built({ labels: { readingTime: "{n} Min. Lesezeit", blog: "Notizen" } });
    const index = read("blog/index.html");
    expect(index).toContain("<title>Notizen</title>");
    expect(index).toContain("1 Min. Lesezeit");
  });
});

describe("dev", () => {
  it("serves the banner files and the feeds", async () => {
    const { inline } = config();
    const server = await createServer({ ...inline, server: { port: 0 } });
    await server.listen();
    try {
      const base = server.resolvedUrls!.local[0]!.replace(/\/$/, "");
      const page = await fetch(`${base}/blog/`).then((response) => response.text());
      expect(page).toContain('<script src="/__vite-plugin-blog/announcement.js"></script>');
      const script = await fetch(`${base}/__vite-plugin-blog/announcement.js`);
      expect(script.headers.get("content-type")).toContain("text/javascript");
      const feed = await fetch(`${base}/blog/feed.xml`);
      expect(feed.headers.get("content-type")).toContain("application/rss+xml");
      expect(await feed.text()).toContain("<title>Hello DNS</title>");
    } finally {
      await server.close();
    }
  });
});

describe("tags.yml", () => {
  it("fails on unknown fields, such as a description split by unquoted commas", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vite-plugin-blog-tags-"));
    outDirs.push(dir);
    mkdirSync(path.join(dir, "posts"));
    writeFileSync(
      path.join(dir, "tags.yml"),
      "email: { name: Email, description: SPF, DKIM and DMARC }\n",
    );
    writeFileSync(
      path.join(dir, "posts", "a.md"),
      "---\ntitle: A\ndescription: B\ndate: 2026-11-01\ntags: [email]\n---\nText.\n",
    );
    const { inline } = config({ dir });
    await expect(build(inline)).rejects.toThrow(/tag "email" has unknown field "DKIM and DMARC"/);
  });
});
