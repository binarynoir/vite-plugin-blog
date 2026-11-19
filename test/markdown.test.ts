import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLoader, resolveOptions } from "../src/content.js";
import type { BlogOptions, Directive } from "../src/index.js";
import { countWords } from "../src/markdown.js";

let dir: string;

afterEach(() => rmSync(dir, { recursive: true, force: true }));

function site(posts: Record<string, string>, extra: Record<string, string> = {}) {
  dir = mkdtempSync(path.join(tmpdir(), "blog-content-"));
  mkdirSync(path.join(dir, "posts"));
  writeFileSync(
    path.join(dir, "post.html"),
    "<html><head></head><body><!--blog:content--></body></html>",
  );
  for (const [slug, body] of Object.entries(posts))
    writeFileSync(path.join(dir, "posts", `${slug}.md`), body);
  for (const [file, body] of Object.entries(extra)) writeFileSync(path.join(dir, file), body);
}

function post(body: string, front = "") {
  return `---\ntitle: A post\ndescription: About it.\ndate: 2026-11-01\n${front}---\n\n${body}\n`;
}

async function load(options: Partial<BlogOptions> = {}) {
  const resolved = resolveOptions(
    { dir, template: "post.html", highlight: false, now: new Date("2026-11-19"), ...options },
    { root: dir, base: "/" },
  );
  return createLoader(resolved, (file) => `./${path.basename(file)}`)();
}

describe("checks", () => {
  it("reports missing and too-long fields, with the file", async () => {
    site({ bad: `---\ntitle: ${"x".repeat(71)}\ndate: soon\n---\n\nHi.\n` });
    const { issues } = await load();
    expect(issues.map((issue) => issue.message)).toEqual([
      "title is 71 characters; the limit is 70",
      "description is missing",
      'date "soon" isn\'t a date (use 2026-12-02)',
    ]);
    expect(issues[0]!.file).toBe(path.join(dir, "posts", "bad.md"));
  });

  it("allows only tags from tags.yml, within the limits", async () => {
    site(
      { a: post("Hi.", "tags: [dns, nope]\n"), b: post("Hi.") },
      { "tags.yml": "dns: { name: DNS }\n" },
    );
    const { issues, tags } = await load({ limits: { minTags: 1, maxTags: 1 } });
    expect(tags.dns?.name).toBe("DNS");
    expect(issues.map((issue) => `${path.basename(issue.file)}: ${issue.message}`)).toEqual([
      "a.md: has 2 tags; the limit is 1",
      'a.md: tag "nope" isn\'t in tags.yml',
      "b.md: needs at least 1 tag",
    ]);
  });

  it("reports images without alt text or a file, with the line", async () => {
    site({ a: post("Text.\n\n![](missing.png)") });
    const { issues } = await load();
    expect(issues.map((issue) => issue.message)).toEqual([
      'line 9: image "missing.png" has no alt text',
      'line 9: image "missing.png" doesn\'t exist',
    ]);
  });

  it("checks links between posts, and tells drafts from typos", async () => {
    site({
      a: post("[b](/blog/b/) [draft](/blog/d/) [typo](/blog/nope/) [page](/about/) [ok](/tools/)"),
      b: post("Hi."),
      d: post("Hi.", "draft: true\n"),
    });
    const { issues } = await load({ isKnownPath: (p) => p === "/tools/" });
    expect(issues.map((issue) => issue.message)).toEqual([
      "line 7: link to /blog/d/ goes to a draft post, which isn't published yet",
      'line 7: link to /blog/nope/ goes nowhere: there\'s no post "nope"',
      "line 7: link to /about/ goes nowhere",
    ]);
  });

  it("checks links to the index and tag pages", async () => {
    site({
      a: post(
        "[all](/blog/) [dns](/blog/tag/dns/) [none](/blog/tag/email/) [deep](/blog/a/b/)",
        "tags: [dns]\n",
      ),
    });
    const { issues } = await load();
    expect(issues.map((issue) => issue.message)).toEqual([
      'line 8: link to /blog/tag/email/ goes nowhere: no published post has the tag "email"',
      "line 8: link to /blog/a/b/ goes nowhere",
    ]);
    const off = await load({ tagPages: false });
    expect(off.issues.map((issue) => issue.message)).toContain(
      'line 8: link to /blog/tag/dns/ goes nowhere: no published post has the tag "dns"',
    );
  });

  it("runs the site's own checks", async () => {
    site({ a: post("Hi.", "tools: [nope]\n") });
    const { issues } = await load({
      validate: (p) =>
        (p.data.tools as string[]).includes("nope") ? ['tool "nope" doesn\'t exist'] : [],
    });
    expect(issues.map((issue) => issue.message)).toEqual(['tool "nope" doesn\'t exist']);
  });

  it("leaves out drafts and scheduled posts, and sorts newest first", async () => {
    site({
      old: post("Hi."),
      new: post("Hi.").replace("2026-11-01", "2026-11-10"),
      draft: post("Hi.", "draft: true\n"),
      later: post("Hi.").replace("2026-11-01", "2026-12-25"),
    });
    expect((await load()).posts.map((p) => p.slug)).toEqual(["new", "old"]);
    const preview = await load({ preview: true });
    expect(preview.posts.map((p) => p.slug)).toEqual(["later", "new", "draft", "old"]);
    expect(preview.posts[0]!.scheduled).toBe(true);
  });
});

describe("markdown", () => {
  it("gives headings unique ids, and lists ## and ### in the table of contents", async () => {
    site({ a: post("## Set up DNS\n\n### Step `one`\n\n## Set up DNS\n\n#### Deep") });
    const [result] = (await load()).posts;
    expect(result!.toc).toEqual([
      { level: 2, id: "set-up-dns", text: "Set up DNS" },
      { level: 3, id: "step-one", text: "Step one" },
      { level: 2, id: "set-up-dns-1", text: "Set up DNS" },
    ]);
    expect(result!.html).toContain('<h4 id="deep">Deep <a class="heading-anchor" href="#deep"');
  });

  it("renders leaf and container directives, and reports unknown ones", async () => {
    const tool: Directive = {
      kind: "leaf",
      render: ({ args, error }) => {
        if (!args) error("needs a tool name");
        return `<div class="tool" data-tool="${args}"></div>`;
      },
    };
    site({
      a: post(
        "::: tool check example.com\n\n::: tool\n\n::: warning\nCareful *now*.\n:::\n\n::: nope\n",
      ),
    });
    const { posts, issues } = await load({ directives: { tool } });
    expect(posts[0]!.html).toContain('<div class="tool" data-tool="check example.com"></div>');
    expect(posts[0]!.html).toContain(
      '<aside class="callout callout-warning">\n<p class="callout-title">Warning</p>\n<p>Careful <em>now</em>.</p>\n</aside>',
    );
    expect(issues.map((issue) => issue.message)).toEqual([
      "line 9: ::: tool: needs a tool name",
      'line 15: unknown directive "::: nope"',
    ]);
  });

  it("nests containers", async () => {
    site({ a: post("::: note Outer\n::: tip Inner\nDeep.\n:::\nAfter.\n:::\n\nOutside.") });
    const { posts, issues } = await load();
    expect(issues).toEqual([]);
    expect(posts[0]!.html.replace(/\n/g, "")).toBe(
      '<aside class="callout callout-note"><p class="callout-title">Outer</p>' +
        '<aside class="callout callout-tip"><p class="callout-title">Inner</p><p>Deep.</p></aside>' +
        "<p>After.</p></aside><p>Outside.</p>",
    );
  });

  it("counts prose words, not code, and rounds reading time up", async () => {
    expect(
      countWords("One two [three](/x).\n\n```js\nnot counted at all\n```\n\n::: tip\nFour\n:::"),
    ).toBe(4);
    site({ a: post(Array.from({ length: 231 }, () => "word").join(" ")) });
    expect((await load()).posts[0]!.readingMinutes).toBe(2);
  });
});
