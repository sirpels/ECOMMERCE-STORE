import type { InferUITools, UIMessage } from "ai";
import type { AdvisorToolSet } from "./tools";

// Type-only imports are erased. No tool execution code enters the client bundle.
export type AdvisorMessage = UIMessage<never, never, InferUITools<AdvisorToolSet>>;
