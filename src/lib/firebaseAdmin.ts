// Firebase Admin setup. Runs ONLY on the server (API routes, seed script).
// Uses the secret FIREBASE_* values from .env.local.

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // The private key is stored with literal "\n" in .env, so convert them back.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin env vars missing. Fill FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in .env.local"
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

// Lazy getters: Firebase is only initialised when a request actually needs it.
// If FIREBASE_DATABASE_ID is set (e.g. "insightx") that named Firestore database is used,
// otherwise the "(default)" database.
export const getAdminDb = () => {
  const databaseId = process.env.FIREBASE_DATABASE_ID?.trim();
  return databaseId ? getFirestore(getAdminApp(), databaseId) : getFirestore(getAdminApp());
};
export const getAdminAuth = () => getAuth(getAdminApp());
