// Organization helpers: reading its users, the user limit, and validating its details.
//
// The user limit is enforced HERE, in the backend code (POST /api/users).
// It is not a Firebase Auth rule and not a Firestore rule.

import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin";
import {
  optionalString,
  requireLimit,
  requireOneOf,
  requireString,
  type Body,
} from "./validate";
import { ORG_TYPES } from "@/types";
import type { OrgDetails, OrganizationDoc, UserDoc } from "@/types";

// ---------- users of an organization ----------

// All ACTIVE users of an organization (the admin account + normal users).
export async function getActiveOrgUsers(orgId: string): Promise<QueryDocumentSnapshot[]> {
  const snapshot = await getAdminDb().collection("users").where("orgId", "==", orgId).get();
  return snapshot.docs.filter((doc) => (doc.data() as UserDoc).isActive !== false);
}

// Only normal users (role "user") count against the limit. The organization admin does not.
export async function countNormalUsers(orgId: string): Promise<number> {
  const docs = await getActiveOrgUsers(orgId);
  return docs.filter((doc) => (doc.data() as UserDoc).role === "user").length;
}

// Normal-user count for every organization at once (one query instead of one per organization).
export async function countNormalUsersByOrg(): Promise<Map<string, number>> {
  const snapshot = await getAdminDb().collection("users").where("role", "==", "user").get();
  const counts = new Map<string, number>();
  for (const doc of snapshot.docs) {
    const user = doc.data() as UserDoc;
    if (user.isActive === false || !user.orgId) continue;
    counts.set(user.orgId, (counts.get(user.orgId) ?? 0) + 1);
  }
  return counts;
}

// ---------- response shape ----------

export interface OrganizationInfo {
  id: string;
  name: string;
  type: string;
  description: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  website: string;
  userLimit: number | null; // null = no limit set
  userCount: number;
  limitReached: boolean;
  adminUid: string;
  adminName: string;
  adminEmail: string;
  createdAt: number;
}

// Old organizations that were created before the new fields existed get safe defaults,
// so nothing has to be migrated in the database.
export function toOrganizationInfo(id: string, org: OrganizationDoc, userCount: number): OrganizationInfo {
  const userLimit = typeof org.userLimit === "number" ? org.userLimit : null;
  return {
    id,
    name: org.name,
    type: org.type ?? "",
    description: org.description ?? "",
    address: org.address ?? "",
    city: org.city ?? "",
    country: org.country ?? "",
    phone: org.phone ?? "",
    website: org.website ?? "",
    userLimit,
    userCount,
    limitReached: userLimit !== null && userCount >= userLimit,
    adminUid: org.adminUid,
    adminName: org.adminName,
    adminEmail: org.adminEmail,
    createdAt: org.createdAt,
  };
}

// ---------- validating organization details ----------

const OPTIONAL_TEXT_FIELDS = [
  ["description", 500],
  ["city", 100],
  ["country", 100],
  ["phone", 30],
  ["website", 200],
] as const;

// partial = false -> create: required fields must be there.
// partial = true  -> update: only the fields that were sent are checked and returned.
export function parseOrgDetails(body: Body, partial: boolean): Partial<OrgDetails> {
  const out: Partial<OrgDetails> = {};
  const sent = (field: string) => body[field] !== undefined;

  if (!partial || sent("name")) out.name = requireString(body, "name", { min: 2 });
  if (!partial || sent("type")) out.type = requireOneOf(body, "type", ORG_TYPES);
  if (!partial || sent("address")) out.address = requireString(body, "address", { min: 3, max: 200 });
  if (!partial || sent("userLimit")) out.userLimit = requireLimit(body, "userLimit");

  for (const [field, max] of OPTIONAL_TEXT_FIELDS) {
    if (sent(field)) out[field] = optionalString(body, field, max);
    else if (!partial) out[field] = "";
  }
  return out;
}

// ---------- one create at a time per organization ----------

// Two admins clicking "Create user" at the same moment must not both slip under the limit.
// Requests for the same organization wait for each other (works inside one server process).
const locks = new Map<string, Promise<void>>();

export async function withOrgLock<T>(orgId: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(orgId) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((resolve) => (release = resolve));
  const chain = previous.then(() => mine);
  locks.set(orgId, chain);

  await previous;
  try {
    return await task();
  } finally {
    release();
    if (locks.get(orgId) === chain) locks.delete(orgId);
  }
}
