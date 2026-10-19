// PUBLIC route (no token needed): quick check that the server is up.
import { json, preflight } from "@/lib/api";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

export async function GET() {
  return json({ status: "ok" });
}
