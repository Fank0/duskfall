/**
 * Sanitize LLM-generated text before rendering or storing it.
 *
 * Defense-in-depth: even though we don't render DM messages as raw HTML, we
 * strip obvious attack patterns in case a future component changes that
 * assumption. Three categories are scrubbed:
 *
 *   1. <script> tags (any case, with or without attributes)
 *   2. javascript: URLs (in src/href attributes or standalone)
 *   3. SQL DML patterns (INSERT/UPDATE/DELETE/DROP/TRUNCATE statements)
 *
 * Also strips other dangerous tags (<iframe>, <object>, <embed>, <svg>,
 * <math>, <link>, <meta>, <base>) for good measure.
 *
 * NOTE: this is NOT a full HTML sanitizer. For a real one you'd want DOMPurify.
 * Here we just strip the dangerous patterns the LLM is most likely to emit.
 */

/** Patterns that, if matched, get replaced with an empty string. */
const DANGEROUS_PATTERNS: RegExp[] = [
  // <script>…</script> (any case, multiline, with optional attributes).
  /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,
  // Other dangerous tags — self-closing or paired.
  /<\s*(iframe|object|embed|svg|math|link|meta|base|applet|form|input|textarea|button|style)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi,
  /<\s*(iframe|object|embed|svg|math|link|meta|base|applet|input|textarea|button|style|form)\b[^>]*\/?>/gi,
  // javascript: URLs (in src/href attributes — case-insensitive).
  /\b(href|src|xlink:href|formaction|action|data)\s*=\s*["']?\s*javascript:[^"'>]*/gi,
  // Standalone javascript: protocol prefix.
  /\bjavascript:\s*[^\s"'>]+/gi,
  // on* event-handler attributes (onclick=, onload=, onerror=, …).
  /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
  // SQL DML patterns — only flag clearly malicious statements (keyword + table-ish identifier).
  // Match the keyword followed by optional whitespace + FROM/INTO/TABLE/etc.
  /\b(?:DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET)\b[^;]*;?/gi,
];

/**
 * Strip dangerous patterns from text. Returns the cleaned text. Whitespace
 * collapsing is left to the caller (or CSS).
 */
export function sanitizeLLMOutput(text: string): string {
  if (typeof text !== "string" || text.length === 0) return text;
  let out = text;
  for (const re of DANGEROUS_PATTERNS) {
    out = out.replace(re, "");
  }
  // Collapse any leftover empty <script> tags that the first pattern missed
  // (e.g. <script/> self-closing without a body).
  out = out.replace(/<\s*script\b[^>]*\/?>/gi, "");
  return out;
}

/**
 * Sanitize + truncate. Useful for capping DM lines that are about to be
 * rendered in a constrained UI element.
 */
export function sanitizeAndTruncate(text: string, max: number): string {
  const clean = sanitizeLLMOutput(text);
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1) + "…";
}
