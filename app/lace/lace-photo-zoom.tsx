"use client";

import Image from "next/image";
import { useRef, useState } from "react";

const laceImage = "/images/lace/selected-lace.jpg";
const laceAlt = "Dark blue floral embroidered lace photographed beside tan and dark fabric rolls";

export function LacePhotoZoom() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  function openImage() {
    dialogRef.current?.showModal();
    setIsOpen(true);
  }

  function closeImage() {
    dialogRef.current?.close();
  }

  return (
    <div className="min-w-0">
      <button
        ref={previewRef}
        type="button"
        onClick={openImage}
        aria-label="Enlarge the lace photograph to inspect its embroidery"
        className="group relative flex aspect-[4/5] w-full min-w-0 items-center justify-center overflow-hidden rounded-card border border-border bg-surface focus-visible:outline-3"
      >
        <Image
          src={laceImage}
          alt={laceAlt}
          fill
          sizes="(max-width: 768px) calc(100vw - 2rem), 50vw"
          fetchPriority="high"
          className="object-contain transition-transform duration-300 motion-reduce:transition-none group-hover:scale-[1.01] motion-reduce:group-hover:scale-100"
        />
        <span className="absolute bottom-3 right-3 rounded-card bg-foreground/85 px-3 py-2 text-sm font-semibold text-white">
          Inspect embroidery
        </span>
      </button>
      <p className="mt-3 text-sm leading-6 text-muted">
        Select the photograph to enlarge it. The full image includes adjacent fabric rolls.
      </p>

      <dialog
        ref={dialogRef}
        aria-label="Enlarged lace photograph"
        onClose={() => {
          setIsOpen(false);
          setZoomed(false);
          previewRef.current?.focus();
        }}
        className="m-auto max-h-[90dvh] w-[min(92vw,64rem)] max-w-none rounded-card border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-foreground/75"
      >
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3 sm:p-4">
            <p className="text-sm font-semibold">Lace photograph</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setZoomed((current) => !current)}
                className="min-h-11 rounded-card border border-border px-3 text-sm font-semibold hover:bg-background"
              >
                {zoomed ? "Fit image" : "Zoom in"}
              </button>
              <button
                type="button"
                onClick={closeImage}
                className="min-h-11 rounded-card bg-primary px-3 text-sm font-semibold text-white hover:opacity-90"
              >
                Close
              </button>
            </div>
          </div>
          <div className="min-h-0 overflow-auto bg-background p-2 sm:p-4" tabIndex={0} aria-label="Lace photograph; scroll to inspect when zoomed">
            {isOpen && (
              <Image
                src={laceImage}
                alt={laceAlt}
                width={1800}
                height={2400}
                sizes={zoomed ? "(max-width: 640px) 180vw, 1400px" : "(max-width: 1024px) 92vw, 1024px"}
                className={zoomed
                  ? "h-auto w-[min(1800px,180vw)] max-w-none"
                  : "mx-auto h-auto max-h-[72dvh] w-auto max-w-full object-contain"}
              />
            )}
          </div>
          <p className="px-3 py-2 text-xs leading-5 text-muted sm:px-4">
            Use Zoom in to inspect details, scroll within the image, then Fit image or Close. Escape also closes this view.
          </p>
        </div>
      </dialog>
    </div>
  );
}
