"use client";

import Link from "next/link";
import { useTransition } from "react";

export default function AdvisorError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [pending, startTransition] = useTransition();
  return <section className="py-8 sm:py-12" aria-labelledby="advisor-error-title">
    <h1 id="advisor-error-title" className="text-2xl font-semibold">The advisor couldn&apos;t load</h1>
    <p role="alert" className="mt-3 max-w-xl text-muted">Please try loading it again. Recovering this page may restart your in-memory conversation.</p>
    <div className="mt-5 flex flex-wrap items-center gap-4">
      <button type="button" disabled={pending} onClick={() => startTransition(() => retry())} className="rounded-card bg-primary px-5 py-3 text-white disabled:opacity-50">{pending ? "Loading advisor…" : "Try loading the advisor again"}</button>
      <Link href="/" className="py-3 underline">Back to homepage</Link>
    </div>
  </section>;
}
