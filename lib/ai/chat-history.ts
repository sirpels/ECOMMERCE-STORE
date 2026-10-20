import "server-only";
import { isDeepStrictEqual } from "node:util";
import { validateUIMessages } from "ai";
import { z } from "zod";
import { advisorConfig } from "./config";
import {
  FABRIC_GUIDANCE_ERROR_MESSAGE,
  fabricGuidanceInputSchema,
  fabricGuidanceOutputSchema,
} from "./fabric-guidance";
import { findFabricMatches } from "./fabric-reference";
import type { AdvisorMessage } from "./messages";
import type { AdvisorToolSet } from "./tools";

export class ChatRequestError extends Error {
  constructor(message: string, public readonly status: 400 | 413 | 415 = 400) {
    super(message);
  }
}

// Keep Gemini thought signatures for tool follow-ups, but do not accept arbitrary
// provider options, metadata, approvals, or provider-executed claims from clients.
const providerMetadataSchema = z.object({
  google: z.object({ thoughtSignature: z.string().max(8192).optional() }).strict().optional(),
}).strict();
const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  state: z.enum(["streaming", "done"]).optional(),
  providerMetadata: providerMetadataSchema.optional(),
}).strict();
const stepPartSchema = z.object({ type: z.literal("step-start") }).strict();
// A stopped JSON stream may end partway through an enum value (e.g. "wedd").
// These strings are not executable inputs: incomplete calls are omitted later.
const partialInputSchema = z.object({
  occasion: z.string().max(64).optional(),
  climate: z.string().max(64).optional(),
  priority: z.string().max(64).optional(),
}).strict();
const toolBase = z.object({
  type: z.literal("tool-findFabricGuidance"),
  toolCallId: z.string().min(1).max(128),
  title: z.string().max(80).optional(),
  providerExecuted: z.literal(false).optional(),
  callProviderMetadata: providerMetadataSchema.optional(),
});
const toolPartSchema = z.discriminatedUnion("state", [
  toolBase.extend({
    state: z.literal("input-streaming"),
    input: partialInputSchema.optional(),
    rawInput: z.string().max(2048).optional(),
    inputEncoding: z.literal("json").optional(),
  }).strict(),
  toolBase.extend({
    state: z.literal("input-available"), input: fabricGuidanceInputSchema,
  }).strict(),
  toolBase.extend({
    state: z.literal("output-available"),
    input: fabricGuidanceInputSchema,
    output: fabricGuidanceOutputSchema,
    preliminary: z.literal(false).optional(),
    resultProviderMetadata: providerMetadataSchema.optional(),
  }).strict(),
  toolBase.extend({
    state: z.literal("output-error"),
    // Failed model input validation can itself produce an output-error part.
    input: partialInputSchema.optional(),
    errorText: z.string().min(1).max(1000),
    resultProviderMetadata: providerMetadataSchema.optional(),
  }).strict(),
]);
const assistantPartSchema = z.union([textPartSchema, stepPartSchema, toolPartSchema]);
const envelopeSchema = z.object({ messages: z.array(z.object({
  id: z.string().min(1).max(128),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.unknown()).min(1).max(16),
}).strict()).min(1) }).strict();

export async function validateAdvisorMessages(body: unknown, tools: AdvisorToolSet): Promise<AdvisorMessage[]> {
  const envelope = envelopeSchema.safeParse(body);
  if (!envelope.success) throw new ChatRequestError("Invalid chat message structure.");
  const messages = envelope.data.messages;
  if (messages.length > advisorConfig.maxMessages) {
    throw new ChatRequestError("Conversation limit reached (24 messages). Reload to start a new conversation.", 413);
  }
  if (messages[0].role !== "user" || messages.at(-1)?.role !== "user") {
    throw new ChatRequestError("Conversation must begin and end with a user message.");
  }
  const ids = new Set<string>();
  const callIds = new Set<string>();
  let totalCharacters = 0;
  const normalized = messages.map((message) => {
    if (ids.has(message.id)) throw new ChatRequestError("Message IDs must be unique.");
    ids.add(message.id);
    let characters = 0;
    const parts = message.parts.map((rawPart) => {
      const parsed = assistantPartSchema.safeParse(rawPart);
      if (!parsed.success) throw new ChatRequestError("Invalid or unsupported message part.");
      const part = parsed.data;
      if (message.role === "user" && (part.type !== "text" || part.providerMetadata)) {
        throw new ChatRequestError("User messages must contain text only.");
      }
      if (part.type === "text") {
        characters += part.text.length;
        return part;
      }
      if (part.type === "step-start") return part;
      if (callIds.has(part.toolCallId)) throw new ChatRequestError("Tool call IDs must be unique.");
      callIds.add(part.toolCallId);
      characters += JSON.stringify(part).length;
      if (part.state === "output-available") {
        const expected = findFabricMatches(part.input);
        if (!isDeepStrictEqual(part.output, expected)) {
          throw new ChatRequestError("Tool history does not match the fabric reference.");
        }
        return { ...part, output: expected };
      }
      if (part.state === "output-error") {
        const input = fabricGuidanceInputSchema.safeParse(part.input);
        return { ...part, input: input.success ? input.data : undefined, errorText: FABRIC_GUIDANCE_ERROR_MESSAGE };
      }
      return part;
    });
    const hasContent = parts.some((part) => part.type === "tool-findFabricGuidance" ||
      (part.type === "text" && part.text.trim().length > 0));
    if (!hasContent) throw new ChatRequestError("Messages cannot be blank.");
    const limit = message.role === "user" ? advisorConfig.maxUserCharacters : advisorConfig.maxMessageCharacters;
    if (characters > limit) throw new ChatRequestError(`Message exceeds the ${limit} character limit.`, 413);
    totalCharacters += characters;
    return { ...message, parts };
  });
  if (totalCharacters > advisorConfig.maxConversationCharacters) {
    throw new ChatRequestError("Conversation exceeds 16,000 characters. Reload to start a new conversation.", 413);
  }
  try {
    // The allowlist above is intentional: the SDK can normalize unknown tools
    // into dynamic parts, which this application does not permit.
    return await validateUIMessages<AdvisorMessage>({ messages: normalized, tools });
  } catch {
    throw new ChatRequestError("Invalid chat history.");
  }
}

export function getModelHistory(messages: AdvisorMessage[]): AdvisorMessage[] {
  // Do not pass a failed call with no valid arguments to Gemini. Keep it in UI
  // history, but exclude it from model history rather than fabricating arguments.
  return messages.map((message) => ({ ...message, parts: message.parts.filter((part) =>
    !(part.type === "tool-findFabricGuidance" && part.state === "output-error" && !part.input)
  ) }));
}
