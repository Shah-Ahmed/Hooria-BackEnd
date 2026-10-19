// /api/users   (ORGANIZATION ADMIN only: works on the admin's own organization)
//   GET  -> list users of my organization
//   POST -> create a user in my organization
//           body: { name, email, password }

import { apiHandler, json, preflight } from "@/lib/api";
import { createAccount } from "@/lib/accounts";
import { HttpError } from "@/lib/errors";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { readJson, requireEmail, requirePassword, requireString } from "@/lib/validate";
import type { UserDoc } from "@/types";

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
  if (!auth.orgId) throw new HttpError(403, "Your account is not linked to an organization");

  const body = await readJson(request);
  const name = requireString(body, "name", { min: 2 });
  const email = requireEmail(body, "email");
  const password = requirePassword(body, "password");

  const { uid } = await createAccount({
    name,
    email,
    password,
    role: "user", // an admin can only create normal users, never other admins
    orgId: auth.orgId,
  });

  return json({ id: uid, name, email, role: "user", orgId: auth.orgId }, 201);
});
