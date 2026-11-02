import type { Metadata } from "next";
import Link from "next/link";
import BagStudio from "./bag-studio";

export const metadata: Metadata = { title: "3D Bag Color Studio" };

export default function BagStudioPage() {
  return (
    <section className="page-section mx-auto max-w-5xl" aria-labelledby="bag-studio-title">
      <p className="text-sm font-semibold uppercase tracking-wider text-muted">FE-AA2 · 3D concept</p>
      <h1 id="bag-studio-title" className="mt-3 text-3xl font-semibold sm:text-4xl">
        3D Bag Color Studio
      </h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted">
        Explore three colors on a simple 3D tote concept. This is a design demonstration, not a verified
        store product or an indication of stock, price, or availability.
      </p>
      <BagStudio />
      <Link href="/bags" className="mt-8 inline-flex min-h-11 items-center underline underline-offset-4">
        Back to bags
      </Link>
    </section>
  );
}
