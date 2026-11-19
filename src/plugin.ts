import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import {
  announcementId,
  BANNER_SCRIPT,
  bannerCss,
  bannerFileNames,
  DEFAULT_STORAGE_KEY,
  injectBanner,
  renderBanner,
} from "./announcement.js";
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
  renderAtom,
  renderJsonFeed,
  renderRss,
  renderSitemap,
  standaloneHtml,
  type FeedContext,
} from "./feeds.js";
import {
  CONTENT_MARKER,
  createHelpers,
  enabledFeeds,
  FEED_FILES,
  listPages,
  renderListPage,
  renderPostPage,
  SEARCH_FILE,
  searchEnabled,
  siteInfo,
  SITEMAP_FILE,
  sitemapEnabled,
} from "./pages.js";
import { buildSearchIndex } from "./search-index.js";
import type { BlogListPage, BlogOptions, BlogPost } from "./types.js";
import { joinUrl } from "./util.js";

const POSTS_ID = "virtual:blog/posts";
const LATEST_ID = "virtual:blog/latest";
const CSS_ID = "virtual:blog/code.css";
const RESOLVED_POSTS_ID = "\0virtual:blog/posts";
const RESOLVED_LATEST_ID = "\0virtual:blog/latest";
// Not `\0`-prefixed: Vite's CSS plugin only handles ids that look like CSS files.
const RESOLVED_CSS_ID = "/__vite-plugin-blog/code.css";
/** Where dev serves the banner's files. The build writes them to hashed names instead. */
const DEV_BANNER = {
  script: "/__vite-plugin-blog/announcement.js",
  styles: "/__vite-plugin-blog/announcement.css",
};

type InputOption = string | string[] | Record<string, string>;

/** A page the blog writes: a post, or a list of posts. */
type BlogPage = { kind: "post"; post: BlogPost } | { kind: "list"; page: BlogListPage };

const FEED_CONTENT_TYPES = {
  rss: "application/rss+xml; charset=utf-8",
  atom: "application/atom+xml; charset=utf-8",
  json: "application/feed+json; charset=utf-8",
} as const;

function toPosix(file: string): string {
  return file.split(path.sep).join("/");
}

/** Adds the blog's pages to whatever input the config already has. */
function addInputs(input: InputOption | undefined, pages: Record<string, string>): InputOption {
  if (!input) return pages;
  if (typeof input === "string") return { index: input, ...pages };
  if (Array.isArray(input)) return [...input, ...Object.values(pages)];
  return { ...input, ...pages };
}

/** A built page's path on the site: `/blog/x/index.html` and `/blog/x/` are both `/blog/x/`. */
function pagePath(htmlPath: string): string {
  const pathname = htmlPath.split(/[?#]/)[0] ?? "/";
  return pathname.replace(/index\.html$/, "").replace(/\.html$/, "/") || "/";
}

/**
 * A static Markdown blog for a Vite site. Each post and list becomes an HTML
 * page built from the site's own page shell, so the site's scripts, styles and
 * `transformIndexHtml` plugins apply to them like to any other page.
 */
export function blogPlugin(userOptions: BlogOptions): Plugin {
  let config: ResolvedConfig;
  let options: ResolvedBlogOptions;
  let load: () => Promise<BlogContent>;
  let content: BlogContent;
  let bannerStyles = "";
  let bannerFiles = { script: "", styles: "" };
  /** Absolute HTML ids in the build, and their pages. */
  const pageIds = new Map<string, BlogPage>();

  /** Where a page sits in the project: `/blog/vpn-leaks/` is `<root>/blog/vpn-leaks/index.html`. */
  const fileFor = (sitePath: string) => path.join(config.root, sitePath.slice(1), "index.html");
  const pageFile = (slug: string) => fileFor(postPath(options, slug));

  /**
   * A local file's URL in a post. The build resolves it from the page's own
   * location, so Vite hashes and copies it. Dev serves it straight from disk.
   */
  const assetUrl = (file: string, slug: string) =>
    config.command === "serve"
      ? `/@fs/${toPosix(file).replace(/^\/+/, "")}`
      : toPosix(path.relative(path.dirname(pageFile(slug)), file));

  /** Every page, by its path on the site without Vite's base. */
  const allPages = () => {
    const pages = new Map<string, BlogPage>();
    for (const page of listPages(options, content)) {
      pages.set(page.url.slice(options.siteBase.length - 1), { kind: "list", page });
    }
    for (const post of content.posts) {
      pages.set(postPath(options, post.slug), { kind: "post", post });
    }
    return pages;
  };

  const readTemplate = () => {
    const template = readFileSync(options.template, "utf8");
    if (!template.includes(CONTENT_MARKER)) {
      throw new Error(
        `[vite-plugin-blog] ${path.relative(config.root, options.template)} has no ${CONTENT_MARKER} marker`,
      );
    }
    return template;
  };

  const renderPage = (page: BlogPage) => {
    const helpers = createHelpers(options, content);
    return page.kind === "post"
      ? renderPostPage(readTemplate(), page.post, options, helpers)
      : renderListPage(readTemplate(), page.page, options, helpers);
  };

  const bannerEnabled = () => options.announcements !== false && content.announcements.length > 0;

  /** Posts that belong in feeds and the sitemap: listed, and neither drafts nor scheduled. */
  const publicPosts = () => content.listed.filter((post) => !post.draft && !post.scheduled);

  const feedContext = (imageUrl: (file: string) => string | undefined): FeedContext => {
    const site = options.site!;
    const feeds = options.feeds || {};
    const posts = publicPosts();
    const newest = Math.max(0, ...posts.map((post) => (post.updated ?? post.date).getTime()));
    return {
      options: { ...options, site },
      title: feeds.title || options.index?.title || options.labels.blog,
      description: feeds.description ?? options.index?.description ?? "",
      home: joinUrl(site, joinUrl(options.siteBase, options.base)),
      articleHtml: (post) =>
        standaloneHtml(post, site, options.siteBase, imageUrl, (file) => assetUrl(file, post.slug)),
      updated: new Date(newest),
    };
  };

  /** Feeds and the sitemap, by file name under the output folder. */
  const extraFiles = (imageUrl: (file: string) => string | undefined) => {
    const files = new Map<string, { source: string; type: string }>();
    const prefix = options.base.slice(1);
    const kinds = enabledFeeds(options);
    if (kinds.length) {
      const context = feedContext(imageUrl);
      const posts = publicPosts();
      const render = { rss: renderRss, atom: renderAtom, json: renderJsonFeed };
      for (const kind of kinds) {
        files.set(`${prefix}${FEED_FILES[kind]}`, {
          source: render[kind](posts, context, FEED_FILES[kind]),
          type: FEED_CONTENT_TYPES[kind],
        });
      }
    }
    if (searchEnabled(options)) {
      const text = options.search === false ? 0 : (options.search?.text ?? 3000);
      const index = buildSearchIndex(content.listed, createHelpers(options, content), text);
      files.set(`${prefix}${SEARCH_FILE}`, {
        source: JSON.stringify(index),
        type: "application/json; charset=utf-8",
      });
    }
    if (sitemapEnabled(options)) {
      const absolute = (sitePath: string) =>
        joinUrl(options.site!, joinUrl(options.siteBase, sitePath));
      const posts = publicPosts();
      const newest = posts[0] && (posts[0].updated ?? posts[0].date);
      const entries = [
        ...listPages(options, content)
          .filter((page) => page.kind !== "announcements")
          .map((page) => ({
            url: page.canonical!,
            lastModified: page.posts.length ? newest : undefined,
          })),
        ...posts.map((post) => ({
          url: absolute(postPath(options, post.slug)),
          lastModified: post.updated ?? post.date,
        })),
      ];
      files.set(`${prefix}${SITEMAP_FILE}`, {
        source: renderSitemap(entries),
        type: "application/xml; charset=utf-8",
      });
    }
    return files;
  };

  return {
    name: "vite-plugin-blog",
    enforce: "pre",

    async configResolved(resolved) {
      config = resolved;
      options = resolveOptions(userOptions, { root: config.root, base: config.base });
      if (options.feeds && !options.site) {
        config.logger.warn("[vite-plugin-blog] feeds need the site option, so none are written.");
      }
      // Posts and their images may live outside the project (a separate content repo).
      if (config.command === "serve") config.server.fs.allow.push(options.dir);
      load = createLoader(options, assetUrl);
      content = await load();
      bannerStyles = bannerCss(
        options.announcements === false || options.announcements?.styles !== false,
      );
      bannerFiles = bannerFileNames(config.build.assetsDir, bannerStyles);
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
        // Entry names: `blog` for the index, `blog-{slug}` for posts, and `blog-tag__dns`
        // or `blog-page__2` for lists. Slugs can't contain `_`, so no post can take a
        // list's name.
        const rest = sitePath.slice(options.base.length).replace(/\/$/, "");
        pages[rest ? `blog-${rest.replace(/\//g, "__")}` : "blog"] = id;
      }
      return { ...inputOptions, input: addInputs(inputOptions.input, pages) };
    },

    buildStart() {
      if (config.command !== "build") return;
      for (const copy of content.copies) {
        this.emitFile({ type: "asset", fileName: copy.fileName, source: readFileSync(copy.file) });
      }
      if (bannerEnabled()) {
        this.emitFile({ type: "asset", fileName: bannerFiles.script, source: BANNER_SCRIPT });
        this.emitFile({ type: "asset", fileName: bannerFiles.styles, source: bannerStyles });
      }
    },

    resolveId(id) {
      if (id === POSTS_ID) return RESOLVED_POSTS_ID;
      if (id === LATEST_ID) return RESOLVED_LATEST_ID;
      if (id === CSS_ID) return RESOLVED_CSS_ID;
      if (pageIds.has(id)) return id;
      return null;
    },

    load(id) {
      if (id === RESOLVED_POSTS_ID || id === RESOLVED_LATEST_ID) {
        const helpers = createHelpers(options, content);
        const listed =
          id === RESOLVED_LATEST_ID
            ? content.listed.slice(0, Math.max(0, options.latest ?? 6))
            : content.listed;
        return [
          `export const posts = ${JSON.stringify(listed.map(helpers.summary))};`,
          `export const tags = ${JSON.stringify(helpers.tagInfo)};`,
          `export const blog = ${JSON.stringify(siteInfo(options, helpers))};`,
          "export default posts;",
          "",
        ].join("\n");
      }
      if (id === RESOLVED_CSS_ID) return content.css;
      const page = pageIds.get(id);
      if (page) return renderPage(page);
      return null;
    },

    transformIndexHtml: {
      // After Vite has processed the page, so it leaves the banner's plain script tag alone.
      order: "post",
      handler(source, context) {
        let html = source;
        // Feed links on the site's other pages too; blog pages have them already.
        const sitePath = pagePath(context.path);
        if (
          options.feeds &&
          options.feeds.discovery === "site" &&
          !sitePath.startsWith(options.base)
        ) {
          const links = createHelpers(options, content).renderFeedLinks();
          if (links) html = html.replace(/<\/head>/i, () => `  ${links}\n  </head>`);
        }
        if (!bannerEnabled()) return html;
        const settings = options.announcements || {};
        if (settings.include && !settings.include(sitePath)) return html;
        const newest = content.announcements[0]!;
        const attributes: Record<string, string> = {
          "data-blog-announcement": announcementId(newest),
        };
        if (newest.announcement?.until) {
          attributes["data-blog-announcement-until"] = newest.announcement.until.toISOString();
        }
        if (settings.storageKey && settings.storageKey !== DEFAULT_STORAGE_KEY) {
          attributes["data-blog-announcement-key"] = settings.storageKey;
        }
        const urls =
          config.command === "serve"
            ? DEV_BANNER
            : {
                script: joinUrl(options.siteBase, bannerFiles.script),
                styles: joinUrl(options.siteBase, bannerFiles.styles),
              };
        return injectBanner(
          html,
          renderBanner(options, content),
          attributes,
          urls,
          settings.placement ?? "body",
        );
      },
    },

    generateBundle(_outputOptions, bundle) {
      // Where Vite wrote each source image, for absolute image URLs in the feeds.
      const builtImages = new Map<string, string>();
      for (const item of Object.values(bundle)) {
        if (item.type !== "asset") continue;
        const asset = item as typeof item & {
          originalFileNames?: string[];
          originalFileName?: string | null;
        };
        const names =
          asset.originalFileNames ?? (asset.originalFileName ? [asset.originalFileName] : []);
        for (const name of names) builtImages.set(path.resolve(config.root, name), item.fileName);
      }
      for (const [fileName, file] of extraFiles((source) => builtImages.get(source))) {
        this.emitFile({ type: "asset", fileName, source: file.source });
      }
    },

    configureServer(server: ViteDevServer) {
      server.watcher.add([options.dir, options.template]);

      const reload = async (file: string) => {
        if (!isBlogFile(options, file) && !content.files.includes(file)) return;
        content = await load();
        for (const id of [RESOLVED_POSTS_ID, RESOLVED_LATEST_ID, RESOLVED_CSS_ID]) {
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
          const send = (body: string, type: string) => {
            res.setHeader("Content-Type", type);
            res.setHeader("Cache-Control", "no-cache");
            res.end(body);
          };
          if (url.pathname === DEV_BANNER.script) {
            return send(BANNER_SCRIPT, "text/javascript; charset=utf-8");
          }
          if (url.pathname === DEV_BANNER.styles) {
            return send(bannerStyles, "text/css; charset=utf-8");
          }

          const siteBase = options.siteBase.replace(/\/$/, "");
          if (!url.pathname.startsWith(siteBase)) return next();
          const sitePath = url.pathname.slice(siteBase.length).replace(/\/index\.html$/, "/");
          if (!sitePath.startsWith(options.base.replace(/\/$/, ""))) return next();

          // Feeds and the sitemap. Dev has no built image files, so feed images are inlined.
          const extra = extraFiles(() => undefined).get(sitePath.slice(1));
          if (extra) return send(extra.source, extra.type);

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
          send(html, "text/html; charset=utf-8");
        } catch (error) {
          next(error);
        }
      });
    },
  };
}
