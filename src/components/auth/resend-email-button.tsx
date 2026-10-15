"use client";

import { useEffect, useState } from "react";
import { sendJson } from "@/lib/api-client";

export function ResendEmailButton({ email }: { email: string }) {
  const [wait, setWait] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function resend() {
    const result = await sendJson("/api/auth/resend-email", { email });
    setStatus(result.ok ? "Verification email sent." : result.message);
    if (result.ok) setWait(60);
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={resend} disabled={wait > 0} className="btn btn-ghost h-10 border border-line">
        {wait > 0 ? `Resend in ${wait}s` : "Resend verification email"}
      </button>
      {status && <p role="status" className="text-sm text-muted">{status}</p>}
    </div>
  );
}
