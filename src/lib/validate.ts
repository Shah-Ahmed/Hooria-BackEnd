// Small input-validation helpers. They throw HttpError(400) with a clear message.

import { HttpError } from "./errors";

export type Body = Record<string, unknown>;

export async function readJson(request: Request): Promise<Body> {
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new Error("not an object");
    }
    return body as Body;
  } catch {
    throw new HttpError(400, "Request body must be a valid JSON object");
  }
}

export function requireString(
  body: Body,
  field: string,
  { min = 1, max = 100 }: { min?: number; max?: number } = {}
): string {
  const raw = body[field];
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) throw new HttpError(400, `${field} is required`);
  if (value.length < min) throw new HttpError(400, `${field} must be at least ${min} characters`);
  if (value.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return value;
}

// Optional text field: a missing or empty value gives "" instead of an error.
export function optionalString(body: Body, field: string, max = 200): string {
  const raw = body[field];
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") throw new HttpError(400, `${field} must be text`);
  const value = raw.trim();
  if (value.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return value;
}

export function requireOneOf<T extends string>(body: Body, field: string, allowed: readonly T[]): T {
  const value = requireString(body, field);
  if (!allowed.includes(value as T)) {
    throw new HttpError(400, `${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

// Whole number between 1 and 100000 (a number or a numeric string like "25").
export function requireLimit(body: Body, field: string): number {
  const raw = body[field];
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100000) {
    throw new HttpError(400, `${field} must be a whole number between 1 and 100000`);
  }
  return value;
}

export function requireEmail(body: Body, field: string): string {
  const value = requireString(body, field, { max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new HttpError(400, `${field} is not a valid email address`);
  }
  return value;
}

export function requirePassword(body: Body, field: string): string {
  const value = typeof body[field] === "string" ? (body[field] as string) : "";
  if (!value) throw new HttpError(400, `${field} is required`);
  if (value.length < 8) throw new HttpError(400, `${field} must be at least 8 characters`);
  if (value.length > 128) throw new HttpError(400, `${field} must be at most 128 characters`);
  return value;
}
