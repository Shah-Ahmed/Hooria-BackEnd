// /api/users/:id   (ORGANIZATION ADMIN only)
//   DELETE -> "delete" a normal user of my own organization (soft delete:
//             the record stays in the database with isActive = false, login is disabled)

import { apiHandler, json, preflight } from "@/lib/api";
import { deactivateAccount } from "@/lib/accounts";
import { HttpError } from "@/lib/errors";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { UserDoc } from "@/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const DELETE = apiHandler({ roles: ["admin"] }, async ({ params, auth }) => {
  const id = params.id;

  const snap = await getAdminDb().collection("users").doc(id).get();
  const user = snap.data() as UserDoc | undefined;

  // Same answer for "missing" and "other organization" so nothing leaks across organizations.
  if (!user || user.orgId !== auth.orgId || user.isActive === false) {
    throw new HttpError(404, "User not found");
  }
  if (user.role !== "user") throw new HttpError(403, "Only normal users can be deleted here");

  await deactivateAccount(id);
  return json({ success: true });
});
