"use client";

import { useState } from "react";

export function ReferralShare({ code, link }: { code: string; link: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="mt-4 space-y-3">
      <label className="block text-sm font-medium">Your referral code
        <input readOnly value={code} className="input mt-1 font-mono tracking-wider" />
      </label>
      <label className="block text-sm font-medium">Invite link
        <input readOnly value={link} className="input mt-1 text-sm" />
      </label>
      <button type="button" onClick={copy} className="btn btn-primary h-10 px-4">{copied ? "Copied" : "Copy invite link"}</button>
    </div>
  );
}
