import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { MarkdownIt } from "markdown-it";
import { parse } from "yaml";
import { parsePostDate, resolveTimeZone } from "./dates.js";
import { createCodeHighlighter, type CodeHighlighter } from "./highlight.js";
import { countWords, createMarkdown, fenceLanguages, type RenderEnv } from "./markdown.js";
import { checkLinks } from "./pages.js";
import { DEFAULT_LABELS } from "./shared/labels.js";
import type {
  BlogAnnouncement,
  BlogAuthor,
  BlogIssue,
  BlogLabels,
  BlogOptions,
  BlogPost,
  BlogPostSource,
  BlogTag,
} from "./types.js";
import { joinUrl, normalizeBase, readFrontmatter, toRecord, toStringList, toText } from "./util.js";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Options with defaults applied and paths made absolute. */
export interface ResolvedBlogOptions extends BlogOptions {
  dir: string;
  template: string;
  /** The blog's path without Vite's base: `/blog/`. */
  base: string;
  /** Vite's `base`: `/`. */
  siteBase: string;
  timeZone: string;
  locale: string;
  wordsPerMinute: number;
  titleSuffix: string;
  labels: BlogLabels;
  pageSize: number;
}

export { DEFAULT_LABELS };

/** A local file the build copies to a fixed address, for absolute URLs in social cards and feeds. */
export interface BlogAssetCopy {
  file: string;
  /** Relative to the output folder: `blog/images/cover-1a2b3c4d.png`. */
  fileName: string;
}

export interface BlogContent {
  /** Every post the build writes, newest first: drafts and scheduled ones too, with `preview`. */
  posts: BlogPost[];
  /** Posts in lists, feeds and the sitemap: `posts` without unlisted ones. */
  listed: BlogPost[];
  /** Posts in the announcement banner, newest first. */
  announcements: BlogPost[];
  /** Files to copy, such as covers for social cards. */
  copies: BlogAssetCopy[];
  /** Links from each post to paths on the site, checked once every page is known. */
  links: Map<BlogPost, { href: string; line?: number }[]>;
  /** Posts left out of this build, by slug, so a link to one can say why. */
  hidden: Map<string, "draft" | "scheduled">;
  issues: BlogIssue[];
  /** CSS for the code highlighting classes used. */
  css: string;
  tags: Record<string, BlogTag>;
  /** Every file read, so dev can reload when one changes. */
  files: string[];
}

export function resolveOptions(
  options: BlogOptions,
  vite: { root: string; base: string },
): ResolvedBlogOptions {
  return {
    ...options,
    dir: path.resolve(vite.root, options.dir),
    template: path.resolve(vite.root, options.template),
    base: normalizeBase(options.base ?? "/blog/"),
    siteBase: normalizeBase(vite.base.startsWith("/") ? vite.base : "/"),
    timeZone: resolveTimeZone(options.timeZone),
    locale: options.locale ?? "en-US",
    wordsPerMinute: options.wordsPerMinute ?? 230,
    titleSuffix: options.titleSuffix ?? "",
    labels: { ...DEFAULT_LABELS, ...options.labels },
    pageSize: Math.max(0, Math.floor(options.pageSize ?? 0)),
  };
}

/** A post's path on the site, without Vite's base: `/blog/vpn-leaks/`. */
export function postPath(options: ResolvedBlogOptions, slug: string): string {
  return `${options.base}${slug}/`;
}

function readYamlFile(file: string, issues: BlogIssue[]): Record<string, unknown> | null {
  if (!existsSync(file)) return null;
  try {
    return toRecord(parse(readFileSync(file, "utf8")));
  } catch (error) {
    issues.push({ file, message: `invalid YAML: ${(error as Error).message}` });
    return {};
  }
}

function readTags(options: ResolvedBlogOptions, issues: BlogIssue[], files: string[]) {
  if (options.tags) return options.tags;
  const file = path.join(options.dir, "tags.yml");
  files.push(file);
  const data = readYamlFile(file, issues);
  if (!data) return null;
  const tags: Record<string, BlogTag> = {};
  for (const [id, value] of Object.entries(data)) {
    const record = toRecord(value);
    // `{ name: Email, description: SPF, DKIM and DMARC }` parses as fields `DKIM and
    // DMARC`: commas split a flow mapping. Say so, rather than cutting the text short.
    const unknown = Object.keys(record).filter((key) => key !== "name" && key !== "description");
    if (unknown.length) {
      issues.push({
        file,
        message: `tag "${id}" has unknown field${unknown.length > 1 ? "s" : ""} ${unknown.map((key) => `"${key}"`).join(", ")}. If they're part of a description with commas, quote it or write the tag on separate lines`,
      });
    }
    tags[id] = {
      name: toText(record.name) || id,
      description: toText(record.description) || undefined,
    };
  }
  return tags;
}

function readAuthors(options: ResolvedBlogOptions, issues: BlogIssue[], files: string[]) {
  if (options.authors) return options.authors;
  const file = path.join(options.dir, "authors.yml");
  files.push(file);
  const data = readYamlFile(file, issues);
  if (!data) return null;
  const authors: Record<string, BlogAuthor> = {};
  for (const [id, value] of Object.entries(data)) {
    const record = toRecord(value);
    authors[id] = {
      name: toText(record.name) || id,
      url: toText(record.url) || undefined,
      email: toText(record.email) || undefined,
    };
  }
  return authors;
}

/** Every post file under `posts/`: `slug/index.md` or `slug.md`. */
export function findPosts(dir: string, issues: BlogIssue[]): { slug: string; file: string }[] {
  const postsDir = path.join(dir, "posts");
  if (!existsSync(postsDir)) {
    issues.push({ file: postsDir, message: "the blog's posts folder doesn't exist" });
    return [];
  }
  const found = new Map<string, string>();
  for (const entry of readdirSync(postsDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    let slug: string;
    let file: string;
    if (entry.isDirectory()) {
      file = path.join(postsDir, entry.name, "index.md");
      if (!existsSync(file)) continue;
      slug = entry.name;
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      file = path.join(postsDir, entry.name);
      slug = entry.name.slice(0, -3);
    } else continue;
    if (!SLUG.test(slug)) {
      issues.push({
        file,
        message: `"${slug}" isn't a valid address: use lowercase letters, numbers and hyphens`,
      });
      continue;
    }
    const other = found.get(slug);
    if (other) {
      issues.push({ file, message: `the address /${slug}/ is already used by ${other}` });
      continue;
    }
    found.set(slug, file);
  }
  return [...found].map(([slug, file]) => ({ slug, file }));
}

/**
 * Reads `announcement`: `true` (the banner shows the title), a string (the
 * banner's text), or `{ text, until }`, where `until` ends it.
 */
function readAnnouncement(
  value: unknown,
  title: string,
  timeZone: string,
  report: (message: string) => void,
): BlogAnnouncement | undefined {
  if (value === undefined || value === false) return undefined;
  if (value === true) return { text: title };
  if (typeof value === "string") return value.trim() ? { text: value.trim() } : undefined;
  const record = toRecord(value);
  if (!Object.keys(record).length) {
    report("announcement must be true, the banner's text, or { text, until }");
    return undefined;
  }
  const announcement: BlogAnnouncement = { text: toText(record.text) || title };
  if (record.until !== undefined) {
    const until = parsePostDate(record.until, timeZone);
    if (!until) report(`announcement until "${String(record.until)}" isn't a date`);
    // A date alone means the end of that day.
    else
      announcement.until = until.hasTime ? until.date : new Date(until.date.getTime() + 86_400_000);
  }
  return announcement;
}

/** A content hash for a copied file's name, so its address changes when the file does. */
function shortHash(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8);
}

/** Loads, renders and checks the blog. Keeps the highlighter between loads. */
export function createLoader(
  options: ResolvedBlogOptions,
  assetUrl: (file: string, slug: string) => string,
) {
  let highlighter: Promise<CodeHighlighter | null> | undefined;
  let md: MarkdownIt | undefined;

  async function setup() {
    highlighter ??=
      options.highlight === false
        ? Promise.resolve(null)
        : createCodeHighlighter({
            themes: options.highlight?.themes ?? { light: "github-light", dark: "github-dark" },
            classPrefix: options.highlight?.classPrefix ?? "sk-",
          });
    const resolved = await highlighter;
    md ??= createMarkdown({
      directives: options.directives ?? {},
      highlighter: resolved,
      extend: options.markdown,
    });
    return { highlighter: resolved, md };
  }

  return async function load(): Promise<BlogContent> {
    const { highlighter, md } = await setup();
    const issues: BlogIssue[] = [];
    const files: string[] = [options.template];
    const tags = readTags(options, issues, files);
    const authors = readAuthors(options, issues, files);
    const now = options.now ?? new Date();
    const limits = {
      title: 70,
      description: 160,
      minTags: 0,
      maxTags: Infinity,
      ...options.limits,
    };

    const sources: BlogPostSource[] = [];
    for (const { slug, file } of findPosts(options.dir, issues)) {
      files.push(file);
      try {
        const { data, content } = readFrontmatter(readFileSync(file, "utf8"));
        sources.push({ slug, file, data, content });
      } catch (error) {
        issues.push({ file, message: `invalid front matter: ${(error as Error).message}` });
      }
    }

    // Read the front matter of every post first, so links to drafts and
    // scheduled posts can be told apart from links to nothing.
    const drafts = new Map<string, "draft" | "scheduled">();
    const included: BlogPostSource[] = [];
    for (const source of sources) {
      const date = parsePostDate(source.data.date, options.timeZone);
      const draft = source.data.draft === true;
      const scheduled = !!date && date.date > now;
      if (!options.preview && (draft || scheduled)) {
        drafts.set(source.slug, draft ? "draft" : "scheduled");
      } else included.push(source);
    }

    if (highlighter) {
      const langs = new Set<string>();
      for (const source of included)
        for (const lang of fenceLanguages(md, source.content)) langs.add(lang);
      const unknown = await highlighter.load(langs);
      if (unknown.length) {
        console.warn(
          `[vite-plugin-blog] no highlighting for: ${unknown.join(", ")}. Shown as plain text.`,
        );
      }
    }

    const posts: BlogPost[] = [];
    const linksByPost = new Map<BlogPost, RenderEnv["links"]>();
    const copies: BlogAssetCopy[] = [];
    for (const source of included) {
      const problems: string[] = [];
      const report = (message: string) => problems.push(message);
      const { data, slug, file } = source;

      const title = toText(data.title);
      if (!title) report("title is missing");
      else if (title.length > limits.title)
        report(`title is ${title.length} characters; the limit is ${limits.title}`);
      const description = toText(data.description);
      if (!description) report("description is missing");
      else if (description.length > limits.description)
        report(
          `description is ${description.length} characters; the limit is ${limits.description}`,
        );

      const date = parsePostDate(data.date, options.timeZone);
      if (!date)
        report(
          data.date === undefined
            ? "date is missing"
            : `date "${String(data.date)}" isn't a date (use 2026-12-02)`,
        );
      const updated =
        data.updated === undefined ? null : parsePostDate(data.updated, options.timeZone);
      if (data.updated !== undefined && !updated)
        report(`updated "${String(data.updated)}" isn't a date`);
      if (date && updated && updated.date < date.date) report("updated is before date");

      const postTags = toStringList(data.tags);
      if (postTags.length < limits.minTags)
        report(`needs at least ${limits.minTags} tag${limits.minTags === 1 ? "" : "s"}`);
      if (postTags.length > limits.maxTags)
        report(`has ${postTags.length} tags; the limit is ${limits.maxTags}`);
      if (tags) {
        for (const tag of postTags)
          if (!Object.hasOwn(tags, tag)) report(`tag "${tag}" isn't in tags.yml`);
      }

      const named = toStringList(data.authors ?? data.author);
      const authorIds = named.length || !options.defaultAuthor ? named : [options.defaultAuthor];
      const postAuthors: BlogAuthor[] = [];
      for (const id of authorIds) {
        if (authors && !Object.hasOwn(authors, id)) report(`author "${id}" isn't in authors.yml`);
        else postAuthors.push(authors?.[id] ?? { name: id });
      }

      // A local cover is referenced two ways: through Vite on the post's own page,
      // and as a copy at a fixed address for social cards and feeds, which need
      // an absolute URL before Vite has named the bundled file.
      let cover: string | undefined;
      let coverUrl: string | undefined;
      let coverPath: string | undefined;
      const coverValue = toText(data.cover);
      if (coverValue) {
        const coverFile = path.resolve(path.dirname(file), coverValue);
        if (/^[a-z]+:/i.test(coverValue)) cover = coverUrl = coverPath = coverValue;
        else if (coverValue.startsWith("/")) {
          cover = coverPath = coverValue;
          if (options.site) coverUrl = joinUrl(options.site, joinUrl(options.siteBase, coverValue));
        } else if (!existsSync(coverFile)) report(`cover "${coverValue}" doesn't exist`);
        else {
          cover = assetUrl(coverFile, slug);
          files.push(coverFile);
          const extension = path.extname(coverFile);
          const fileName = `${options.base.slice(1)}images/${path.basename(coverFile, extension)}-${shortHash(coverFile)}${extension}`;
          copies.push({ file: coverFile, fileName });
          coverPath = joinUrl(options.siteBase, fileName);
          if (options.site) coverUrl = joinUrl(options.site, joinUrl(options.siteBase, fileName));
        }
      }

      // The front matter's lines, so reported line numbers match the file.
      const raw = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
      const env: RenderEnv = {
        post: source,
        lineOffset: raw.slice(0, raw.length - source.content.length).split("\n").length - 1,
        error: report,
        assetUrl: (asset) => assetUrl(asset, slug),
        toc: [],
        links: [],
        images: [],
        imageCount: 0,
      };
      let html = "";
      try {
        html = md.render(source.content, env);
      } catch (error) {
        report(`couldn't render: ${(error as Error).message}`);
      }
      files.push(...env.images);

      const words = countWords(source.content);
      const sitePath = postPath(options, slug);
      const post: BlogPost = {
        slug,
        url: joinUrl(options.siteBase, sitePath),
        canonical: options.site
          ? joinUrl(options.site, joinUrl(options.siteBase, sitePath))
          : undefined,
        file,
        title,
        description,
        date: date?.date ?? new Date(0),
        dateHasTime: date?.hasTime ?? false,
        updated: updated?.date,
        tags: postTags,
        authors: postAuthors,
        draft: data.draft === true,
        scheduled: !!date && date.date > now,
        unlisted: data.unlisted === true,
        pinned: data.pinned === true,
        featured: data.featured === true,
        series: toText(data.series) || undefined,
        cover,
        coverUrl,
        coverPath,
        announcement: readAnnouncement(data.announcement, title, options.timeZone, report),
        data,
        html,
        toc: env.toc,
        images: [...new Set(env.images)],
        readingMinutes: Math.max(1, Math.ceil(words / options.wordsPerMinute)),
        words,
      };
      for (const message of options.validate?.(post) ?? []) report(message);
      for (const message of problems) issues.push({ file, message });
      linksByPost.set(post, env.links);
      posts.push(post);
    }

    posts.sort((a, b) => b.date.getTime() - a.date.getTime() || a.slug.localeCompare(b.slug));
    const listed = posts.filter((post) => !post.unlisted);
    const content: BlogContent = {
      posts,
      listed,
      announcements: listed.filter(
        (post) => post.announcement && (!post.announcement.until || post.announcement.until > now),
      ),
      copies,
      links: linksByPost,
      hidden: drafts,
      issues,
      css: highlighter?.css() ?? "",
      tags: tags ?? {},
      files: [...new Set(files)],
    };
    checkLinks(options, content);
    return content;
  };
}

/** Whether `file` is something the blog reads: in its folder, or its page shell. */
export function isBlogFile(options: ResolvedBlogOptions, file: string): boolean {
  const relative = path.relative(options.dir, file);
  return file === options.template || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** The issues as one message, by file, with paths relative to `root`. */
export function formatIssues(issues: BlogIssue[], root: string): string {
  const byFile = new Map<string, string[]>();
  for (const { file, message } of issues) {
    const name = path.relative(root, file) || file;
    byFile.set(name, [...(byFile.get(name) ?? []), message]);
  }
  const lines = [
    `[vite-plugin-blog] ${issues.length} problem${issues.length === 1 ? "" : "s"} in the blog:`,
  ];
  for (const [file, messages] of byFile) {
    lines.push(`  ${file}`);
    for (const message of messages) lines.push(`    - ${message}`);
  }
  return lines.join("\n");
}
