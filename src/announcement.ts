import { createHash } from "node:crypto";
import type { BlogContent, ResolvedBlogOptions } from "./content.js";
import { fillLabel } from "./pages.js";
import type { BlogPost } from "./types.js";
import { escapeHtml, joinUrl } from "./util.js";

export const BANNER_MARKER = "<!--blog:announcement-->";
export const DEFAULT_STORAGE_KEY = "blog-announcements-dismissed";
/** Set on `<html>` when the banner should not show: dismissed, or past its `until`. */
export const DISMISSED_CLASS = "blog-announcement-dismissed";

/** An announcement's id: its post and date, so editing the text keeps it dismissed but a new post doesn't. */
export function announcementId(post: BlogPost): string {
  return `${post.slug}@${post.date.toISOString()}`;
}

/**
 * The script every page with the banner loads in `<head>`, as a file (not
 * inline) so `script-src 'self'` allows it. It runs before the page draws:
 * if the visitor dismissed the newest announcement, or it has ended, it marks
 * `<html>` so the banner is hidden from the first frame. Once the page has
 * loaded, it counts the announcements still to read and wires the close button.
 */
export const BANNER_SCRIPT = `(function () {
  var root = document.documentElement;
  var key = root.getAttribute("data-blog-announcement-key") || "${DEFAULT_STORAGE_KEY}";
  function read() {
    try {
      var value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }
  function ended(until) {
    return Boolean(until) && Date.now() > Date.parse(until);
  }
  var dismissed = read();
  var newest = root.getAttribute("data-blog-announcement");
  if (!newest || dismissed.indexOf(newest) > -1 || ended(root.getAttribute("data-blog-announcement-until"))) {
    root.classList.add("${DISMISSED_CLASS}");
  }
  document.addEventListener("DOMContentLoaded", function () {
    var banner = document.querySelector(".blog-announcement");
    if (!banner) return;
    var items = [];
    try {
      items = JSON.parse(banner.getAttribute("data-items") || "[]");
    } catch (error) {}
    var open = items.filter(function (item) {
      return dismissed.indexOf(item.id) < 0 && !ended(item.until);
    });
    var count = banner.querySelector(".blog-announcement-count");
    if (count) {
      if (open.length > 1) {
        count.textContent = String(open.length);
        count.setAttribute("aria-label", (count.getAttribute("data-label") || "{n}").replace("{n}", String(open.length)));
        count.hidden = false;
      } else count.hidden = true;
    }
    var close = banner.querySelector(".blog-announcement-dismiss");
    if (close) {
      close.addEventListener("click", function () {
        try {
          localStorage.setItem(key, JSON.stringify(items.map(function (item) { return item.id; })));
        } catch (error) {
          // Storage blocked (a private window, say): hidden until the next page load.
        }
        root.classList.add("${DISMISSED_CLASS}");
      });
    }
  });
})();
`;

/** The rule a dismissed banner needs, and the default look, which a site can restyle or turn off. */
export function bannerCss(withStyles: boolean): string {
  const hide = `.${DISMISSED_CLASS} .blog-announcement { display: none; }\n.blog-announcement-count[hidden] { display: none; }\n`;
  if (!withStyles) return hide;
  // :where() keeps these rules at zero specificity, so any site rule wins.
  return `${hide}
:where(.blog-announcement) {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 8px 48px;
  background: var(--blog-announcement-bg, #111827);
  color: var(--blog-announcement-color, #ffffff);
  font-size: 14px;
  line-height: 1.4;
  text-align: center;
}
:where(.blog-announcement-text) {
  color: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}
:where(.blog-announcement-count) {
  min-width: 22px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--blog-announcement-color, #ffffff);
  color: var(--blog-announcement-bg, #111827);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}
:where(.blog-announcement-dismiss) {
  position: absolute;
  top: 50%;
  right: 8px;
  display: inline-flex;
  padding: 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transform: translateY(-50%);
}
:where(.blog-announcement-dismiss:hover) {
  background: color-mix(in srgb, currentColor 16%, transparent);
}
:where(.blog-announcement-dismiss:focus-visible) {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}
`;
}

/** File names that change when the script or styles do, so they can be cached for a year. */
export function bannerFileNames(
  assetsDir: string,
  css: string,
): { script: string; styles: string } {
  const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 8);
  const dir = assetsDir.replace(/^\/+|\/+$/g, "");
  return {
    script: `${dir}/blog-announcement-${hash(BANNER_SCRIPT)}.js`,
    styles: `${dir}/blog-announcement-${hash(css)}.css`,
  };
}

const CLOSE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M18.3 5.7a1 1 0 0 0-1.4 0L12 10.6 7.1 5.7a1 1 0 0 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4L13.4 12l4.9-4.9a1 1 0 0 0 0-1.4z"/></svg>';

/** The banner: the newest announcement linked to its post, a count of the others, and a close button. */
export function renderBanner(options: ResolvedBlogOptions, content: BlogContent): string {
  const [newest] = content.announcements;
  if (!newest?.announcement) return "";
  const labels = options.labels;
  const total = content.announcements.length;
  const items = content.announcements.map((post) => ({
    id: announcementId(post),
    ...(post.announcement?.until ? { until: post.announcement.until.toISOString() } : {}),
  }));
  const countLabel = fillLabel(labels.announcementCount, { n: total });
  const listUrl = joinUrl(options.siteBase, `${options.base}announcements/`);
  const count =
    total > 1
      ? `<a class="blog-announcement-count" href="${escapeHtml(listUrl)}" aria-label="${escapeHtml(countLabel)}" data-label="${escapeHtml(labels.announcementCount)}">${total}</a>`
      : "";
  return [
    `<div class="blog-announcement" role="region" aria-label="${escapeHtml(labels.announcement)}" data-items="${escapeHtml(JSON.stringify(items))}">`,
    `<a class="blog-announcement-text" href="${escapeHtml(newest.url)}">${escapeHtml(newest.announcement.text)}</a>`,
    count,
    `<button class="blog-announcement-dismiss" type="button" aria-label="${escapeHtml(labels.dismiss)}" title="${escapeHtml(labels.dismiss)}">${CLOSE_ICON}</button>`,
    "</div>",
  ]
    .filter(Boolean)
    .join("");
}

/**
 * Adds the banner to one page: the script and stylesheet in `<head>`, the
 * newest announcement's id on `<html>`, and the banner first in `<body>` or
 * at the page's `<!--blog:announcement-->`. A page without either place for
 * it (with `placement: "marker"`, a page without the marker) is left as it is.
 */
export function injectBanner(
  html: string,
  banner: string,
  attributes: Record<string, string>,
  urls: { script: string; styles: string },
  placement: "body" | "marker",
): string {
  let placed: string;
  if (html.includes(BANNER_MARKER)) placed = html.replace(BANNER_MARKER, () => banner);
  else if (placement === "body" && /<body[^>]*>/i.test(html)) {
    placed = html.replace(/<body[^>]*>/i, (tag) => `${tag}\n${banner}`);
  } else return html;

  const attributeText = Object.entries(attributes)
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join("");
  const head = `<link rel="stylesheet" href="${escapeHtml(urls.styles)}">\n<script src="${escapeHtml(urls.script)}"></script>`;
  return (
    placed
      .replace(/<html([^>]*)>/i, (_tag, existing: string) => `<html${existing}${attributeText}>`)
      // Last in <head>: after the charset and any Content Security Policy meta tag,
      // and still before the banner is drawn.
      .replace(/<\/head>/i, (tag) => `${head}\n${tag}`)
  );
}
