"use client";

import { useState } from "react";
import { FormAlert } from "@/components/ui/field";

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export function AvatarUploader({ initialUrl, name }: { initialUrl: string | null; name: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!TYPES.includes(file.type)) return setError("Use a JPG, PNG or WebP image.");
    if (file.size > MAX_BYTES) return setError("The image must be 2 MB or smaller.");

    setError(null);
    setBusy(true);
    const body = new FormData();
    body.append("file", file);

    try {
      const res = await fetch("/api/profile/avatar", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) return setError(json.message ?? "The upload failed. Try again.");
      setUrl(json.avatarUrl);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Your profile photo" className="h-20 w-20 rounded-full border border-line object-cover" />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand text-2xl font-bold text-brand-fg" aria-hidden="true">
            {initial}
          </span>
        )}
        <label className="btn btn-ghost h-10 cursor-pointer border border-line has-[:focus-visible]:outline has-[:focus-visible]:outline-2">
          {busy ? "Uploading" : url ? "Change photo" : "Upload photo"}
          <input type="file" accept={TYPES.join(",")} onChange={onChange} disabled={busy} className="sr-only" />
        </label>
      </div>
      <p className="text-xs text-muted">JPG, PNG or WebP, up to 2 MB.</p>
      {error && <FormAlert>{error}</FormAlert>}
    </div>
  );
}
