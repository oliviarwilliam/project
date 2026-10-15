import Link from "next/link";
import { site } from "@/data/site";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-bold tracking-tight" aria-label={`${site.name} home`}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-brand" />
        <path d="M8 21l6-6 4 4 6-8" fill="none" stroke="rgb(var(--brand-fg))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="24" cy="11" r="2.4" className="fill-coin" />
      </svg>
      <span>{site.name}</span>
    </Link>
  );
}
