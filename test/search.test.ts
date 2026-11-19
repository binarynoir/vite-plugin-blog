import { describe, expect, it } from "vitest";
import { htmlToText } from "../src/search-index.js";
import {
  browseTree,
  cardTree,
  dateName,
  pagerTree,
  resultCount,
  searchFormTree,
} from "../src/shared/markup.js";
import { DEFAULT_LABELS } from "../src/shared/labels.js";
import {
  filterByDate,
  isExplorerActive,
  pageWindow,
  paginate,
  readExplorerState,
  searchPosts,
  sortPosts,
  writeExplorerState,
} from "../src/shared/search.js";
import { toHtml } from "../src/shared/tree.js";
import type { BlogBrowse, BlogSearchPost } from "../src/shared/types.js";

function post(slug: string, fields: Partial<BlogSearchPost> = {}): BlogSearchPost {
  return {
    slug,
    url: `/blog/${slug}/`,
    title: slug,
    description: "",
    date: "2026-11-01T00:00:00.000Z",
    dateText: "November 1, 2026",
    dateTime: "2026-11-01",
    month: "2026-11",
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
    expect(writeExplorerState({ q: "", date: "", sort: "newest", page: 1 })).toBe("");
    expect(writeExplorerState({ q: "dns", date: "", sort: "relevance", page: 1 })).toBe("?q=dns");
    const state = readExplorerState("?q=dns&date=2026-11&sort=oldest&page=2");
    expect(state).toEqual({ q: "dns", date: "2026-11", sort: "oldest", page: 2 });
    expect(readExplorerState(writeExplorerState(state))).toEqual(state);
  });

  it("ignores bad values", () => {
    const plain = { q: "", date: "", sort: "newest", page: 1 };
    expect(readExplorerState("?sort=random&page=-3")).toEqual(plain);
    expect(readExplorerState("?sort=relevance")).toEqual(plain);
    expect(readExplorerState("?date=2026-13")).toEqual(plain);
    expect(readExplorerState("?date=26")).toEqual(plain);
    expect(readExplorerState("?date=2026").date).toBe("2026");
  });

  it("is active with a query, a date, another order or a later page", () => {
    expect(isExplorerActive({ q: "", date: "", sort: "newest", page: 1 })).toBe(false);
    expect(isExplorerActive({ q: "x", date: "", sort: "relevance", page: 1 })).toBe(true);
    expect(isExplorerActive({ q: "", date: "2026", sort: "newest", page: 1 })).toBe(true);
    expect(isExplorerActive({ q: "", date: "", sort: "oldest", page: 1 })).toBe(true);
  });

  it("filters by year or month", () => {
    const list = [
      post("a", { month: "2026-11" }),
      post("b", { month: "2026-10" }),
      post("c", { month: "2025-11" }),
    ];
    expect(filterByDate(list, "").map((p) => p.slug)).toEqual(["a", "b", "c"]);
    expect(filterByDate(list, "2026").map((p) => p.slug)).toEqual(["a", "b"]);
    expect(filterByDate(list, "2026-10").map((p) => p.slug)).toEqual(["b"]);
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

  it("counts results with the query and date", () => {
    expect(resultCount(DEFAULT_LABELS, 1, "")).toBe("1 post");
    expect(resultCount(DEFAULT_LABELS, 3, " dns ")).toBe("3 posts for “dns”");
    expect(resultCount(DEFAULT_LABELS, 2, "dns", "November 2026")).toBe(
      "2 posts for “dns” from November 2026",
    );
  });

  const months = (year: string, counts: Record<number, number>) =>
    Array.from({ length: 12 }, (_, i) => ({
      value: `${year}-${String(i + 1).padStart(2, "0")}`,
      label: new Date(Date.UTC(2026, i, 15)).toLocaleString("en", {
        month: "short",
        timeZone: "UTC",
      }),
      name: `${new Date(Date.UTC(2026, i, 15)).toLocaleString("en", { month: "long", timeZone: "UTC" })} ${year}`,
      count: counts[i + 1] ?? 0,
    }));
  const browse: BlogBrowse = {
    topics: [
      { name: "All", url: "/blog/", count: 3 },
      { tag: "dns", name: "DNS", url: "/blog/tag/dns/", count: 2 },
    ],
    dates: [{ value: "2026", count: 3, months: months("2026", { 10: 1, 11: 2 }) }],
    feed: { url: "/blog/feed.xml", type: "application/rss+xml", name: "RSS" },
  };

  it("names a date filter", () => {
    expect(dateName(browse, "2026")).toBe("2026");
    expect(dateName(browse, "2026-11")).toBe("November 2026");
    expect(dateName(browse, "2019")).toBe("");
    expect(dateName(browse, "")).toBe("");
  });

  it("writes the browse bar: tabs with counts, the date menu and the feed icon", () => {
    const html = toHtml(
      browseTree({
        browse,
        labels: DEFAULT_LABELS,
        current: "dns",
        date: "",
        dateHref: (date) => `/blog/tag/dns/?date=${date}`,
        interactive: false,
      }),
    );
    expect(html).toContain('<nav class="blog-browse-topics" aria-label="Topics">');
    expect(html).toContain(
      '<a class="blog-browse-tab" href="/blog/tag/dns/" aria-current="page" data-blog-control="topic">DNS<span class="blog-browse-count" aria-hidden="true">2</span><span class="blog-visually-hidden"> (2 posts)</span></a>',
    );
    expect(html).toContain(
      '<details class="blog-menu" data-blog-control="date-menu" data-pending>',
    );
    expect(html).toContain('aria-label="November 2026 (2 posts)"');
    // Months without posts show, greyed out, so the grid stays a calendar.
    expect(html).toContain('<span class="blog-menu-choice is-empty" aria-hidden="true">Jan</span>');
    expect(html).toContain(
      '<a class="blog-browse-feed" href="/blog/feed.xml" type="application/rss+xml" title="Subscribe" aria-label="Subscribe">',
    );
  });

  it("marks the chosen date on the menu button", () => {
    const html = toHtml(
      browseTree({
        browse: { ...browse, topics: [] },
        labels: DEFAULT_LABELS,
        current: "",
        date: "2026-11",
        dateHref: (date) => `?date=${date}`,
        interactive: true,
      }),
    );
    expect(html).not.toContain("blog-browse-topics");
    expect(html).toContain('<details class="blog-menu is-active" data-blog-control="date-menu">');
    expect(html).toContain("<span>November 2026</span>");
    expect(html).toContain('href="?date=2026-11" aria-current="true"');
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
