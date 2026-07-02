// Utility: robustly extract a JSON object from an LLM response that may be
// wrapped in markdown fences or surrounded by prose.

export function extractJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  // Strip markdown code fences if present.
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }
  // Find the first '{' and the last '}' — the outermost JSON object.
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return null;
  }
  const slice = cleaned.slice(first, last + 1);
  try {
    return JSON.parse(slice) as T;
  } catch {
    // Try a second pass: remove trailing commas.
    try {
      const noTrailing = slice.replace(/,(\s*[}\]])/g, "$1");
      return JSON.parse(noTrailing) as T;
    } catch {
      return null;
    }
  }
}
