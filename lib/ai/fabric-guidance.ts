import { z } from "zod";

// Shared contracts only. Do not import server data or credentials here.
export const fabricGuidanceInputSchema = z.object({
  occasion: z.enum(["everyday", "work", "wedding", "formal_event"])
    .describe("The customer's occasion. Ask when it is unknown; do not guess."),
  climate: z.enum(["hot", "mild", "cool"])
    .describe("The climate in which the outfit will be worn, as supplied by the customer."),
  priority: z.enum(["breathability", "easy_care", "drape", "structure"])
    .describe("The customer's main fabric priority. Ask which matters most if unclear."),
}).strict();

export const FABRIC_GUIDANCE_DISCLAIMER =
  "General fabric guidance only. Store products, prices, stock, and availability are not verified.";

export const FABRIC_GUIDANCE_ERROR_MESSAGE =
  "Fabric guidance could not be loaded. Please try again.";

export const fabricGuidanceOutputSchema = z.object({
  kind: z.literal("general-fabric-guidance"),
  input: fabricGuidanceInputSchema,
  suggestions: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    rationale: z.string().trim().min(1).max(320),
    consideration: z.string().trim().min(1).max(320),
  }).strict()).max(3),
  source: z.literal("developer-curated-reference"),
  inventoryVerified: z.literal(false),
  disclaimer: z.literal(FABRIC_GUIDANCE_DISCLAIMER),
}).strict();

export type FabricGuidanceInput = z.infer<typeof fabricGuidanceInputSchema>;
export type FabricGuidanceOutput = z.infer<typeof fabricGuidanceOutputSchema>;
