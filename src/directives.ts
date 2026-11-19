import type { MarkdownIt, StateBlock } from "markdown-it";
import type { BlogDirective } from "./types.js";
import { escapeHtml } from "./util.js";
import { asEnv, type RenderEnv } from "./markdown.js";

const OPENING = /^:::[ \t]*([a-z][\w-]*)(?:[ \t]+(.*?))?[ \t]*$/i;
const CLOSING = /^:::[ \t]*$/;

function callout(kind: string, label: string): BlogDirective {
  return {
    kind: "container",
    render: ({ args, body }) =>
      `<aside class="callout callout-${kind}">\n<p class="callout-title">${escapeHtml(args || label)}</p>\n${body}</aside>\n`,
  };
}

/** `::: note`, `::: tip` and `::: warning`, with an optional title after the name. */
export const BUILT_IN_DIRECTIVES: Record<string, BlogDirective> = {
  note: callout("note", "Note"),
  tip: callout("tip", "Tip"),
  warning: callout("warning", "Warning"),
};

function lineText(state: StateBlock, line: number): string {
  return state.src.slice(state.bMarks[line]! + state.tShift[line]!, state.eMarks[line]);
}

/**
 * Adds `:::name args` blocks. Leaf directives take one line. Containers run to a
 * line holding only `:::`, can nest, and their body is parsed as Markdown.
 * An unknown name is reported, not printed as text.
 */
export function directivesPlugin(md: MarkdownIt, directives: Record<string, BlogDirective>): void {
  md.block.ruler.before(
    "fence",
    "blog_directive",
    (state, startLine, endLine, silent) => {
      if (state.sCount[startLine]! - state.blkIndent >= 4) return false;
      const match = OPENING.exec(lineText(state, startLine));
      if (!match) return false;
      const name = match[1]!.toLowerCase();
      const args = match[2] ?? "";
      const directive = Object.hasOwn(directives, name) ? directives[name] : undefined;
      if (silent) return true;

      if (!directive || directive.kind === "leaf") {
        const token = state.push("blog_directive", "", 0);
        token.info = name;
        token.meta = { args };
        token.map = [startLine, startLine + 1];
        state.line = startLine + 1;
        return true;
      }

      // Find the matching closing line, counting nested containers.
      let depth = 1;
      let line = startLine + 1;
      for (; line < endLine; line++) {
        if (state.sCount[line]! < state.blkIndent) break;
        const text = lineText(state, line);
        if (CLOSING.test(text)) {
          if (--depth === 0) break;
        } else {
          const inner = OPENING.exec(text);
          const innerName = inner?.[1]?.toLowerCase();
          if (innerName && directives[innerName]?.kind === "container") depth++;
        }
      }
      const closed = depth === 0;

      const open = state.push("blog_directive_open", "", 1);
      open.info = name;
      open.meta = { args, closed };
      open.map = [startLine, line];
      open.block = true;

      const oldParent = state.parentType;
      const oldLineMax = state.lineMax;
      state.parentType = "blog_directive";
      state.lineMax = line;
      state.md.block.tokenize(state, startLine + 1, line);
      state.parentType = oldParent;
      state.lineMax = oldLineMax;

      const close = state.push("blog_directive_close", "", -1);
      close.info = name;
      close.block = true;
      state.line = closed ? line + 1 : line;
      return true;
    },
    { alt: ["paragraph", "reference", "blockquote", "list"] },
  );

  const report = (env: RenderEnv, line: number | undefined, message: string) =>
    env.error(line === undefined ? message : `line ${line + 1}: ${message}`);

  md.renderer.rules.blog_directive = (tokens, index, _options, rawEnv) => {
    const env = asEnv(rawEnv);
    const token = tokens[index]!;
    const directive = Object.hasOwn(directives, token.info) ? directives[token.info] : undefined;
    const line = token.map?.[0] === undefined ? undefined : token.map[0] + env.lineOffset;
    if (!directive) {
      report(env, line, `unknown directive "::: ${token.info}"`);
      return "";
    }
    return directive.render({
      args: (token.meta?.args as string) ?? "",
      body: "",
      post: env.post,
      md,
      error: (message) => report(env, line, `::: ${token.info}: ${message}`),
    });
  };

  // A container renders its children itself, so its body can be wrapped.
  md.renderer.rules.blog_directive_open = (tokens, index, options, rawEnv) => {
    const env = asEnv(rawEnv);
    const open = tokens[index]!;
    const line = open.map?.[0] === undefined ? undefined : open.map[0] + env.lineOffset;
    if (!open.meta?.closed) report(env, line, `"::: ${open.info}" has no closing ":::"`);
    let depth = 0;
    let end = index + 1;
    for (; end < tokens.length; end++) {
      const type = tokens[end]!.type;
      if (type === "blog_directive_open") depth++;
      else if (type === "blog_directive_close" && depth-- === 0) break;
    }
    const body = md.renderer.render(tokens.slice(index + 1, end), options, env);
    // Hide the children, already rendered, from the outer pass.
    for (let i = index + 1; i <= end && i < tokens.length; i++) {
      tokens[i]!.hidden = true;
      tokens[i]!.type = "blog_directive_rendered";
      tokens[i]!.children = null;
      tokens[i]!.content = "";
    }
    const directive = directives[open.info]!;
    return directive.render({
      args: (open.meta?.args as string) ?? "",
      body,
      post: env.post,
      md,
      error: (message) => report(env, line, `::: ${open.info}: ${message}`),
    });
  };
  md.renderer.rules.blog_directive_rendered = () => "";
}
