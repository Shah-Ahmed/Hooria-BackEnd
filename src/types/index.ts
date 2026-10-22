// Types shared across the backend.

export type Role = "super_admin" | "admin" | "user";

// Allowed values for the organization "type" field.
export const ORG_TYPES = [
  "Company",
  "Educational Institute",
  "Healthcare",
  "Government",
  "Non-Profit",
  "Other",
] as const;
export type OrgType = (typeof ORG_TYPES)[number];

// Stored in Firestore: users/{uid}
// The document id IS the Firebase Auth uid. No separate "user_id" field is stored inside the document.
export interface UserDoc {
  name: string;
  email: string;
  role: Role;
  orgId: string | null; // null for super_admin
  createdAt: number; // unix ms
  isActive: boolean; // false = "deleted" (soft delete, the record stays in the database)
  deletedAt?: number; // unix ms, set when isActive becomes false
}

// The editable details of an organization (everything except the admin account).
export interface OrgDetails {
  name: string;
  type: OrgType;
  address: string;
  description: string;
  city: string;
  country: string;
  phone: string;
  website: string;
  userLimit: number; // max number of normal users the organization admin may create
}

// Stored in Firestore: organizations/{orgId}
// Organizations created before the new fields existed do not have them, so they are optional here.
// A missing userLimit means "no limit set yet".
export interface OrganizationDoc extends Partial<Omit<OrgDetails, "name">> {
  name: string;
  adminUid: string;
  adminName: string;
  adminEmail: string;
  createdAt: number; // unix ms
  isActive: boolean; // false = "deleted" (soft delete, the record stays in the database)
  deletedAt?: number; // unix ms, set when isActive becomes false
}

// What the verified JWT gives us on every request.
export interface AuthUser {
  uid: string;
  email: string | null;
  role: Role | null;
  orgId: string | null;
}
