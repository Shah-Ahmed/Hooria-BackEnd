// GET /api/my-organization   (ORGANIZATION ADMIN only)
// Details of my own organization plus the user limit and how many users are used.
// The admin page uses this to show "3 / 10 users" and the "limit reached" notice.

import { apiHandler, json, preflight } from "@/lib/api";
import { HttpError } from "@/lib/errors";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { countNormalUsers, toOrganizationInfo } from "@/lib/orgs";
import type { OrganizationDoc } from "@/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ roles: ["admin"] }, async ({ auth }) => {
  if (!auth.orgId) throw new HttpError(403, "Your account is not linked to an organization");

  const orgSnap = await getAdminDb().collection("organizations").doc(auth.orgId).get();
  const org = orgSnap.data() as OrganizationDoc | undefined;
  if (!org || org.isActive === false) throw new HttpError(404, "Organization not found");

  return json(toOrganizationInfo(orgSnap.id, org, await countNormalUsers(auth.orgId)));
});
