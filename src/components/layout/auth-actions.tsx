import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";

type Props = { signedIn: boolean; variant: "bar" | "menu" };

export function AuthActions({ signedIn, variant }: Props) {
  const inMenu = variant === "menu";
  const wrap = inMenu ? "flex gap-2" : "hidden items-center gap-1 sm:flex";
  const first = inMenu ? "btn btn-ghost flex-1 border border-line" : "btn btn-ghost";
  const second = inMenu ? "btn btn-primary flex-1" : "btn btn-primary";

  if (signedIn) {
    return (
      <div className={wrap}>
        <Link href="/profile" className={first}>Profile</Link>
        <LogoutButton className={second} />
      </div>
    );
  }

  return (
    <div className={wrap}>
      <Link href="/login" className={first}>Log in</Link>
      <Link href="/register" className={second}>Get started</Link>
    </div>
  );
}
