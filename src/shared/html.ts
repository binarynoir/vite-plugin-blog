// Browser-safe helpers, shared by the build and the client entries. No Node imports here.

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes the characters that are special in HTML text and attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]!);
}

/** A label with its `{n}`, `{count}` or other `{key}` placeholders filled in. */
export function fillLabel(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}
