import "server-only";
import {
  FABRIC_GUIDANCE_DISCLAIMER,
  fabricGuidanceOutputSchema,
  type FabricGuidanceInput,
  type FabricGuidanceOutput,
} from "./fabric-guidance";

type FabricReferenceEntry = FabricGuidanceOutput["suggestions"][number] & {
  occasions: readonly FabricGuidanceInput["occasion"][];
  climates: readonly FabricGuidanceInput["climate"][];
  priorities: readonly FabricGuidanceInput["priority"][];
};

// Curated category-level starting points, not stock or performance guarantees.
// Composition, weave, weight, lining, and finish can change all these properties.
// The lists deliberately cover only reviewed combinations; gaps remain empty.
const fabricReference: readonly FabricReferenceEntry[] = [
  {
    name: "Light- to medium-weight cotton wovens",
    occasions: ["everyday", "work", "wedding", "formal_event"],
    climates: ["hot", "mild"],
    priorities: ["breathability", "easy_care", "structure"],
    rationale: "Cotton wovens can offer breathable everyday or occasion wear; a crisper weave can give a garment some body.",
    consideration: "Weight, density, and finish affect airflow and shape. Check the care label: shrinkage and creasing can still occur.",
  },
  {
    name: "Linen-rich woven fabrics",
    occasions: ["everyday", "work", "wedding", "formal_event"],
    climates: ["hot", "mild"],
    priorities: ["breathability", "structure"],
    rationale: "Linen-rich wovens are a useful warm-weather starting point; a suitably crisp weight can lend body to an outfit.",
    consideration: "Creasing is common. A blend, dense weave, or lining can change the feel and airflow; inspect composition and a swatch.",
  },
  {
    name: "Wool suiting fabrics",
    occasions: ["work", "wedding", "formal_event"],
    climates: ["mild", "cool"],
    priorities: ["structure", "drape"],
    rationale: "Appropriate wool suiting weights can support tailored shapes or a controlled drape for work and formal outfits.",
    consideration: "Warmth and handle vary greatly by weight and weave. Check lining, skin comfort, and the specific care requirements.",
  },
  {
    name: "Fluid viscose woven fabrics",
    occasions: ["everyday", "wedding", "formal_event"],
    climates: ["hot", "mild"],
    priorities: ["drape", "breathability"],
    rationale: "Light, fluid viscose wovens can suit flowing silhouettes where movement and a soft handle are priorities.",
    consideration: "Dense constructions may feel less airy. Some viscose fabrics shrink or distort when wet; follow the care label and test preparation.",
  },
  {
    name: "Easy-care woven blends",
    occasions: ["everyday", "work"],
    climates: ["mild", "cool"],
    priorities: ["easy_care", "structure"],
    rationale: "A woven blend specifically labelled easy-care can be worth considering for practical everyday or work outfits.",
    consideration: "A blend name alone does not guarantee easy care or breathability. Confirm fibre ratios, finish, washing instructions, and garment weight.",
  },
  {
    name: "Fluid crepe-textured fabrics",
    occasions: ["wedding", "formal_event"],
    climates: ["mild"],
    priorities: ["drape"],
    rationale: "A fluid crepe-textured fabric can be a starting point for an occasion outfit with a flowing silhouette.",
    consideration: "Crepe describes texture, not a definite fibre. Check composition, opacity, weight, lining needs, and care before choosing.",
  },
];

export function findFabricMatches(input: FabricGuidanceInput): FabricGuidanceOutput {
  // All three criteria must match. Equally eligible entries keep curated order.
  // No scores, random values, broad fallback, or inferred customer preferences.
  const suggestions = fabricReference.filter((entry) =>
    entry.occasions.includes(input.occasion) &&
    entry.climates.includes(input.climate) &&
    entry.priorities.includes(input.priority)
  ).slice(0, 3).map(({ name, rationale, consideration }) => ({
    name, rationale, consideration,
  }));

  return fabricGuidanceOutputSchema.parse({
    kind: "general-fabric-guidance",
    input,
    suggestions,
    source: "developer-curated-reference",
    inventoryVerified: false,
    disclaimer: FABRIC_GUIDANCE_DISCLAIMER,
  });
}
