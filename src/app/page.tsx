import Link from "next/link";
import { site } from "@/data/site";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const signedIn = Boolean(data.user);

  return (
    <div>
      <section className="container-page py-12 sm:py-20 lg:py-24">
        <div className="relative isolate overflow-hidden rounded-[2rem] border border-line bg-surface px-5 py-16 text-center sm:px-10 sm:py-24">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgb(31 84 214 / 0.045) 1px, transparent 1px), linear-gradient(to bottom, rgb(31 84 214 / 0.045) 1px, transparent 1px), radial-gradient(ellipse at center, rgb(31 84 214 / 0.07), transparent 68%)",
              backgroundSize: "36px 36px, 36px 36px, 100% 100%",
            }}
          />
          <div className="mx-auto max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">A better start with money</p>
            <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">{site.tagline}.</h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted sm:text-lg">Explore available plans, manage your naira wallet, and follow your progress.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href={signedIn ? "/dashboard" : "/register"} className="btn btn-primary h-12 px-6">
                {signedIn ? "Dashboard" : "Create an account"}
              </Link>
              <Link href="/how-it-works" className="btn btn-ghost h-12 border border-line px-6">See how it works</Link>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
