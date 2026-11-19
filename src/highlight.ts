import { transformerStyleToClass } from "@shikijs/transformers";
import {
  bundledLanguages,
  bundledLanguagesAlias,
  createHighlighter,
  type BundledLanguage,
  type Highlighter,
} from "shiki";
import { escapeHtml } from "./util.js";

export interface CodeHighlighter {
  /** Loads the grammars these fence languages need. Unknown languages are returned. */
  load(langs: Iterable<string>): Promise<string[]>;
  /** A `<pre>` with classes only, no `style` attributes. */
  highlight(code: string, lang: string): string;
  /** The CSS for every class used so far, plus the light and dark rules. */
  css(): string;
}

const PLAIN = new Set(["", "text", "txt", "plain", "plaintext"]);

function isBundled(lang: string): lang is BundledLanguage {
  return Object.hasOwn(bundledLanguages, lang) || Object.hasOwn(bundledLanguagesAlias, lang);
}

/** A plain block, for no language or highlighting turned off. */
export function plainBlock(code: string, lang: string): string {
  const attr = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
  return `<pre class="shiki"${attr}><code>${escapeHtml(code)}</code></pre>`;
}

/**
 * Shiki with both themes as CSS custom properties, then turned into classes by
 * `transformerStyleToClass`. The page gets no `style` attributes, so it works
 * under `style-src 'self'`, and `light-dark()` picks the theme from the page's
 * `color-scheme`, so a site's own light/dark switch applies without extra rules.
 */
export async function createCodeHighlighter(options: {
  themes: { light: string; dark: string };
  classPrefix: string;
}): Promise<CodeHighlighter> {
  const highlighter: Highlighter = await createHighlighter({
    themes: [options.themes.light, options.themes.dark],
    langs: [],
  });
  const toClass = transformerStyleToClass({ classPrefix: options.classPrefix });
  const loaded = new Set<string>();

  return {
    async load(langs) {
      const unknown: string[] = [];
      for (const raw of langs) {
        const lang = raw.toLowerCase();
        if (PLAIN.has(lang) || loaded.has(lang)) continue;
        if (!isBundled(lang)) {
          unknown.push(raw);
          continue;
        }
        await highlighter.loadLanguage(lang);
        loaded.add(lang);
      }
      return unknown;
    },
    highlight(code, raw) {
      const lang = raw.toLowerCase();
      if (!loaded.has(lang)) return plainBlock(code, raw);
      return highlighter.codeToHtml(code, {
        lang,
        themes: options.themes,
        defaultColor: false,
        transformers: [
          toClass,
          {
            pre(node) {
              node.properties["data-lang"] = raw;
              delete node.properties.tabindex;
            },
          },
        ],
      });
    },
    css() {
      return [
        "/* Code highlighting from @binarynoir/vite-plugin-blog. Generated: do not edit. */",
        ".shiki { color: light-dark(var(--shiki-light), var(--shiki-dark)); background-color: light-dark(var(--shiki-light-bg), var(--shiki-dark-bg)); }",
        ".shiki span { color: light-dark(var(--shiki-light), var(--shiki-dark)); }",
        toClass.getCSS(),
        "",
      ].join("\n");
    },
  };
}
