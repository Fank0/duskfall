/**
 * Shallow comparison helpers for React.memo custom comparators.
 *
 * `shallowEqual` performs a strict-equality check on every top-level key of two
 * objects (no nested recursion). Arrays are compared element-by-element.
 *
 * `makeShallowComparator` adapts `shallowEqual` to the (prevProps, nextProps)
 * signature expected by `React.memo`.
 */

/** Returns true if two values are shallowly equal. */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null) return false;
  if (typeof b !== "object" || b === null) return false;

  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    const va = (a as Record<string, unknown>)[key];
    const vb = (b as Record<string, unknown>)[key];
    if (Object.is(va, vb)) continue;
    // Arrays: element-wise shallow compare (cheap and covers our list props).
    if (Array.isArray(va) && Array.isArray(vb)) {
      if (va.length !== vb.length) return false;
      for (let i = 0; i < va.length; i++) {
        if (!Object.is(va[i], vb[i])) return false;
      }
      continue;
    }
    return false;
  }
  return true;
}

/** Build a React.memo comparator backed by shallowEqual. */
export function makeShallowComparator<T>(): (prev: T, next: T) => boolean {
  return (prev: T, next: T) => shallowEqual(prev, next);
}
