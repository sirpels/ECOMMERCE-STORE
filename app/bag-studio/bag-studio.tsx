"use client";

import dynamic from "next/dynamic";
import { Component, useState, type ReactNode } from "react";
import type { CameraAction } from "./bag-viewer";

const BagViewer = dynamic(() => import("./bag-viewer"), {
  ssr: false,
  loading: () => <p className="p-6 text-center text-muted" role="status">Loading the 3D viewer…</p>,
});

const colors = [
  { name: "Clay", hex: "#a75f4a" },
  { name: "Olive", hex: "#617459" },
  { name: "Midnight", hex: "#374455" },
] as const;

type ViewerBoundaryProps = { children: ReactNode; onError: () => void };

class ViewerBoundary extends Component<ViewerBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function StaticBagPreview({ color, name }: { color: string; name: string }) {
  return (
    <svg
      viewBox="0 0 480 360"
      className="h-full w-full max-w-xl"
      role="img"
      aria-label={`${name} tote bag concept illustration`}
    >
      <ellipse cx="240" cy="332" rx="135" ry="12" fill="#d8d0c7" />
      <path d="M166 129V101c0-45 31-69 74-69s74 24 74 69v28" fill="none" stroke="#59463b" strokeWidth="15" strokeLinecap="round" />
      <path d="M134 114h212l-20 208H154z" fill={color} stroke="#443a34" strokeWidth="5" strokeLinejoin="round" />
      <path d="M135 124h210" fill="none" stroke="#443a34" strokeWidth="6" />
      <path d="M178 171h124" fill="none" stroke="#ffffff" strokeOpacity=".28" strokeWidth="4" />
    </svg>
  );
}

function fallbackReason() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return "Your reduced-motion preference is on, so the static color preview is shown instead.";
  }

  const device = navigator as Navigator & {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
  };

  if (device.connection?.saveData || (device.deviceMemory && device.deviceMemory <= 2) ||
      (device.hardwareConcurrency && device.hardwareConcurrency <= 2)) {
    return "This device appears to be in a low-power or data-saving mode, so the static preview is shown instead.";
  }

  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!context) return "3D graphics are unavailable in this browser, so the static preview is shown instead.";
    context.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    return "3D graphics are unavailable in this browser, so the static preview is shown instead.";
  }

  return null;
}

export default function BagStudio() {
  const [colorIndex, setColorIndex] = useState(0);
  const [viewerRequested, setViewerRequested] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const [cameraAction, setCameraAction] = useState<CameraAction | null>(null);
  const color = colors[colorIndex];
  const isInteractive = viewerRequested && !fallback;

  function loadViewer() {
    const reason = fallbackReason();
    if (reason) {
      setFallback(reason);
      return;
    }
    setViewerRequested(true);
  }

  function moveCamera(kind: CameraAction["kind"]) {
    setCameraAction((previous) => ({ kind, key: (previous?.key ?? 0) + 1 }));
  }

  function handleViewerKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!isInteractive || event.target !== event.currentTarget) return;
    const keys: Record<string, CameraAction["kind"]> = {
      ArrowLeft: "left", ArrowRight: "right", ArrowUp: "zoom-in", ArrowDown: "zoom-out",
      "+": "zoom-in", "-": "zoom-out",
    };
    const kind = keys[event.key];
    if (kind) {
      event.preventDefault();
      moveCamera(kind);
    }
  }

  return (
    <div className="mt-8 rounded-card border border-border bg-surface p-4 sm:p-6">
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <div
            className="flex aspect-[4/3] w-full min-w-0 items-center justify-center overflow-hidden rounded-card border border-border bg-background"
            role="group"
            aria-label={`${color.name} bag concept preview`}
            tabIndex={isInteractive ? 0 : undefined}
            onKeyDown={handleViewerKeyDown}
          >
            {isInteractive ? (
              <ViewerBoundary onError={() => setFallback("The 3D viewer could not load. The static preview remains available.")}>
                <BagViewer color={color.hex} cameraAction={cameraAction} onContextLost={() => setFallback("The 3D connection was lost. The static preview remains available.")} />
              </ViewerBoundary>
            ) : <StaticBagPreview color={color.hex} name={color.name} />}
          </div>
          <p className="mt-3 text-sm text-muted" aria-live="polite">
            {fallback ?? (isInteractive
              ? "Drag to rotate; scroll or pinch to zoom. Focus the preview and use arrow keys, or use the buttons."
              : "Static concept preview. The 3D viewer loads only if you choose to open it.")}
          </p>
        </div>

        <div className="min-w-0">
          <fieldset>
            <legend className="text-base font-semibold">Concept color</legend>
            <div className="mt-3 grid gap-2">
              {colors.map((option, index) => (
                <button
                  key={option.name}
                  type="button"
                  aria-pressed={colorIndex === index}
                  onClick={() => setColorIndex(index)}
                  className={`flex min-h-11 items-center gap-3 rounded-card border px-3 py-2 text-left text-sm font-medium hover:bg-background ${colorIndex === index ? "border-primary bg-accent" : "border-border"}`}
                >
                  <span className="h-6 w-6 shrink-0 rounded-full border border-border" style={{ backgroundColor: option.hex }} aria-hidden="true" />
                  {option.name}
                </button>
              ))}
            </div>
          </fieldset>

          {!viewerRequested && !fallback && (
            <button type="button" onClick={loadViewer} className="mt-5 min-h-11 w-full rounded-card bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              Load 3D viewer
            </button>
          )}

          {isInteractive && (
            <div className="mt-5" aria-label="3D camera controls">
              <p className="text-sm font-semibold">View controls</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => moveCamera("left")} className="min-h-11 rounded-card border border-border px-2 text-sm hover:bg-background">Rotate left</button>
                <button type="button" onClick={() => moveCamera("right")} className="min-h-11 rounded-card border border-border px-2 text-sm hover:bg-background">Rotate right</button>
                <button type="button" onClick={() => moveCamera("zoom-in")} className="min-h-11 rounded-card border border-border px-2 text-sm hover:bg-background">Zoom in</button>
                <button type="button" onClick={() => moveCamera("zoom-out")} className="min-h-11 rounded-card border border-border px-2 text-sm hover:bg-background">Zoom out</button>
                <button type="button" onClick={() => moveCamera("reset")} className="col-span-2 min-h-11 rounded-card border border-border px-2 text-sm hover:bg-background">Reset view</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
