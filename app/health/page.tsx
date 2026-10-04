import { headers } from "next/headers";

export const dynamic = "force-dynamic";

type HealthResponse = { status: string; service: string; timestamp: string };

export default async function HealthPage() {
  const requestHeaders = await headers();
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const host = requestHeaders.get("host") ?? "localhost:3000";
  let data: HealthResponse | undefined;
  let error: string | undefined;

  try {
    const response = await fetch(`${protocol}://${host}/api/health`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Endpoint returned ${response.status}`);
    data = await response.json();
  } catch (caughtError) {
    error = caughtError instanceof Error ? caughtError.message : "Health endpoint could not be reached.";
  }

  return <section className="page-section" aria-labelledby="health-title"><p className="mb-3 text-sm font-semibold tracking-[0.16em] text-muted uppercase">System</p><div className="max-w-2xl rounded-card border border-border bg-surface p-6 shadow-sm sm:p-10"><h1 id="health-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">Health check</h1><p className="mt-4 text-base text-muted">This page fetches the local health endpoint on every request.</p>{data ? <dl className="mt-6 space-y-3 text-sm"><div><dt className="font-semibold">Health status</dt><dd className="text-muted">{data.status}</dd></div><div><dt className="font-semibold">Fetched service</dt><dd className="text-muted">{data.service}</dd></div><div><dt className="font-semibold">Endpoint timestamp</dt><dd className="text-muted">{data.timestamp}</dd></div></dl> : <p className="mt-6 rounded-card bg-accent p-4 text-sm">Health check unavailable: {error}</p>}</div></section>;
}
