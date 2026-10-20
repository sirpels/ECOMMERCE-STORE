import type { FabricGuidanceInput } from "../../lib/ai/fabric-guidance";
import type { AdvisorMessage } from "../../lib/ai/messages";

export type FabricGuidancePart = Extract<AdvisorMessage["parts"][number], { type: "tool-findFabricGuidance" }>;

const labels = {
  everyday: "Everyday", work: "Work", wedding: "Wedding", formal_event: "Formal event",
  hot: "Hot", mild: "Mild", cool: "Cool", breathability: "Breathability",
  easy_care: "Easy care", drape: "Drape", structure: "Structure",
};

function Preferences({ input }: { input: FabricGuidanceInput }) {
  return <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
    {(["occasion", "climate", "priority"] as const).map((key) => <div key={key}>
      <dt className="capitalize text-muted">{key}</dt>
      <dd className="mt-1 font-medium">{labels[input[key]]}</dd>
    </div>)}
  </dl>;
}

// Pure presentation, imported by the existing client boundary. No server code.
export default function FabricGuidanceResult({ part, active }: { part: FabricGuidancePart; active: boolean }) {
  const base = "my-3 min-w-0 rounded-card p-3 text-sm [overflow-wrap:anywhere] transition-colors motion-reduce:transition-none";
  if (part.state === "input-streaming" || part.state === "input-available") {
    const preparing = part.state === "input-streaming";
    return <section aria-label="Fabric Match" data-tool-state={part.state} className={`${base} ${!active ? "border border-border bg-surface" : preparing ? "border border-dashed border-primary bg-background" : "border border-primary bg-accent"}`}>
      <h3 className="font-semibold">Fabric Match · {!active ? "Stopped" : preparing ? "Preparing" : "Searching"}</h3>
      {part.state === "input-available" && <Preferences input={part.input} />}
      <p role="status" className={`mt-2 text-xs text-muted ${active ? "motion-safe:animate-pulse" : ""}`}>
        {!active ? "Lookup stopped. Send a new message to try again." : preparing ? "Preparing a fabric lookup from your preferences…" : "Finding general fabric categories in the curated reference…"}
      </p>
    </section>;
  }
  if (part.state === "output-error") {
    return <section role="alert" aria-label="Fabric Match error" data-tool-state={part.state} className={`${base} border border-red-300 bg-red-50 text-red-950`}>
      <h3 className="font-semibold">Fabric Match · Unavailable</h3>
      <p className="mt-2">Fabric guidance couldn&apos;t be loaded. Please try again.</p>
    </section>;
  }
  if (part.state !== "output-available") return null;
  return <section aria-label="Fabric Match results" data-tool-state={part.state} className={`${base} border border-primary bg-surface`}>
    <h3 className="font-semibold text-primary">Fabric Match · General guidance</h3>
    <Preferences input={part.output.input} />
    {part.output.suggestions.length ? <ul className="mt-4 space-y-3">
      {part.output.suggestions.map((suggestion) => <li key={suggestion.name} className="rounded-card border border-border bg-background p-3">
        <h4 className="font-semibold">{suggestion.name}</h4>
        <p className="mt-2 leading-6">{suggestion.rationale}</p>
        <p className="mt-2 text-xs leading-5 text-muted"><span className="font-semibold">Consideration: </span>{suggestion.consideration}</p>
      </li>)}
    </ul> : <p className="mt-4 rounded-card bg-background p-3 leading-6">No matching fabric category is listed in this reference for these preferences. You can ask about a different priority or discuss the requirements with a tailor.</p>}
    <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted">{part.output.disclaimer}</p>
  </section>;
}
