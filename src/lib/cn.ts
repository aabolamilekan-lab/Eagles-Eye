/**
 * Conditional className composition.
 *
 * A two-line replacement for a utility library. AGENTS.md section 2 forbids
 * dependencies that do not earn their place, and this is the only place class
 * composition is needed.
 *
 * Accepts strings, falsy values, and conditional maps. Arrays are flattened.
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | { [key: string]: boolean | null | undefined };

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];

  for (const value of values) {
    if (!value && value !== 0) continue;

    if (typeof value === "string" || typeof value === "number") {
      out.push(String(value));
      continue;
    }

    if (Array.isArray(value)) {
      const nested = cn(...value);
      if (nested) out.push(nested);
      continue;
    }

    for (const [key, enabled] of Object.entries(value)) {
      if (enabled) out.push(key);
    }
  }

  return out.join(" ");
}