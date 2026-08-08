/**
 * Resolve W3C-design-tokens-style `{path.to.token}` references in a parsed
 * design.md token tree.
 *
 * A value may be a whole reference (`"{colors.brand.primary}"`) or embed one
 * (`"1px solid {colors.border}"`). Resolution is recursive with cycle and
 * unknown-reference detection, both of which throw — broken brand tokens must
 * fail loudly, never silently produce a wrong color.
 */
type TokenTree = Record<string, unknown>;

function flattenInto(value: unknown, prefix: string, out: Map<string, unknown>): void {
  if (value === null || typeof value !== "object") {
    out.set(prefix, value);
    return;
  }
  if (Array.isArray(value)) {
    out.set(prefix, value);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    flattenInto(child, prefix ? `${prefix}.${key}` : key, out);
  }
}

export function resolveTokenRefs<T extends TokenTree>(tokens: T): T {
  const flat = new Map<string, unknown>();
  flattenInto(tokens, "", flat);

  const cache = new Map<string, unknown>();
  const inProgress = new Set<string>();

  function resolvePath(path: string): unknown {
    if (cache.has(path)) return cache.get(path);
    if (!flat.has(path)) throw new Error(`Unknown token reference: {${path}}`);
    if (inProgress.has(path)) throw new Error(`Cyclic token reference at {${path}}`);
    inProgress.add(path);
    const resolved = resolveValue(flat.get(path));
    inProgress.delete(path);
    cache.set(path, resolved);
    return resolved;
  }

  function resolveValue(value: unknown): unknown {
    if (typeof value !== "string") return value;
    const whole = /^\{([^}]+)\}$/.exec(value.trim());
    if (whole) return resolvePath(whole[1].trim());
    return value.replace(/\{([^}]+)\}/g, (_, path: string) => String(resolvePath(path.trim())));
  }

  function mapStrings(value: unknown): unknown {
    if (typeof value === "string") return resolveValue(value);
    if (Array.isArray(value)) return value.map(mapStrings);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v)]));
    }
    return value;
  }

  return mapStrings(tokens) as T;
}
