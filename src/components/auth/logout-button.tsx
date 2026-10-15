"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendJson } from "@/lib/api-client";

export function LogoutButton({ className = "btn btn-primary" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await sendJson("/api/auth/logout");
    router.replace("/");
    router.refresh();
  }

  return (
    <button type="button" onClick={logout} disabled={busy} className={className}>
      {busy ? "Logging out" : "Log out"}
    </button>
  );
}
