import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Shell } from "@/components/dashboard/shell";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (!data.user) redirect("/login");

  const { count } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)
    .is("deleted_at", null);

  return <Shell unread={count ?? 0}>{children}</Shell>;
}
