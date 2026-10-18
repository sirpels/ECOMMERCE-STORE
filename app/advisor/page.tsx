import type { Metadata } from "next";
import AdvisorChat from "./advisor-chat";

export const metadata: Metadata = { title: "Fabric & Style Advisor" };

export default function AdvisorPage() {
  return (
    <section className="py-8 sm:py-12" aria-labelledby="advisor-title">
      <p className="mb-3 text-sm font-semibold tracking-[0.16em] text-muted uppercase">Storefront</p>
      <h1 id="advisor-title" className="text-3xl font-semibold tracking-tight sm:text-4xl">Fabric &amp; Style Advisor</h1>
      <p className="mt-3 max-w-2xl text-muted">Ask about fabrics, outfits, occasions, and sewing considerations. AI advice can be mistaken; confirm prices and availability with the store.</p>
      <AdvisorChat />
    </section>
  );
}
