// /api/organizations   (SUPER ADMIN only)
//   GET  -> list all organizations (with details, user limit and current user count)
//   POST -> create an organization together with its admin account
//           body: { name, type, address, userLimit, adminName, adminEmail, adminPassword,
//                   description?, city?, country?, phone?, website? }

import { apiHandler, json, preflight } from "@/lib/api";
import { createAccount, deleteAccount } from "@/lib/accounts";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { countNormalUsersByOrg, parseOrgDetails, toOrganizationInfo } from "@/lib/orgs";
import { readJson, requireEmail, requirePassword, requireString } from "@/lib/validate";
import type { OrgDetails, OrganizationDoc } from "@/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ roles: ["super_admin"] }, async () => {
  const snapshot = await getAdminDb()
    .collection("organizations")
    .orderBy("createdAt", "desc")
    .get();
  const counts = await countNormalUsersByOrg();

  // "deleted" organizations (isActive = false) stay in the database but are not listed
  const organizations = snapshot.docs
    .filter((doc) => (doc.data() as OrganizationDoc).isActive !== false)
    .map((doc) => toOrganizationInfo(doc.id, doc.data() as OrganizationDoc, counts.get(doc.id) ?? 0));

  return json(organizations);
});

export const POST = apiHandler({ roles: ["super_admin"] }, async ({ request }) => {
  const body = await readJson(request);
  const details = parseOrgDetails(body, false) as OrgDetails;
  const adminName = requireString(body, "adminName", { min: 2 });
  const adminEmail = requireEmail(body, "adminEmail");
  const adminPassword = requirePassword(body, "adminPassword");

  const orgRef = getAdminDb().collection("organizations").doc();

  // 1) create the admin login (Auth user + claims + profile)
  const { uid } = await createAccount({
    name: adminName,
    email: adminEmail,
    password: adminPassword,
    role: "admin",
    orgId: orgRef.id,
  });

  // 2) create the organization; if this fails, remove the admin again
  const organization: OrganizationDoc = {
    ...details,
    adminUid: uid,
    adminName,
    adminEmail,
    createdAt: Date.now(),
    isActive: true,
  };
  try {
    await orgRef.set(organization);
  } catch (error) {
    await deleteAccount(uid).catch(() => undefined);
    throw error;
  }

  return json(toOrganizationInfo(orgRef.id, organization, 0), 201);
});
