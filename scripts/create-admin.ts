import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { user as userTable } from "../db/auth-schema.ts";
import type { Role } from "../shared/contracts.ts";

const email = process.argv[2]?.trim();

if (!email) {
  console.error("Usage: bun run admin:create <email>");
  process.exit(1);
}

const [targetUser] = await db
  .select()
  .from(userTable)
  .where(eq(userTable.email, email))
  .limit(1);

if (!targetUser) {
  console.error(`User not found: ${email}`);
  process.exit(1);
}

const roles = normalizeRoles(targetUser.roles);
const nextRoles = Array.from(new Set([...roles, "admin", "customer"]));

await db
  .update(userTable)
  .set({ roles: nextRoles, updatedAt: new Date() })
  .where(eq(userTable.id, targetUser.id));

console.log(`Updated ${email} roles: ${nextRoles.join(", ")}`);

function normalizeRoles(rawRoles: unknown): Role[] {
  const valid = new Set<Role>(["customer", "staff", "chef", "owner", "admin"]);
  const roles = Array.isArray(rawRoles)
    ? rawRoles.filter((role): role is Role => valid.has(role as Role))
    : [];
  return roles.length > 0 ? roles : ["customer"];
}
