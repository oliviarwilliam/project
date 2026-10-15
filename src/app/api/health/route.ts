import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Used by Render to decide whether the app can take traffic. Reveals nothing about the setup.
let cache: { at: number; ok: boolean } | null = null;

export async function GET() {
  if (!cache || Date.now() - cache.at > 5000) {
    const { error } = await createAdminClient().from("settings").select("key").limit(1);
    cache = { at: Date.now(), ok: !error };
  }
  return NextResponse.json({ status: cache.ok ? "ok" : "unavailable" }, { status: cache.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
