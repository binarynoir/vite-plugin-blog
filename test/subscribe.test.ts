import { describe, expect, it } from "vitest";
import { feedLinks } from "../src/subscribe.js";

describe("feedLinks", () => {
  it("reads the virtual module's { rss, atom, json } form, in that order", () => {
    expect(feedLinks({ json: "/blog/feed.json", rss: "/blog/feed.xml" })).toEqual([
      { kind: "rss", url: "/blog/feed.xml", type: "application/rss+xml", name: "RSS" },
      { kind: "json", url: "/blog/feed.json", type: "application/feed+json", name: "JSON Feed" },
    ]);
  });

  it("orders a list as RSS, Atom, JSON Feed and drops nothing", () => {
    const atom = {
      kind: "atom" as const,
      url: "/a.xml",
      type: "application/atom+xml",
      name: "Atom",
    };
    const rss = { kind: "rss" as const, url: "/r.xml", type: "application/rss+xml", name: "RSS" };
    expect(feedLinks([atom, rss])).toEqual([rss, atom]);
    expect(feedLinks({})).toEqual([]);
  });
});
