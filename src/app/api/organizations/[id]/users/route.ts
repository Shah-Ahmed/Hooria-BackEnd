// /api/organizations/:id/users   (SUPER ADMIN only)
//   GET -> READ-ONLY list of the people in one organization (its admin + normal users).
//          There is no POST / PATCH / DELETE here on purpose: the super admin can only look.
//          Internal ids are not sent, only what is needed to display the list.

import { apiHandler, json, preflight } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getActiveOrgUsers } from "@/lib/orgs";
import type { OrganizationDoc, UserDoc } from "@/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ roles: ["super_admin"] }, async ({ params }) => {
  const id = params.id;

  const orgSnap = await getAdminDb().collection("organizations").doc(id).get();
  const org = orgSnap.data() as OrganizationDoc | undefined;
  if (!org || org.isActive === false) throw new HttpError(404, "Organization not found");

  const docs = await getActiveOrgUsers(id);
  const users = docs
    .map((doc) => doc.data() as UserDoc)
    .map((user) => ({
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    }))
    // the organization admin first, then normal users from newest to oldest
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
      return b.createdAt - a.createdAt;
    });

  return json(users);
});
