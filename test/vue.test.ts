import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import { DEFAULT_LABELS } from "../src/shared/labels.js";
import { cardTree } from "../src/shared/markup.js";
import { toHtml } from "../src/shared/tree.js";
import type { BlogClientConfig, BlogPostSummary } from "../src/shared/types.js";
import { BlogExplorer, BlogPager, BlogPostCard, BlogPostList } from "../src/vue.js";

const post: BlogPostSummary = {
  slug: "hello",
  url: "/blog/hello/",
  title: "Hello <DNS>",
  description: "A first post.",
  date: "2026-11-01T00:00:00.000Z",
  dateText: "November 1, 2026",
  dateTime: "2026-11-01",
  month: "2026-11",
  tags: ["dns", "misc"],
  authors: [],
  pinned: true,
  featured: false,
  cover: "/blog/images/dot.png",
  readingMinutes: 2,
  data: {},
};
const tags = { dns: { name: "DNS", url: "/blog/tag/dns/" }, misc: { name: "Misc" } };

const render = (component: Parameters<typeof h>[0], props: Record<string, unknown>) =>
  renderToString(createSSRApp({ render: () => h(component, props) }));

describe("Vue components", () => {
  it("render a card exactly as the static pages do", async () => {
    const html = await render(BlogPostCard, { post, tags });
    // Vue writes an empty attribute bare (`alt`); the DOM is the same as `alt=""`.
    expect(html).toBe(
      toHtml(cardTree(post, { labels: DEFAULT_LABELS, tags })).replace('alt=""', "alt"),
    );
    expect(html).toContain('<p class="blog-card-label">Pinned</p>');
    expect(html).toContain("Hello &lt;DNS&gt;");
  });

  it("render a list, cut to its limit", async () => {
    const html = await render(BlogPostList, {
      posts: [post, { ...post, slug: "b" }],
      tags,
      limit: 1,
    });
    expect(html.match(/<li><article/g)).toHaveLength(1);
  });

  it("render a pager with real links", async () => {
    const html = await render(BlogPager, {
      page: 1,
      pageCount: 2,
      href: (n: number) => `/blog/page/${n}/`,
    });
    expect(html).toContain(
      '<a class="blog-pager-next" href="/blog/page/2/" rel="next" data-page="2">Next →</a>',
    );
  });

  it("render the explorer's search form, with the sort menu ready", async () => {
    const config: BlogClientConfig = {
      indexUrl: "/blog/",
      searchUrl: "/blog/search.json",
      tag: "dns",
      tagName: "DNS",
      pageSize: 12,
      labels: DEFAULT_LABELS,
    };
    const html = await render(BlogExplorer, { config, resultsSelector: "#none" });
    expect(html).toContain('placeholder="Search DNS posts"');
    expect(html).toContain('<label class="blog-sort">');
    expect(html).not.toContain("data-pending");
    expect(html).toContain('<div class="blog-results" hidden>');
    expect(html).not.toContain("blog-browse");
  });

  it("render the browse bar from the config, with the date menu ready", async () => {
    const config: BlogClientConfig = {
      indexUrl: "/blog/",
      searchUrl: "/blog/search.json",
      tag: "dns",
      tagName: "DNS",
      pageSize: 12,
      labels: DEFAULT_LABELS,
      browse: {
        topics: [
          { name: "All", url: "/blog/", count: 2 },
          { tag: "dns", name: "DNS", url: "/blog/tag/dns/", count: 1 },
        ],
        dates: [
          {
            value: "2026",
            count: 1,
            months: [{ value: "2026-11", label: "Nov", name: "November 2026", count: 1 }],
          },
        ],
        feed: { url: "/blog/feed.xml", type: "application/rss+xml", name: "RSS" },
      },
    };
    const html = await render(BlogExplorer, { config, resultsSelector: "#none" });
    expect(html).toContain('<div class="blog-browse">');
    expect(html).toMatch(
      /<a class="blog-browse-tab" href="\/blog\/tag\/dns\/" aria-current="page"/,
    );
    expect(html).toContain('<details class="blog-menu" data-blog-control="date-menu">');
    expect(html).toContain('aria-label="Subscribe"');
    // Off, the explorer leaves the bar out, for list pages the build didn't give one.
    const off = await render(BlogExplorer, { config, browse: false, resultsSelector: "#none" });
    expect(off).not.toContain("blog-browse");
  });
});
