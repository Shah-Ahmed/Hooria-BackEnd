// /api/organizations/:id   (SUPER ADMIN only)
//   PATCH  -> change the organization details and/or its user limit
//             body: any of { name, type, address, description, city, country, phone, website, userLimit }
//   DELETE -> "delete" the organization AND all its users (admin + normal users).
//             This is a SOFT delete: nothing is removed from the database.
//             The organization and its users get isActive = false and their logins are disabled.

import { apiHandler, json, preflight } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { countNormalUsers, parseOrgDetails, toOrganizationInfo } from "@/lib/orgs";
import { readJson } from "@/lib/validate";
import type { OrganizationDoc, UserDoc } from "@/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const PATCH = apiHandler({ roles: ["super_admin"] }, async ({ request, params }) => {
  const id = params.id;
  const body = await readJson(request);
  const changes = parseOrgDetails(body, true);
  if (Object.keys(changes).length === 0) throw new HttpError(400, "Nothing to update");

  const orgRef = getAdminDb().collection("organizations").doc(id);
  const orgSnap = await orgRef.get();
  const org = orgSnap.data() as OrganizationDoc | undefined;
  if (!org || org.isActive === false) throw new HttpError(404, "Organization not found");

  // Lowering the limit below the current number of users is allowed:
  // existing users stay, but nobody new can be added until the count is under the limit.
  await orgRef.update(changes);

  const updated: OrganizationDoc = { ...org, ...changes };
  return json(toOrganizationInfo(id, updated, await countNormalUsers(id)));
});

export const DELETE = apiHandler({ roles: ["super_admin"] }, async ({ params }) => {
  const id = params.id;
  const db = getAdminDb();
  const adminAuth = getAdminAuth();

  const orgRef = db.collection("organizations").doc(id);
  const orgSnap = await orgRef.get();
  const org = orgSnap.data() as OrganizationDoc | undefined;
  if (!org || org.isActive === false) throw new HttpError(404, "Organization not found");

  const usersSnap = await db.collection("users").where("orgId", "==", id).get();
  const activeUsers = usersSnap.docs.filter((doc) => (doc.data() as UserDoc).isActive !== false);
  const now = Date.now();

  // 1) disable the logins so nobody from this organization can sign in (old tokens are revoked too)
  for (let i = 0; i < activeUsers.length; i += 20) {
    await Promise.all(
      activeUsers.slice(i, i + 20).map(async (doc) => {
        await adminAuth.updateUser(doc.id, { disabled: true });
        await adminAuth.revokeRefreshTokens(doc.id);
      })
    );
  }

  // 2) switch the flag off in Firestore (batches are limited to 500 writes). Records stay.
  const refs = [...activeUsers.map((doc) => doc.ref), orgRef];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach((ref) => batch.update(ref, { isActive: false, deletedAt: now }));
    await batch.commit();
  }

  return json({ success: true, deactivatedUsers: activeUsers.length });
});
