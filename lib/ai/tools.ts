import "server-only";
import { tool, type PrepareStepResult } from "ai";
import {
  FABRIC_GUIDANCE_ERROR_MESSAGE,
  fabricGuidanceInputSchema,
  fabricGuidanceOutputSchema,
} from "./fabric-guidance";
import { findFabricMatches } from "./fabric-reference";

export class FabricGuidanceError extends Error {
  constructor() {
    super(FABRIC_GUIDANCE_ERROR_MESSAGE);
    this.name = "FabricGuidanceError";
  }
}

export function isFabricGuidanceFailureTestEnabled() {
  return process.env.NODE_ENV === "development" &&
    process.env.FABRIC_GUIDANCE_TEST_FAILURE === "1";
}

// A new tool set belongs to one HTTP request; never share its budget globally.
export function createAdvisorTools() {
  let executions = 0;
  return {
    findFabricGuidance: tool({
      description: "Find general fabric-category guidance from a curated local reference. Use only when the customer has supplied occasion, climate, and main priority. Ask about missing preferences first. This does not search store stock, products, prices, or orders.",
      inputSchema: fabricGuidanceInputSchema,
      outputSchema: fabricGuidanceOutputSchema,
      execute: async (input, { abortSignal }) => {
        // Check cancellation before the budget/error path so Stop is not a failure.
        abortSignal?.throwIfAborted();
        // Increment synchronously before doing work: parallel invocations cannot
        // each pass the guard. Failed attempts also consume this request's budget.
        if (executions++ >= 1) throw new FabricGuidanceError();
        try {
          const validatedInput = fabricGuidanceInputSchema.parse(input);
          if (isFabricGuidanceFailureTestEnabled()) throw new FabricGuidanceError();
          const output = findFabricMatches(validatedInput); // Output is runtime-validated.
          abortSignal?.throwIfAborted();
          return output;
        } catch {
          abortSignal?.throwIfAborted();
          // Do not forward schema issues, stack traces, or implementation details.
          throw new FabricGuidanceError();
        }
      },
    }),
  };
}

export type AdvisorToolSet = ReturnType<typeof createAdvisorTools>;

export function prepareAdvisorToolStep({ stepNumber }: { stepNumber: number }): PrepareStepResult<AdvisorToolSet> {
  // The second step can explain a result/failure but cannot request more tools.
  if (stepNumber > 0) return { toolChoice: "none", activeTools: [] };
  if (isFabricGuidanceFailureTestEnabled()) {
    return { toolChoice: { type: "tool", toolName: "findFabricGuidance" } };
  }
}
