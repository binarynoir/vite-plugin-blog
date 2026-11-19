/**
 * `@binarynoir/vite-plugin-blog/runtime`: the browser side, with no framework.
 * Search, sorting and paging functions for `search.json`, and `enhanceBlogPage()`
 * for copy buttons and the table of contents. The Vue components in `/vue` use it;
 * so can a site in any other framework.
 */
import type { BlogClientConfig, BlogSearchIndex } from "./shared/types.js";
import { DEFAULT_LABELS } from "./shared/labels.js";

export { DEFAULT_LABELS } from "./shared/labels.js";
export { escapeHtml, fillLabel } from "./shared/html.js";
export {
  defaultSort,
  filterByDate,
  isExplorerActive,
  normalize,
  normalizeDate,
  pageWindow,
  paginate,
  readExplorerState,
  searchPosts,
  sortPosts,
  tokenize,
  writeExplorerState,
  type BlogExplorerState,
  type BlogSearchResult,
} from "./shared/search.js";
export {
  breadcrumbTree,
  browseTree,
  dateName,
  cardListTree,
  cardTree,
  pagerTree,
  resultCount,
  searchFormTree,
  tagListTree,
  type BlogBrowseOptions,
  type BlogCardOptions,
  type BlogCardPost,
  type BlogCrumb,
  type BlogPagerOptions,
  type BlogSearchFormOptions,
} from "./shared/markup.js";
export { el, toHtml, type BlogElement, type BlogNode } from "./shared/tree.js";
export type * from "./shared/types.js";

export const CONFIG_ELEMENT_ID = "blog-config";

/** The page's blog settings, from `<script type="application/json" id="blog-config">`. */
export function readBlogConfig(doc: Document = document): BlogClientConfig | null {
  const element = doc.getElementById(CONFIG_ELEMENT_ID);
  if (!element?.textContent) return null;
  try {
    const config = JSON.parse(element.textContent) as BlogClientConfig;
    return { ...config, labels: { ...DEFAULT_LABELS, ...config.labels } };
  } catch {
    return null;
  }
}

const indexes = new Map<string, Promise<BlogSearchIndex>>();

/** Fetches `search.json` once per page, however often it's asked for. A failed fetch can be retried. */
export function loadSearchIndex(url: string): Promise<BlogSearchIndex> {
  let index = indexes.get(url);
  if (!index) {
    index = fetch(url, { headers: { Accept: "application/json" } }).then(async (response) => {
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return (await response.json()) as BlogSearchIndex;
    });
    index.catch(() => indexes.delete(url));
    indexes.set(url, index);
  }
  return index;
}

export interface EnhanceOptions {
  /** Add a copy button to each `.code-block`. Default `true`. */
  copyCode?: boolean;
  /** Show and wire the share row's "Copy link" button. Default `true`. */
  copyLink?: boolean;
  /** Mark the table of contents link for the section being read. Default `true`. */
  tocHighlight?: boolean;
  /** How long "Copied" shows, in milliseconds. Default 1600. */
  copiedFor?: number;
}

function copyButton(
  button: HTMLButtonElement,
  text: () => string,
  labels: { idle: string; done: string },
  wait: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  button.addEventListener("click", () => {
    void navigator.clipboard?.writeText(text()).then(() => {
      button.textContent = labels.done;
      button.dataset.copied = "";
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.textContent = labels.idle;
        delete button.dataset.copied;
      }, wait);
    });
  });
}

/**
 * Progressive extras for a post page. The article reads without them.
 * Returns a function that undoes the table of contents observer.
 */
export function enhanceBlogPage(
  options: EnhanceOptions = {},
  doc: Document = document,
): () => void {
  const labels = readBlogConfig(doc)?.labels ?? DEFAULT_LABELS;
  const wait = options.copiedFor ?? 1600;

  if (options.copyCode !== false) {
    for (const block of doc.querySelectorAll<HTMLElement>(".code-block")) {
      const code = block.querySelector("code");
      if (!code || block.querySelector(".code-copy")) continue;
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "code-copy";
      button.textContent = labels.copyCode;
      copyButton(
        button,
        () => code.textContent ?? "",
        { idle: labels.copyCode, done: labels.copied },
        wait,
      );
      block.append(button);
    }
  }

  if (options.copyLink !== false) {
    for (const button of doc.querySelectorAll<HTMLButtonElement>("[data-blog-copy-link]")) {
      const url = button.dataset.blogCopyLink || doc.location.href;
      button.hidden = false;
      copyButton(button, () => url, { idle: labels.copyLink, done: labels.copied }, wait);
    }
  }

  let stop = () => {};
  const links = [...doc.querySelectorAll<HTMLAnchorElement>(".blog-toc a[href^='#']")];
  if (
    options.tocHighlight !== false &&
    links.length &&
    typeof IntersectionObserver !== "undefined"
  ) {
    const byId = new Map<string, HTMLAnchorElement[]>();
    for (const link of links) {
      const id = decodeURIComponent(link.hash.slice(1));
      byId.set(id, [...(byId.get(id) ?? []), link]);
    }
    const headings = [...byId.keys()]
      .map((id) => doc.getElementById(id))
      .filter((heading): heading is HTMLElement => Boolean(heading));
    const visible = new Set<Element>();
    const mark = () => {
      // The first heading on screen, or else the last one scrolled past.
      const current =
        headings.find((heading) => visible.has(heading)) ??
        [...headings].reverse().find((heading) => heading.getBoundingClientRect().top < 0);
      for (const [id, anchors] of byId) {
        for (const anchor of anchors) {
          if (current?.id === id) anchor.setAttribute("aria-current", "location");
          else anchor.removeAttribute("aria-current");
        }
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        mark();
      },
      { rootMargin: "0px 0px -60% 0px" },
    );
    for (const heading of headings) observer.observe(heading);
    stop = () => observer.disconnect();
  }
  return stop;
}
