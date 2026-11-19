import { describe, expect, it } from "vitest";
import { htmlToText } from "../src/search-index.js";
import { cardTree, pagerTree, resultCount, searchFormTree } from "../src/shared/markup.js";
import { DEFAULT_LABELS } from "../src/shared/labels.js";
import {
  isExplorerActive,
  pageWindow,
  paginate,
  readExplorerState,
  searchPosts,
  sortPosts,
  writeExplorerState,
} from "../src/shared/search.js";
import { toHtml } from "../src/shared/tree.js";
import type { BlogSearchPost } from "../src/shared/types.js";

function post(slug: string, fields: Partial<BlogSearchPost> = {}): BlogSearchPost {
  return {
    slug,
    url: `/blog/${slug}/`,
    title: slug,
    description: "",
    date: "2026-11-01T00:00:00.000Z",
    dateText: "November 1, 2026",
    dateTime: "2026-11-01",
    tags: [],
    authors: [],
    pinned: false,
    featured: false,
    readingMinutes: 1,
    headings: [],
    text: "",
    ...fields,
  };
}

const posts = [
  post("vpn", {
    title: "Is your VPN leaking?",
    text: "WebRTC and DNS leaks",
    date: "2026-11-03T00:00:00Z",
  }),
  post("dnssec", { title: "DNSSEC in plain words", tags: ["dns"], date: "2026-11-02T00:00:00Z" }),
  post("resume", {
    title: "Résumé of the year",
    description: "What changed",
    date: "2026-10-01T00:00:00Z",
  }),
  post("spf", {
    title: "SPF records",
    headings: ["Why DNS matters"],
    date: "2026-11-04T00:00:00Z",
  }),
];
const tags = { dns: { name: "DNS", url: "/blog/tag/dns/" } };

describe("searchPosts", () => {
  it("ranks title matches over tags, headings and text", () => {
    const found = searchPosts(posts, "dns", tags).map((result) => result.post.slug);
    expect(found).toEqual(["dnssec", "spf", "vpn"]);
  });

  it("needs every word to match, and ignores accents and case", () => {
    expect(searchPosts(posts, "vpn webrtc").map((r) => r.post.slug)).toEqual(["vpn"]);
    expect(searchPosts(posts, "vpn spf")).toEqual([]);
    expect(searchPosts(posts, "RESUME").map((r) => r.post.slug)).toEqual(["resume"]);
  });

  it("matches nothing for an empty query", () => {
    expect(searchPosts(posts, "  ")).toEqual([]);
  });
});

describe("sorting and paging", () => {
  it("sorts by date either way, and keeps the order for relevance", () => {
    expect(sortPosts(posts, "newest").map((p) => p.slug)).toEqual([
      "spf",
      "vpn",
      "dnssec",
      "resume",
    ]);
    expect(sortPosts(posts, "oldest").map((p) => p.slug)).toEqual([
      "resume",
      "dnssec",
      "vpn",
      "spf",
    ]);
    expect(sortPosts(posts, "relevance")).toEqual(posts);
  });

  it("clamps the page to the pages there are", () => {
    expect(paginate([1, 2, 3, 4, 5], 2, 2)).toEqual({ items: [3, 4], page: 2, pageCount: 3 });
    expect(paginate([1, 2, 3], 9, 2)).toEqual({ items: [3], page: 2, pageCount: 2 });
    expect(paginate([], 1, 12)).toEqual({ items: [], page: 1, pageCount: 1 });
  });

  it("shows every page number up to 7, then gaps", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]);
    expect(pageWindow(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pageWindow(20, 20)).toEqual([1, "gap", 16, 17, 18, 19, 20]);
  });
});

describe("explorer state", () => {
  it("round-trips through the address, leaving defaults out", () => {
    expect(writeExplorerState({ q: "", sort: "newest", page: 1 })).toBe("");
    expect(writeExplorerState({ q: "dns", sort: "relevance", page: 1 })).toBe("?q=dns");
    const state = readExplorerState("?q=dns&sort=oldest&page=2");
    expect(state).toEqual({ q: "dns", sort: "oldest", page: 2 });
    expect(readExplorerState(writeExplorerState(state))).toEqual(state);
  });

  it("ignores bad values", () => {
    expect(readExplorerState("?sort=random&page=-3")).toEqual({ q: "", sort: "newest", page: 1 });
    expect(readExplorerState("?sort=relevance")).toEqual({ q: "", sort: "newest", page: 1 });
  });

  it("is active with a query, another order or a later page", () => {
    expect(isExplorerActive({ q: "", sort: "newest", page: 1 })).toBe(false);
    expect(isExplorerActive({ q: "x", sort: "relevance", page: 1 })).toBe(true);
    expect(isExplorerActive({ q: "", sort: "oldest", page: 1 })).toBe(true);
  });
});

describe("shared markup", () => {
  it("writes a card whose tags link to their pages", () => {
    const html = toHtml(cardTree(posts[1]!, { labels: DEFAULT_LABELS, tags }));
    expect(html).toBe(
      '<article class="blog-card"><div class="blog-card-body"><h3 class="blog-card-title"><a href="/blog/dnssec/">DNSSEC in plain words</a></h3><p class="blog-card-description"></p><p class="blog-meta"><time datetime="2026-11-01">November 1, 2026</time><span>1 min read</span></p><ul class="blog-tags"><li><a class="blog-tag" href="/blog/tag/dns/">DNS</a></li></ul></div></article>',
    );
  });

  it("writes numbered pages with the current one marked", () => {
    const html = toHtml(
      pagerTree({ page: 2, pageCount: 3, href: (n) => `/blog/page/${n}/`, labels: DEFAULT_LABELS }),
    );
    expect(html).toContain('<li><span aria-current="page">2</span></li>');
    expect(html).toContain(
      '<a class="blog-pager-prev" href="/blog/page/1/" rel="prev" data-page="1">',
    );
    expect(html).toContain('<a href="/blog/page/3/" data-page="3" aria-label="Page 3">3</a>');
    expect(pagerTree({ page: 1, pageCount: 1, href: String, labels: DEFAULT_LABELS })).toBeNull();
  });

  it("keeps the sort menu's space but hides it until a script runs", () => {
    const html = toHtml(
      searchFormTree({
        labels: DEFAULT_LABELS,
        indexUrl: "/blog/",
        query: "",
        sort: "newest",
        interactive: false,
      }),
    );
    expect(html).toContain('<label class="blog-sort" data-pending>');
    expect(html).toContain('<select name="sort" data-blog-control="sort" disabled>');
    expect(html).not.toContain("Best match");
  });

  it("counts results with the query", () => {
    expect(resultCount(DEFAULT_LABELS, 1, "")).toBe("1 post");
    expect(resultCount(DEFAULT_LABELS, 3, " dns ")).toBe("3 posts for “dns”");
  });
});

describe("htmlToText", () => {
  it("drops tags, heading anchors and scripts, and decodes entities", () => {
    expect(
      htmlToText(
        '<h2 id="a">Setup <a class="heading-anchor" href="#a">#</a></h2><p>Fish &amp; chips&#33;</p><script>x()</script>',
      ),
    ).toBe("Setup Fish & chips!");
  });
});
