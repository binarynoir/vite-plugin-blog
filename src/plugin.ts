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
import { CONTENT_MARKER, createHelpers, postSummaries, renderPostPage } from "./pages.js";
import type { BlogOptions, Post } from "./types.js";

const POSTS_ID = "virtual:blog/posts";
const CSS_ID = "virtual:blog/code.css";
// Not `\0`-prefixed: Vite's CSS plugin only handles ids that look like CSS files.
const RESOLVED_POSTS_ID = "\0virtual:blog/posts";
const RESOLVED_CSS_ID = "/__vite-plugin-blog/code.css";

type InputOption = string | string[] | Record<string, string>;

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
  /** Absolute HTML ids in the build, by post. */
  const pageIds = new Map<string, Post>();

  /** Where a post's page sits in the project: `<root>/blog/vpn-leaks/index.html`. */
  const pageFile = (slug: string) =>
    path.join(config.root, postPath(options, slug).slice(1), "index.html");

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

  const renderPage = (post: Post) =>
    renderPostPage(readTemplate(), post, options, createHelpers(options, content));

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
      for (const post of content.posts) {
        const id = pageFile(post.slug);
        pageIds.set(id, post);
        pages[`blog-${post.slug}`] = id;
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
      const post = pageIds.get(id);
      if (post) return renderPage(post);
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
          const prefix = `${options.siteBase.replace(/\/$/, "")}${options.base}`;
          if (!url.pathname.startsWith(prefix)) return next();
          const match = /^([a-z0-9-]+)(\/|\/index\.html)?$/.exec(url.pathname.slice(prefix.length));
          const post = match && content.posts.find((candidate) => candidate.slug === match[1]);
          if (!post) return next();
          if (!match[2]) {
            res.statusCode = 301;
            res.setHeader("Location", `${post.url}${url.search}`);
            return res.end();
          }
          const html = await server.transformIndexHtml(
            `${postPath(options, post.slug)}index.html`,
            renderPage(post),
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
