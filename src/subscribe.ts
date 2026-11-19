/**
 * The subscribe dialog, in the browser, with no framework. Most hosts serve a
 * feed as `application/xml`, so a link to one shows raw XML instead of offering
 * a feed reader. Instead, a plain click on a link to one of the blog's feeds
 * opens a dialog: pick a format (RSS, Atom or JSON Feed), copy its address,
 * hand it to a feed reader app (`feed:`), view the feed, or learn what a feed
 * is. Without JavaScript, or with a modifier key, the link opens the feed as
 * before. The dialog is built with DOM calls, so a strict Content Security
 * Policy needs no change.
 */
import { DEFAULT_LABELS } from "./shared/labels.js";
import { fillLabel } from "./shared/html.js";
import type { BlogFeedKind, BlogFeedLink, BlogLabels } from "./shared/types.js";

/** Explains feeds to people new to them. */
const ABOUT_FEEDS_URL = "https://aboutfeeds.com/";
const STORAGE_KEY = "blog-feed-format";
const CLASS = "blog-subscribe";

const FEED_TYPES: Record<BlogFeedKind, string> = {
  rss: "application/rss+xml",
  atom: "application/atom+xml",
  json: "application/feed+json",
};
const FEED_NAMES: Record<BlogFeedKind, string> = { rss: "RSS", atom: "Atom", json: "JSON Feed" };

export interface BlogSubscribeOptions {
  /** The feeds, as `[{ kind, url }]` or as `virtual:blog/*`'s `blog.feeds` (`{ rss, atom, json }`). */
  feeds: BlogFeedLink[] | Partial<Record<BlogFeedKind, string>>;
  /** The blog's name, for "Subscribe to {blog}". */
  title: string;
  labels?: Partial<BlogLabels>;
  /** How long "Copied" shows, in milliseconds. Default 1600. */
  copiedFor?: number;
}

/** Feeds as a list in RSS, Atom, JSON Feed order, from either form `BlogSubscribeOptions` takes. */
export function feedLinks(feeds: BlogSubscribeOptions["feeds"]): BlogFeedLink[] {
  const list = Array.isArray(feeds)
    ? feeds
    : (Object.entries(feeds) as [BlogFeedKind, string | undefined][])
        .filter((entry): entry is [BlogFeedKind, string] => Boolean(entry[1]))
        .map(([kind, url]) => ({ kind, url, type: FEED_TYPES[kind], name: FEED_NAMES[kind] }));
  const order: BlogFeedKind[] = ["rss", "atom", "json"];
  return [...list].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

function absolute(url: string, doc: Document): string {
  try {
    return new URL(url, doc.location.href).href;
  } catch {
    return url;
  }
}

/** The feed a link points at, or `null`: same origin and path, any query or hash. */
export function findFeed(anchor: HTMLAnchorElement, feeds: BlogFeedLink[]): BlogFeedLink | null {
  let url: URL;
  try {
    url = new URL(anchor.href, anchor.ownerDocument.location.href);
  } catch {
    return null;
  }
  if (url.origin !== anchor.ownerDocument.location.origin) return null;
  return feeds.find((feed) => new URL(feed.url, url).pathname === url.pathname) ?? null;
}

function readStored(): BlogFeedKind | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "rss" || value === "atom" || value === "json" ? value : null;
  } catch {
    return null;
  }
}

function store(kind: BlogFeedKind): void {
  try {
    localStorage.setItem(STORAGE_KEY, kind);
  } catch {
    // Private windows and blocked storage: the choice just isn't remembered.
  }
}

const SVG = "http://www.w3.org/2000/svg";

function icon(doc: Document, className: string, size: number, draw: (svg: SVGSVGElement) => void) {
  const svg = doc.createElementNS(SVG, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.9");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  draw(svg);
  return svg;
}

function shape(svg: SVGSVGElement, tag: string, attrs: Record<string, string>) {
  const node = svg.ownerDocument.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  svg.append(node);
}

const feedIcon = (doc: Document) =>
  icon(doc, `${CLASS}-icon`, 22, (svg) => {
    shape(svg, "path", { d: "M5 11a8 8 0 0 1 8 8" });
    shape(svg, "path", { d: "M5 5a14 14 0 0 1 14 14" });
    shape(svg, "circle", { cx: "6", cy: "18", r: "1.6", fill: "currentColor", stroke: "none" });
  });

const closeIcon = (doc: Document) =>
  icon(doc, "", 18, (svg) => shape(svg, "path", { d: "M6.5 6.5l11 11M17.5 6.5l-11 11" }));

function make<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text = "",
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

let dialogCount = 0;

/**
 * The dialog, built fresh each time it opens. `initial` is the format shown
 * first: the one clicked, else the reader's last choice, else the first feed.
 */
export function renderSubscribeDialog(
  options: BlogSubscribeOptions,
  initial?: BlogFeedKind,
  doc: Document = document,
): HTMLDialogElement {
  const labels = { ...DEFAULT_LABELS, ...options.labels };
  const feeds = feedLinks(options.feeds);
  const id = `${CLASS}-${++dialogCount}`;
  const chosen =
    feeds.find((feed) => feed.kind === initial) ??
    feeds.find((feed) => feed.kind === readStored()) ??
    feeds[0]!;

  const dialog = make(doc, "dialog", CLASS);
  dialog.setAttribute("aria-labelledby", `${id}-title`);
  dialog.setAttribute("aria-describedby", `${id}-hint`);

  const close = make(doc, "button", `${CLASS}-close`);
  close.type = "button";
  close.setAttribute("aria-label", labels.close);
  close.title = labels.close;
  close.append(closeIcon(doc));
  close.addEventListener("click", () => dialog.close());

  const title = make(doc, "h2", `${CLASS}-title`);
  title.id = `${id}-title`;
  title.append(feedIcon(doc), fillLabel(labels.subscribeTo, { blog: options.title }));

  const hint = make(doc, "p", `${CLASS}-hint`, labels.subscribeHint);
  hint.id = `${id}-hint`;

  // The formats as a segmented radio group: arrow keys move between them, as in any radio group.
  const formats = make(doc, "fieldset", `${CLASS}-formats`);
  const legend = make(doc, "legend", "blog-visually-hidden", labels.feedFormat);
  formats.append(legend);
  const note = make(doc, "p", `${CLASS}-note`);
  note.id = `${id}-note`;
  const notes: Record<BlogFeedKind, string> = {
    rss: labels.feedRss,
    atom: labels.feedAtom,
    json: labels.feedJson,
  };

  const field = make(doc, "div", `${CLASS}-field`);
  const address = make(doc, "input", `${CLASS}-address`);
  address.type = "text";
  address.readOnly = true;
  address.spellcheck = false;
  address.setAttribute("aria-label", labels.feedAddress);
  address.setAttribute("aria-describedby", note.id);
  address.addEventListener("focus", () => address.select());
  const copy = make(doc, "button", `${CLASS}-copy`, labels.copy);
  copy.type = "button";
  const status = make(doc, "span", "blog-visually-hidden");
  status.setAttribute("role", "status");
  field.append(address, copy, status);

  const links = make(doc, "p", `${CLASS}-links`);
  const reader = make(doc, "a", `${CLASS}-reader`, labels.openInReader);
  const view = make(doc, "a", `${CLASS}-view`, labels.viewFeed);
  view.target = "_blank";
  view.rel = "noopener";
  const about = make(doc, "a", `${CLASS}-about`, labels.aboutFeeds);
  about.href = ABOUT_FEEDS_URL;
  about.target = "_blank";
  about.rel = "noopener noreferrer";
  links.append(reader, view, about);

  const show = (feed: BlogFeedLink) => {
    const url = absolute(feed.url, doc);
    address.value = url;
    note.textContent = notes[feed.kind];
    reader.href = `feed:${url}`;
    view.href = feed.url;
    view.type = feed.type;
    dialog.dataset.format = feed.kind;
  };

  for (const feed of feeds) {
    const option = make(doc, "label", `${CLASS}-format`);
    const radio = make(doc, "input", "");
    radio.type = "radio";
    radio.name = `${id}-format`;
    radio.value = feed.kind;
    radio.checked = feed === chosen;
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      show(feed);
      store(feed.kind);
    });
    option.append(radio, make(doc, "span", "", feed.name));
    formats.append(option);
  }

  let reset: ReturnType<typeof setTimeout> | undefined;
  copy.addEventListener("click", () => {
    const done = () => {
      copy.textContent = labels.copied;
      copy.dataset.copied = "";
      status.textContent = labels.copied;
      clearTimeout(reset);
      reset = setTimeout(() => {
        copy.textContent = labels.copy;
        delete copy.dataset.copied;
        status.textContent = "";
      }, options.copiedFor ?? 1600);
    };
    // The clipboard needs a secure context; without it, select the address to copy by hand.
    const clipboard = doc.defaultView?.navigator.clipboard;
    if (!clipboard) {
      address.focus();
      address.select();
      return;
    }
    clipboard.writeText(address.value).then(done, () => {
      address.focus();
      address.select();
    });
  });

  show(chosen);
  dialog.append(close, title, hint, ...(feeds.length > 1 ? [formats] : []), field, note, links);
  // A click on the backdrop lands on the dialog itself: it closes, as a click outside a menu would.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    clearTimeout(reset);
    dialog.remove();
  });
  return dialog;
}

/** Opens the dialog, replacing one already open. `null` when there are no feeds. */
export function openSubscribeDialog(
  options: BlogSubscribeOptions,
  initial?: BlogFeedKind,
  doc: Document = document,
): HTMLDialogElement | null {
  if (!feedLinks(options.feeds).length) return null;
  doc.querySelector<HTMLDialogElement>(`dialog.${CLASS}`)?.close();
  const trigger = doc.activeElement as HTMLElement | null;
  const dialog = renderSubscribeDialog(options, initial, doc);
  // Back to what opened it, as a menu would.
  dialog.addEventListener("close", () => {
    if (trigger?.isConnected && trigger !== doc.body) trigger.focus();
  });
  doc.body.append(dialog);
  dialog.showModal();
  // The format choice first, so a reader can pick one and copy without hunting.
  const first =
    dialog.querySelector<HTMLInputElement>(`.${CLASS}-formats input:checked`) ??
    dialog.querySelector<HTMLButtonElement>(`.${CLASS}-copy`);
  first?.focus();
  return dialog;
}

/**
 * Opens the dialog for a plain click on any link to one of the feeds, anywhere
 * on the page: the header, a list's subscribe link, a home page strip. A click
 * with a modifier key or another button, on a link in the dialog, or one another
 * handler already took, is left to the browser. Returns a function that stops it.
 */
export function enhanceFeedLinks(
  options: BlogSubscribeOptions,
  doc: Document = document,
): () => void {
  const feeds = feedLinks(options.feeds);
  if (!feeds.length) return () => {};
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    if (!anchor || anchor.tagName !== "A" || anchor.hasAttribute("download")) return;
    if (anchor.closest(`.${CLASS}`)) return;
    const feed = findFeed(anchor as HTMLAnchorElement, feeds);
    if (!feed) return;
    event.preventDefault();
    // Feed icons link the first feed; they show the reader's last choice. A link to
    // another feed (an "Atom" link) shows that one.
    openSubscribeDialog(options, feed === feeds[0] ? undefined : feed.kind, doc);
  };
  doc.addEventListener("click", onClick);
  return () => doc.removeEventListener("click", onClick);
}
