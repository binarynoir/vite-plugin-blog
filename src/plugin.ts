import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import {
  createLoader,
  formatIssues,
  isBlogFile,
  postPath,
  resolveOptions,
  type BlogContent,
  type ResolvedBlogOptions,
} from "./content.js";
import {
  CONTENT_MARKER,
  createHelpers,
  listPages,
  postSummaries,
  renderListPage,
  renderPostPage,
} from "./pages.js";
import type { BlogOptions, ListPage, Post } from "./types.js";

const POSTS_ID = "virtual:blog/posts";
const CSS_ID = "virtual:blog/code.css";
// Not `\0`-prefixed: Vite's CSS plugin only handles ids that look like CSS files.
const RESOLVED_POSTS_ID = "\0virtual:blog/posts";
const RESOLVED_CSS_ID = "/__vite-plugin-blog/code.css";

type InputOption = string | string[] | Record<string, string>;

/** A page the blog writes: a post, or the index or a tag page. */
type BlogPage = { kind: "post"; post: Post } | { kind: "list"; page: ListPage };

function toPosix(file: string): string {
  return file.split(path.sep).join("/");
}

/** Adds the post pages to whatever input the config already has. */
function addInputs(input: InputOption | undefined, pages: Record<string, string>): InputOption {
  if (!input) return pages;
  if (typeof input === "string") return { index: input, ...pages };
  if (Array.isArray(input)) return [...input, ...Object.values(pages)];
  return { ...input, ...pages };
}

/**
 * A static Markdown blog for a Vite site. Each post becomes an HTML page,
 * built from the site's own page shell, so the site's scripts, styles and
 * `transformIndexHtml` plugins apply to posts like to any other page.
 */
export function blog(userOptions: BlogOptions): Plugin {
  let config: ResolvedConfig;
  let options: ResolvedBlogOptions;
  let load: () => Promise<BlogContent>;
  let content: BlogContent;
  /** Absolute HTML ids in the build, and their pages. */
  const pageIds = new Map<string, BlogPage>();

  /** Where a page sits in the project: `/blog/vpn-leaks/` is `<root>/blog/vpn-leaks/index.html`. */
  const fileFor = (sitePath: string) => path.join(config.root, sitePath.slice(1), "index.html");
  const pageFile = (slug: string) => fileFor(postPath(options, slug));

  /** Every page, by its path on the site without Vite's base: `/blog/`, `/blog/tag/dns/`, `/blog/vpn-leaks/`. */
  const allPages = () => {
    const pages = new Map<string, BlogPage>();
    for (const page of listPages(options, content)) {
      pages.set(page.url.slice(options.siteBase.length - 1), { kind: "list", page });
    }
    for (const post of content.posts)
      pages.set(postPath(options, post.slug), { kind: "post", post });
    return pages;
  };

  /**
   * A local file's URL in a post. The build resolves it from the page's own
   * location, so Vite hashes and copies it. Dev serves it straight from disk.
   */
  const assetUrl = (file: string, slug: string) =>
    config.command === "serve"
      ? `/@fs/${toPosix(file).replace(/^\/+/, "")}`
      : toPosix(path.relative(path.dirname(pageFile(slug)), file));

  const readTemplate = () => {
    const template = readFileSync(options.template, "utf8");
    if (!template.includes(CONTENT_MARKER))
      throw new Error(
        `[vite-plugin-blog] ${path.relative(config.root, options.template)} has no ${CONTENT_MARKER} marker`,
      );
    return template;
  };

  const renderPage = (page: BlogPage) => {
    const helpers = createHelpers(options, content);
    return page.kind === "post"
      ? renderPostPage(readTemplate(), page.post, options, helpers)
      : renderListPage(readTemplate(), page.page, options, helpers);
  };

  return {
    name: "vite-plugin-blog",
    enforce: "pre",

    async configResolved(resolved) {
      config = resolved;
      options = resolveOptions(userOptions, { root: config.root, base: config.base });
      // Posts and their images may live outside the project (a separate content repo).
      if (config.command === "serve") config.server.fs.allow.push(options.dir);
      load = createLoader(options, assetUrl);
      content = await load();
      if (content.issues.length) {
        const message = formatIssues(content.issues, config.root);
        if (config.command === "build") throw new Error(message);
        config.logger.error(message);
      }
    },

    options(inputOptions) {
      if (config.command !== "build") return;
      pageIds.clear();
      const pages: Record<string, string> = {};
      for (const [sitePath, page] of allPages()) {
        const id = fileFor(sitePath);
        pageIds.set(id, page);
        // Entry names: `blog` for the index, `blog-{slug}` for posts, `blog-tag__{tag}` for
        // tags. Slugs can't contain `_`, so a post can never take a tag page's name.
        const rest = sitePath.slice(options.base.length).replace(/\/$/, "");
        pages[rest ? `blog-${rest.replace(/^tag\//, "tag__")}` : "blog"] = id;
      }
      return { ...inputOptions, input: addInputs(inputOptions.input, pages) };
    },

    resolveId(id) {
      if (id === POSTS_ID) return RESOLVED_POSTS_ID;
      if (id === CSS_ID) return RESOLVED_CSS_ID;
      if (pageIds.has(id)) return id;
      return null;
    },

    load(id) {
      if (id === RESOLVED_POSTS_ID)
        return `export const posts = ${JSON.stringify(postSummaries(content.posts))};\nexport default posts;\n`;
      if (id === RESOLVED_CSS_ID) return content.css;
      const page = pageIds.get(id);
      if (page) return renderPage(page);
      return null;
    },

    configureServer(server: ViteDevServer) {
      server.watcher.add([options.dir, options.template]);

      const reload = async (file: string) => {
        if (!isBlogFile(options, file) && !content.files.includes(file)) return;
        content = await load();
        for (const id of [RESOLVED_POSTS_ID, RESOLVED_CSS_ID]) {
          const module = server.moduleGraph.getModuleById(id);
          if (module) server.moduleGraph.invalidateModule(module);
        }
        if (content.issues.length) {
          const message = formatIssues(content.issues, config.root);
          config.logger.error(message, { timestamp: true });
          server.ws.send({ type: "error", err: { message, stack: "" } });
        } else {
          server.ws.send({ type: "full-reload" });
        }
      };
      server.watcher.on("add", reload);
      server.watcher.on("change", reload);
      server.watcher.on("unlink", reload);

      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url ?? "/", "http://localhost");
          const siteBase = options.siteBase.replace(/\/$/, "");
          if (!url.pathname.startsWith(siteBase)) return next();
          const sitePath = url.pathname.slice(siteBase.length).replace(/\/index\.html$/, "/");
          if (!sitePath.startsWith(options.base.replace(/\/$/, ""))) return next();
          const pages = allPages();
          const page = pages.get(sitePath);
          if (!page) {
            // A page's address without its slash: send it to the real one.
            if (!sitePath.endsWith("/") && pages.has(`${sitePath}/`)) {
              res.statusCode = 301;
              res.setHeader("Location", `${siteBase}${sitePath}/${url.search}`);
              return res.end();
            }
            return next();
          }
          const html = await server.transformIndexHtml(
            `${sitePath}index.html`,
            renderPage(page),
            req.originalUrl,
          );
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          res.end(html);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
