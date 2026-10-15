"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PackageStatus } from "@/lib/packages";

type Props = { id: string; name: string; status: PackageStatus; subscribers: number };

export function PackageRowActions({ id, name, status, subscribers }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isActive = status === "active";

  async function run(url: string, method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Something went wrong.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const remove = () => {
    if (window.confirm(`Delete ${name}? This hides it from everyone.`)) void run(`/api/admin/packages/${id}`, "DELETE");
  };

  return (
    <div className="flex flex-wrap items-center gap-2 md:justify-end">
      <Link href={`/admin/packages/${id}/edit`} className="btn btn-ghost h-9 border border-line px-3">Edit</Link>
      <button type="button" disabled={busy} onClick={() => run(`/api/admin/packages/${id}/${isActive ? "disable" : "enable"}`, "POST")} className="btn btn-ghost h-9 border border-line px-3">
        {isActive ? "Disable" : "Enable"}
      </button>
      <button type="button" disabled={busy || subscribers > 0} onClick={remove} title={subscribers > 0 ? "Members are using this package. Disable it instead." : undefined} className="btn btn-ghost h-9 border border-line px-3 text-red-600 dark:text-red-400">
        Delete
      </button>
      {error && <p role="alert" className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
