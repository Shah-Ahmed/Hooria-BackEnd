// Helpers to create / delete a login account (Firebase Auth user + Firestore profile).
// Used by the organizations and users routes.

import { getAdminAuth, getAdminDb } from "./firebaseAdmin";
import type { Role, UserDoc } from "@/types";

interface CreateAccountInput {
  name: string;
  email: string;
  password: string;
  role: Exclude<Role, "super_admin">;
  orgId: string;
}

// Creates the Firebase Auth user, stores role + orgId as custom claims (these end up
// inside the user's JWT), and saves the profile in Firestore.
// If anything fails half-way, the Auth user is removed again so nothing is left behind.
export async function createAccount(input: CreateAccountInput): Promise<{ uid: string }> {
  const adminAuth = getAdminAuth();
  const db = getAdminDb();

  const record = await adminAuth.createUser({
    email: input.email,
    password: input.password,
    displayName: input.name,
  });

  try {
    await adminAuth.setCustomUserClaims(record.uid, { role: input.role, orgId: input.orgId });
    const profile: UserDoc = {
      name: input.name,
      email: input.email,
      role: input.role,
      orgId: input.orgId,
      createdAt: Date.now(),
      isActive: true,
    };
    await db.collection("users").doc(record.uid).set(profile);
  } catch (error) {
    await adminAuth.deleteUser(record.uid).catch(() => undefined);
    throw error;
  }

  return { uid: record.uid };
}

// "Delete" for the app = soft delete. The Firestore record stays (isActive = false),
// the login is disabled so the person cannot sign in, and old tokens stop working.
export async function deactivateAccount(uid: string): Promise<void> {
  const adminAuth = getAdminAuth();
  try {
    await adminAuth.updateUser(uid, { disabled: true });
    await adminAuth.revokeRefreshTokens(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
  }
  await getAdminDb().collection("users").doc(uid).update({ isActive: false, deletedAt: Date.now() });
}

// PERMANENT delete of the Firebase Auth user and the Firestore profile.
// Only used to undo a half-finished create (rollback). Normal deletes use deactivateAccount().
export async function deleteAccount(uid: string): Promise<void> {
  try {
    await getAdminAuth().deleteUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
  }
  await getAdminDb().collection("users").doc(uid).delete();
}
