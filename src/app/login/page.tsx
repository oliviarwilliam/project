import Link from "next/link";
import { AuthCard } from "@/components/ui/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { safeNext } from "@/lib/auth/redirect";

export const metadata = { title: "Log in" };

const NOTICES: Record<string, string> = {
  link_expired: "That link has expired or was already used. Request a new one and try again.",
};

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;

  return (
    <AuthCard
      title="Log in"
      subtitle="Welcome back to TeenVest."
      footer={<>New here? <Link href="/register" className="underline hover:text-ink">Create an account</Link></>}
    >
      <LoginForm next={safeNext(next)} notice={error ? NOTICES[error] : undefined} />
    </AuthCard>
  );
}
