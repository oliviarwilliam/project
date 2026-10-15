"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function MarkAllRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    await createClient().from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    setBusy(false);
    router.refresh();
  }

  return (
    <button type="button" onClick={markAll} disabled={busy} className="btn btn-ghost border border-line">
      {busy ? "Saving..." : "Mark all as read"}
    </button>
  );
}
