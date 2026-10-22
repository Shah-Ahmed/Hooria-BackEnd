// /api/users   (ORGANIZATION ADMIN only: works on the admin's own organization)
//   GET  -> list users of my organization
//   POST -> create a user in my organization
//           body: { name, email, password }
//           Refused with 403 when the organization's user limit has been reached.

import { apiHandler, json, preflight } from "@/lib/api";
import { createAccount } from "@/lib/accounts";
import { HttpError } from "@/lib/errors";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { countNormalUsers, withOrgLock } from "@/lib/orgs";
import { readJson, requireEmail, requirePassword, requireString } from "@/lib/validate";
import type { OrganizationDoc, UserDoc } from "@/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ roles: ["admin"] }, async ({ auth }) => {
  if (!auth.orgId) throw new HttpError(403, "Your account is not linked to an organization");

  const snapshot = await getAdminDb()
    .collection("users")
    .where("orgId", "==", auth.orgId)
    .get();

  const users = snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as UserDoc) }))
    .filter((user) => user.isActive !== false) // "deleted" users stay in the database but are not listed
    .sort((a, b) => b.createdAt - a.createdAt);

  return json(users);
});

export const POST = apiHandler({ roles: ["admin"] }, async ({ request, auth }) => {
  const orgId = auth.orgId;
  if (!orgId) throw new HttpError(403, "Your account is not linked to an organization");

  const body = await readJson(request);
  const name = requireString(body, "name", { min: 2 });
  const email = requireEmail(body, "email");
  const password = requirePassword(body, "password");

  // The limit check and the create happen one after the other for this organization,
  // so two requests at the same moment cannot both pass the check.
  return withOrgLock(orgId, async () => {
    const orgSnap = await getAdminDb().collection("organizations").doc(orgId).get();
    const org = orgSnap.data() as OrganizationDoc | undefined;
    if (!org || org.isActive === false) throw new HttpError(404, "Organization not found");

    // Limit check in code. No limit set (older organizations) = no restriction.
    if (typeof org.userLimit === "number") {
      const used = await countNormalUsers(orgId);
      if (used >= org.userLimit) {
        throw new HttpError(
          403,
          `User limit reached (${used} of ${org.userLimit}). No more users can be added. Please contact the super admin to increase the limit.`
        );
      }
    }

    const { uid } = await createAccount({
      name,
      email,
      password,
      role: "user", // an admin can only create normal users, never other admins
      orgId,
    });

    return json({ id: uid, name, email, role: "user", orgId }, 201);
  });
});
