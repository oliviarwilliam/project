import Link from "next/link";

export default function NotFound() {
  return (
    <section className="container-page py-24 text-center">
      <p className="text-sm font-semibold text-brand">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">We could not find that page</h1>
      <p className="mx-auto mt-3 max-w-md text-muted">The link may be old or mistyped.</p>
      <Link href="/" className="btn btn-primary mt-6">Go home</Link>
    </section>
  );
}
