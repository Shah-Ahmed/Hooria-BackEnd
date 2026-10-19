// GET /api/me  (any logged-in user)
// Returns who the token belongs to: role, organization and profile name.
import { apiHandler, json, preflight } from "@/lib/api";
import { getAdminDb } from "@/lib/firebaseAdmin";
import type { OrganizationDoc, UserDoc } from "@/types";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export const GET = apiHandler(
  { roles: ["super_admin", "admin", "user"] },
  async ({ auth }) => {
    const db = getAdminDb();

    const userSnap = await db.collection("users").doc(auth.uid).get();
    const profile = userSnap.data() as UserDoc | undefined;

    let organization: { id: string; name: string } | null = null;
    if (auth.orgId) {
      const orgSnap = await db.collection("organizations").doc(auth.orgId).get();
      const org = orgSnap.data() as OrganizationDoc | undefined;
      if (org) organization = { id: orgSnap.id, name: org.name };
    }

    return json({
      uid: auth.uid,
      email: auth.email,
      role: auth.role,
      name: profile?.name ?? null,
      orgId: auth.orgId,
      organization,
    });
  }
);
