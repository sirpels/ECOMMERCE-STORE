import type { Metadata } from "next";
import Link from "next/link";
import SmartSendButton from "./smart-send-button";

export const metadata: Metadata = { title: "Smart Send Button Lab" };

export default function ButtonLabPage() {
  return (
    <section className="page-section mx-auto max-w-2xl" aria-labelledby="lab-title">
      <p className="text-sm font-semibold uppercase tracking-wider text-muted">FE-AA1 · Interaction lab</p>
      <h1 id="lab-title" className="mt-3 text-3xl font-semibold sm:text-4xl">Smart Send Button</h1>
      <p id="simulation-note" className="mt-4 leading-relaxed text-muted">
        A local simulation of sending a message. Nothing is sent or saved, and no AI or network API is called.
      </p>
      <SmartSendButton />
      <Link href="/" className="mt-8 inline-flex min-h-11 items-center underline underline-offset-4">Back to storefront</Link>
    </section>
  );
}
