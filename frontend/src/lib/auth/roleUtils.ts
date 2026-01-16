export type AnyUser = {
  isHost?: boolean | null;
  roles?: unknown;
  role?: unknown;
};

function normalizeRole(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim().toLowerCase();
}

function collectRoles(user: AnyUser | null | undefined): string[] {
  if (!user) return [];

  const roles: string[] = [];

  // roles[] (preferred)
  if (Array.isArray((user as any).roles)) {
    for (const r of (user as any).roles) {
      const n = normalizeRole(r);
      if (n) roles.push(n);
    }
  }

  // role (defensive: sometimes APIs return a single role string)
  const single = normalizeRole((user as any).role);
  if (single) roles.push(single);

  return roles;
}

/**
 * Backend rule for host access:
 * - user.isHost === true
 * OR
 * - user.roles includes "host" OR "admin"
 *
 * Defensive variants supported:
 * - "ROLE_HOST" / "ROLE_ADMIN"
 * - "HOST" / "ADMIN"
 */
export function isHostUser(user: AnyUser | null | undefined): boolean {
  if (!user) return false;
  if (user.isHost === true) return true;

  const roles = collectRoles(user);

  return roles.includes('host') || roles.includes('role_host') || roles.includes('admin') || roles.includes('role_admin');
}

export function isAdminUser(user: AnyUser | null | undefined): boolean {
  if (!user) return false;
  const roles = collectRoles(user);
  return roles.includes('admin') || roles.includes('role_admin');
}

