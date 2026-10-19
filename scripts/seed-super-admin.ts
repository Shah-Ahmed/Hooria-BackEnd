// Creates (or updates) the ONE super admin account.
// Run it once on your own machine:  npm run seed:superadmin
// It reads SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD from .env.local.
// Never share those credentials with other repositories.

import { getAdminAuth, getAdminDb } from "../src/lib/firebaseAdmin";

async function main() {
  const { SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD } = process.env;
  const name = process.env.SUPER_ADMIN_NAME || "Super Admin";

  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
    throw new Error("Missing SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env.local");
  }
  if (SUPER_ADMIN_PASSWORD.length < 8) {
    throw new Error("SUPER_ADMIN_PASSWORD must be at least 8 characters");
  }

  const auth = getAdminAuth(); // also checks the FIREBASE_* values
  const db = getAdminDb();
  const email = SUPER_ADMIN_EMAIL.trim().toLowerCase();

  let uid: string;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    await auth.updateUser(uid, { password: SUPER_ADMIN_PASSWORD, displayName: name });
    console.log(`Super admin already exists (${email}). Password and name updated.`);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    const created = await auth.createUser({
      email,
      password: SUPER_ADMIN_PASSWORD,
      displayName: name,
    });
    uid = created.uid;
    console.log(`Super admin created (${email}).`);
  }

  // role goes into the JWT as a custom claim
  await auth.setCustomUserClaims(uid, { role: "super_admin" });

  await db
    .collection("users")
    .doc(uid)
    .set({ name, email, role: "super_admin", orgId: null, createdAt: Date.now(), isActive: true }, { merge: true });

  console.log("Done. Log in on the frontend with this email and password.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
