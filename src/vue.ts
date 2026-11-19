/**
 * `@binarynoir/vite-plugin-blog/vue`: Vue 3 components for the blog. They render
 * the same element trees as the static pages (shared/markup.ts), so a card in
 * live search results is the same markup, with the same classes, as a card the
 * build wrote. Style them once, with `@binarynoir/vite-plugin-blog/styles.css` or
 * your own rules.
 */
import {
  computed,
  createApp,
  defineComponent,
  Fragment,
  h,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  Teleport,
  watch,
  type App,
  type PropType,
  type VNode,
} from "vue";
import {
  cardListTree,
  cardTree,
  pagerTree,
  resultCount,
  searchFormTree,
  type BlogCardPost,
} from "./shared/markup.js";
import { DEFAULT_LABELS } from "./shared/labels.js";
import { fillLabel } from "./shared/html.js";
import {
  defaultSort,
  isExplorerActive,
  paginate,
  readExplorerState,
  searchPosts,
  sortPosts,
  writeExplorerState,
  type BlogExplorerState,
} from "./shared/search.js";
import type { BlogElement, BlogNode } from "./shared/tree.js";
import type {
  BlogClientConfig,
  BlogLabels,
  BlogSearchIndex,
  BlogSort,
  BlogTagInfo,
} from "./shared/types.js";
import { loadSearchIndex, readBlogConfig } from "./runtime.js";

export type * from "./shared/types.js";
export type { BlogCardPost } from "./shared/markup.js";

/** Extra props for an element in a tree, such as event handlers. */
export type BindElement = (element: BlogElement) => Record<string, unknown> | undefined;

/** An element tree (shared/tree.ts) as Vue virtual nodes. */
export function toVNode(node: BlogNode, bind?: BindElement): VNode | string | null {
  if (node === null || node === undefined || node === false) return null;
  if (typeof node === "string") return node;
  const props: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(node.attrs ?? {})) {
    if (value !== undefined && value !== false) props[name] = value === true ? "" : value;
  }
  // `hidden`, `disabled` and `selected` are DOM properties: give them booleans.
  for (const name of ["hidden", "disabled", "selected"]) {
    if (name in props) props[name] = true;
  }
  Object.assign(props, bind?.(node));
  const children = (node.children ?? [])
    .map((child) => toVNode(child, bind))
    .filter((child): child is VNode | string => child !== null);
  return h(node.tag, props, children);
}

const labelsProp = {
  type: Object as PropType<Partial<BlogLabels>>,
  default: () => ({}),
};

const tagsProp = {
  type: Object as PropType<Record<string, BlogTagInfo>>,
  default: () => ({}),
};

/** One post as a card, as on the blog's list pages. */
export const BlogPostCard = defineComponent({
  name: "BlogPostCard",
  props: {
    post: { type: Object as PropType<BlogCardPost>, required: true },
    tags: tagsProp,
    labels: labelsProp,
    headingLevel: { type: Number as PropType<2 | 3 | 4>, default: 3 },
    /** The small label above the title; `false` for none. */
    label: { type: [String, Boolean] as PropType<string | false>, default: undefined },
    featured: { type: Boolean, default: false },
    cover: { type: Boolean, default: true },
  },
  setup(props) {
    return () =>
      toVNode(
        cardTree(props.post, {
          labels: { ...DEFAULT_LABELS, ...props.labels },
          tags: props.tags,
          headingLevel: props.headingLevel,
          label: props.label,
          featured: props.featured,
          cover: props.cover,
        }),
      );
  },
});

/** Posts as a list of cards, such as a "Latest posts" strip on the home page. */
export const BlogPostList = defineComponent({
  name: "BlogPostList",
  props: {
    posts: { type: Array as PropType<BlogCardPost[]>, required: true },
    tags: tagsProp,
    labels: labelsProp,
    headingLevel: { type: Number as PropType<2 | 3 | 4>, default: 3 },
    /** Most posts shown. Default: all. */
    limit: { type: Number, default: 0 },
    cover: { type: Boolean, default: true },
  },
  setup(props) {
    return () =>
      toVNode(
        cardListTree(props.limit > 0 ? props.posts.slice(0, props.limit) : props.posts, {
          labels: { ...DEFAULT_LABELS, ...props.labels },
          tags: props.tags,
          headingLevel: props.headingLevel,
          cover: props.cover,
        }),
      );
  },
});

/** Numbered page links. Emits `navigate` with the page number; the links still work without it. */
export const BlogPager = defineComponent({
  name: "BlogPager",
  props: {
    page: { type: Number, required: true },
    pageCount: { type: Number, required: true },
    href: { type: Function as PropType<(page: number) => string>, required: true },
    labels: labelsProp,
  },
  emits: { navigate: (page: number) => page > 0 },
  setup(props, { emit }) {
    return () =>
      toVNode(
        pagerTree({
          page: props.page,
          pageCount: props.pageCount,
          href: props.href,
          labels: { ...DEFAULT_LABELS, ...props.labels },
        }),
        (element) =>
          element.attrs?.["data-page"] === undefined
            ? undefined
            : {
                onClick: (event: MouseEvent) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  emit("navigate", Number(element.attrs!["data-page"]));
                },
              },
      );
  },
});

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Search, sorting and paging for a list page. It mounts over the static search
 * form the build writes (`[data-blog-explorer]`), and shows results in
 * `[data-blog-results]`, hiding the page's own list (`[data-blog-static]`)
 * while a search or another order is in use. The state lives in the address
 * (`?q=dns&sort=oldest&page=2`), so results can be shared and Back works.
 * `search.json` loads on the first focus of the field, or at once when the
 * address already holds a search.
 */
export const BlogExplorer = defineComponent({
  name: "BlogExplorer",
  props: {
    config: { type: Object as PropType<BlogClientConfig>, required: true },
    /** The page's own list, hidden while results show. */
    staticSelector: { type: String, default: "[data-blog-static]" },
    /** Where results go. Without it, they follow the form. */
    resultsSelector: { type: String, default: "[data-blog-results]" },
    /** Press `/` anywhere to focus the field. Default `true`. */
    shortcut: { type: Boolean, default: true },
  },
  setup(props) {
    const labels = computed(() => ({ ...DEFAULT_LABELS, ...props.config.labels }));
    const state = reactive<BlogExplorerState>(
      typeof location === "undefined"
        ? { q: "", sort: "newest", page: 1 }
        : readExplorerState(location.search),
    );
    const index = ref<BlogSearchIndex | null>(null);
    const status = ref<"idle" | "loading" | "ready" | "error">("idle");
    const input = ref<HTMLInputElement | null>(null);
    const target = ref<Element | null>(null);

    const load = () => {
      if (!props.config.searchUrl || status.value === "loading" || status.value === "ready") return;
      status.value = "loading";
      loadSearchIndex(props.config.searchUrl).then(
        (loaded) => {
          index.value = loaded;
          status.value = "ready";
        },
        () => {
          status.value = "error";
        },
      );
    };

    const active = computed(() => isExplorerActive(state));
    const scope = computed(() => {
      const posts = index.value?.posts ?? [];
      return props.config.tag
        ? posts.filter((post) => post.tags.includes(props.config.tag!))
        : posts;
    });
    const results = computed(() => {
      const matched = state.q.trim()
        ? searchPosts(scope.value, state.q, index.value?.tags).map((result) => result.post)
        : scope.value;
      return sortPosts(matched, state.sort);
    });
    const paged = computed(() => paginate(results.value, state.page, props.config.pageSize));

    const addressFor = (next: BlogExplorerState) =>
      `${location.pathname}${writeExplorerState(next)}${location.hash}`;
    /** Writes the state to the address: a new history entry for pages and order, not for each key typed. */
    const commit = (push: boolean) => {
      const url = addressFor(state);
      if (url === `${location.pathname}${location.search}${location.hash}`) return;
      history[push ? "pushState" : "replaceState"](history.state, "", url);
    };
    const setQuery = (q: string) => {
      const before = state.q.trim();
      state.q = q;
      state.page = 1;
      if (!q.trim() && state.sort === "relevance") state.sort = "newest";
      else if (q.trim() && !before && state.sort === defaultSort("")) state.sort = "relevance";
      load();
      commit(false);
    };
    const goTo = (page: number) => {
      state.page = page;
      commit(true);
      const top = target.value ?? input.value;
      top?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    };

    const onPopState = () => Object.assign(state, readExplorerState(location.search));
    const onKey = (event: KeyboardEvent) => {
      if (!props.shortcut || event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const typing = (event.target as HTMLElement | null)?.closest?.(
        "input, textarea, select, [contenteditable='true']",
      );
      if (typing) return;
      event.preventDefault();
      input.value?.focus();
    };

    // Hide the page's own list while results show; bring it back if search fails.
    watch(
      [active, status],
      () => {
        if (typeof document === "undefined") return;
        const list = document.querySelector<HTMLElement>(props.staticSelector);
        if (list) list.hidden = active.value && status.value !== "error";
      },
      { flush: "post" },
    );

    onMounted(() => {
      target.value = document.querySelector(props.resultsSelector);
      window.addEventListener("popstate", onPopState);
      document.addEventListener("keydown", onKey);
      if (active.value) load();
      const list = document.querySelector<HTMLElement>(props.staticSelector);
      if (list) list.hidden = active.value && status.value !== "error";
    });
    onBeforeUnmount(() => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("keydown", onKey);
    });

    const form = () =>
      toVNode(
        searchFormTree({
          labels: labels.value,
          indexUrl: props.config.indexUrl,
          query: state.q,
          sort: state.sort,
          tagName: props.config.tagName,
          interactive: true,
        }),
        (element) => {
          switch (element.attrs?.["data-blog-control"]) {
            case "form":
              return {
                onSubmit: (event: Event) => {
                  event.preventDefault();
                  commit(true);
                },
              };
            case "query":
              return {
                ref: input,
                value: state.q,
                onInput: (event: Event) => setQuery((event.target as HTMLInputElement).value),
                onFocus: load,
                onKeydown: (event: KeyboardEvent) => {
                  if (event.key === "Escape" && state.q) {
                    event.preventDefault();
                    setQuery("");
                  }
                },
              };
            case "clear":
              return {
                onClick: () => {
                  setQuery("");
                  input.value?.focus();
                },
              };
            case "sort":
              return {
                value: state.sort,
                onChange: (event: Event) => {
                  state.sort = (event.target as HTMLSelectElement).value as BlogSort;
                  state.page = 1;
                  load();
                  commit(true);
                },
              };
            default:
              return undefined;
          }
        },
      );

    const resultsBody = (): (VNode | string | null)[] => {
      if (!active.value) return [];
      const l = labels.value;
      if (status.value === "error") return [h("p", { class: "blog-results-note" }, l.searchFailed)];
      if (status.value !== "ready")
        return [h("p", { class: "blog-results-note" }, l.searchLoading)];
      if (!results.value.length) {
        return [
          h("div", { class: "blog-results-empty" }, [
            h(
              "p",
              { class: "blog-results-empty-title" },
              fillLabel(l.noResults, { q: state.q.trim() }),
            ),
            h("p", null, l.noResultsHint),
          ]),
        ];
      }
      return [
        toVNode(
          cardListTree(paged.value.items, {
            labels: l,
            tags: index.value?.tags ?? {},
            headingLevel: 2,
          }),
        ),
        h(BlogPager, {
          page: paged.value.page,
          pageCount: paged.value.pageCount,
          labels: l,
          href: (page: number) => addressFor({ ...state, page }),
          onNavigate: goTo,
        }),
      ];
    };

    const results$ = () => {
      const l = labels.value;
      const ready = active.value && status.value === "ready";
      const count = ready ? resultCount(l, results.value.length, state.q) : "";
      const searchAll =
        ready && props.config.tag && state.q.trim()
          ? h(
              "a",
              {
                class: "blog-results-all",
                href: `${props.config.indexUrl}${writeExplorerState({ q: state.q, sort: "relevance", page: 1 })}`,
              },
              l.searchAll,
            )
          : null;
      return h("div", { class: "blog-results", hidden: !active.value }, [
        h("div", { class: "blog-results-bar" }, [
          h("p", { class: "blog-results-count", role: "status", "aria-live": "polite" }, count),
          searchAll,
        ]),
        ...resultsBody(),
      ]);
    };

    return () =>
      h(Fragment, [
        form(),
        target.value ? h(Teleport, { to: target.value }, [results$()]) : results$(),
      ]);
  },
});

export interface MountBlogExplorerOptions {
  /** The mount point. Default `[data-blog-explorer]`. */
  selector?: string;
  /** Settings; default: the page's `#blog-config` JSON. */
  config?: BlogClientConfig;
  /** Called with the app before it mounts, to add plugins. */
  setup?: (app: App) => void;
}

/** Mounts `BlogExplorer` on a list page the build wrote. `null` on other pages. */
export function mountBlogExplorer(options: MountBlogExplorerOptions = {}): App | null {
  const element = document.querySelector(options.selector ?? "[data-blog-explorer]");
  const config = options.config ?? readBlogConfig();
  if (!element || !config?.searchUrl) return null;
  const app = createApp(BlogExplorer, { config });
  options.setup?.(app);
  app.mount(element);
  return app;
}
