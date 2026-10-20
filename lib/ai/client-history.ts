import type { AdvisorMessage } from "./messages";

// Preserve the named tool's state and Gemini signatures, not arbitrary SDK parts.
// The server still validates every field and recomputes successful tool results.
export function getOutgoingMessages(messages: AdvisorMessage[]) {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts.filter((part) => part.type === "text" ||
      (message.role === "assistant" && (part.type === "step-start" ||
        (part.type === "tool-findFabricGuidance" && ["input-streaming", "input-available", "output-available", "output-error"].includes(part.state))))),
  })).filter((message) => message.parts.some((part) => part.type === "tool-findFabricGuidance" ||
    (part.type === "text" && part.text.trim().length > 0)));
}
