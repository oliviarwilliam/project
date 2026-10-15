"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="container-page py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mx-auto mt-3 max-w-md text-muted">We hit a problem loading this page. Your money and data are safe. Please try again.</p>
      <button type="button" onClick={reset} className="btn btn-primary mt-6">Try again</button>
    </section>
  );
}
