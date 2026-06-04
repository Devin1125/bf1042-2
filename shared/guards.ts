import type { Role, SessionUser } from "./contracts.ts";

export function hasRole(user: Pick<SessionUser, "roles"> | null, role: Role) {
  return Boolean(user?.roles.includes(role));
}

export function hasAnyRole(
  user: Pick<SessionUser, "roles"> | null,
  roles: Role[],
) {
  return roles.some((role) => hasRole(user, role));
}

export function hasAllRoles(
  user: Pick<SessionUser, "roles"> | null,
  roles: Role[],
) {
  return roles.every((role) => hasRole(user, role));
}

export function requireRole(user: SessionUser, role: Role): void {
  if (!hasRole(user, role)) {
    throw forbiddenResponse();
  }
}

export function requireAnyRole(user: SessionUser, roles: Role[]): void {
  if (!hasAnyRole(user, roles)) {
    throw forbiddenResponse();
  }
}

export function canAccessResource(
  user: SessionUser,
  resourceOwnerId: string,
  elevatedRoles: Role[] = ["staff", "chef", "owner", "admin"],
) {
  return user.id === resourceOwnerId || hasAnyRole(user, elevatedRoles);
}

function forbiddenResponse() {
  return new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
