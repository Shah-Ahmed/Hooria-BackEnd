// /api/organizations   (SUPER ADMIN only)
//   GET  -> list all organizations
//   POST -> create an organization together with its admin account
//           body: { name, adminName, adminEmail, adminPassword }

import { apiHandler, json, preflight } from "@/lib/api";
import { createAccount, deleteAccount } from "@/lib/accounts";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { readJson, requireEmail, requirePassword, requireString } from "@/lib/validate";
import type { OrganizationDoc } from "@/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler({ roles: ["super_admin"] }, async () => {
  const snapshot = await getAdminDb()
    .collection("organizations")
    .orderBy("createdAt", "desc")
    .get();

  // "deleted" organizations (isActive = false) stay in the database but are not listed
  const organizations = snapshot.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as OrganizationDoc) }))
    .filter((org) => org.isActive !== false);

  return json(organizations);
});

export const POST = apiHandler({ roles: ["super_admin"] }, async ({ request }) => {
  const body = await readJson(request);
  const name = requireString(body, "name", { min: 2 });
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
    name,
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

  return json({ id: orgRef.id, ...organization }, 201);
});
