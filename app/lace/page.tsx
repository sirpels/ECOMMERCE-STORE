import { LacePhotoZoom } from "./lace-photo-zoom";

export default function LacePage() {
  return (
    <section className="page-section mx-auto max-w-5xl" aria-labelledby="lace-title">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">Storefront</p>
      <h1 id="lace-title" className="mt-3 text-3xl font-semibold sm:text-4xl">Lace collection</h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-muted">
        Explore one genuine photograph from the fabric collection. Enlarge it to inspect the embroidery without changing the photographed fabric.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <LacePhotoZoom />
        <div className="min-w-0 rounded-card border border-border bg-surface p-4 sm:p-5">
          <h2 className="text-base font-semibold">Photographed lace</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            The dark blue floral embroidered lace is shown alongside two other fabric rolls. The photograph can be enlarged for a closer view.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            This is a real photographed fabric sample, not an AI-generated textile or a verified product listing. Availability, price and fabric details have not been confirmed for online sale.
          </p>
        </div>
      </div>
    </section>
  );
}
