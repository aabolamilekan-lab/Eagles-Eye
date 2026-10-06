/**
 * Role to capability lookup.
 *
 * Authorization is a separate concern from authentication (AGENTS.md section 8).
 * A role is only ever resolved on the server from the session's database row;
 * it is never read from a form field, query parameter, or client state.
 *
 * This is a lookup, not branching, so a finer role set can be added by editing
 * `ROLE_CAPABILITIES` alone. The default is deny: an unknown or missing role
 * grants nothing.
 */
export const CAPABILITIES = [
  "admin.access",
  "stories.manage",
  "chapters.manage",
  "categories.manage",
  "tags.manage",
  "stats.view",
  "settings.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const ADMIN_CAPABILITIES: ReadonlySet<Capability> = new Set(CAPABILITIES);

/**
 * Capabilities per role. Keyed by the Prisma `UserRole` value. A role absent
 * from this map grants nothing.
 */
const ROLE_CAPABILITIES: ReadonlyMap<string, ReadonlySet<Capability>> = new Map([
  ["ADMIN", ADMIN_CAPABILITIES],
]);

/**
 * Does `role` hold `capability`? Default deny for null, undefined, and any role
 * not present in the lookup.
 */
export function hasCapability(
  role: string | null | undefined,
  capability: Capability,
): boolean {
  if (!role) {
    return false;
  }

  const granted = ROLE_CAPABILITIES.get(role);
  return granted ? granted.has(capability) : false;
}

/** Shorthand for the gate every admin surface shares. */
export function canAccessAdmin(role: string | null | undefined): boolean {
  return hasCapability(role, "admin.access");
}
