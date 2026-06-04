import type { Role, SessionUser, User } from "../shared/contracts.ts";

const validRoles = new Set<Role>([
  "customer",
  "staff",
  "chef",
  "owner",
  "admin",
]);

export function toSessionUser(
  user: Pick<User, "id" | "email" | "name"> & { roles?: unknown },
): SessionUser {
  const roles = Array.isArray(user.roles)
    ? user.roles.filter((role): role is Role => validRoles.has(role as Role))
    : [];

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: roles.length > 0 ? roles : ["customer"],
  };
}
