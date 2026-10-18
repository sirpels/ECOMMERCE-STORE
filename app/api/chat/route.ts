import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { advisorConfig, getAdvisorModel } from "@/lib/ai/config";

export const runtime = "nodejs";
export const maxDuration = 60;

class RequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Count bytes while reading, even if Content-Length is absent or untrusted.
async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new RequestError("Send an application/json request.", 415);
  }
  if (Number(request.headers.get("content-length")) > advisorConfig.maxBodyBytes) {
    throw new RequestError("Request exceeds the 64 KB limit.", 413);
  }
  if (!request.body) throw new RequestError("Request body is required.", 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > advisorConfig.maxBodyBytes) {
        await reader.cancel();
        throw new RequestError("Request exceeds the 64 KB limit.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestError("Request must contain valid JSON.", 400);
  }
}

function validateMessages(body: unknown): UIMessage[] {
  if (!isRecord(body) || !Array.isArray(body.messages) || !body.messages.length) {
    throw new RequestError("Provide a non-empty messages array.", 400);
  }
  if (body.messages.length > advisorConfig.maxMessages) {
    throw new RequestError("Conversation limit reached (24 messages). Start a new conversation by reloading the page.", 413);
  }
  let totalCharacters = 0;
  const ids = new Set<string>();
  const messages: UIMessage[] = body.messages.map((message: unknown) => {
    if (!isRecord(message) ||
        (message.role !== "user" && message.role !== "assistant") ||
        typeof message.id !== "string" || !message.id || message.id.length > 128 ||
        ids.has(message.id) || !Array.isArray(message.parts) ||
        message.parts.length === 0 || message.parts.length > 16) {
      throw new RequestError("Each message needs a unique ID, a user or assistant role, and text parts.", 400);
    }
    ids.add(message.id);
    let text = "";
    for (const part of message.parts) {
      if (!isRecord(part) || part.type !== "text" || typeof part.text !== "string") {
        throw new RequestError("Only text message parts are supported.", 400);
      }
      text += part.text;
    }
    if (!text.trim()) throw new RequestError("Messages cannot be blank.", 400);
    const limit = message.role === "user"
      ? advisorConfig.maxUserCharacters : advisorConfig.maxMessageCharacters;
    if (text.length > limit) throw new RequestError(`Message exceeds the ${limit} character limit.`, 413);
    totalCharacters += text.length;
    return { id: message.id, role: message.role, parts: [{ type: "text", text }] };
  });
  if (totalCharacters > advisorConfig.maxConversationCharacters) {
    throw new RequestError("Conversation exceeds 16,000 characters. Start a new conversation by reloading the page.", 413);
  }
  if (messages[0].role !== "user" || messages.at(-1)?.role !== "user") {
    throw new RequestError("Conversation must begin and end with a user message.", 400);
  }
  return messages;
}

export async function POST(request: Request) {
  try {
    const messages = validateMessages(await readBody(request));
    const model = getAdvisorModel();
    if (!model) {
      return new Response("The advisor is not configured yet. Please try again later.", { status: 503 });
    }
    const result = streamText({
      model,
      instructions: advisorConfig.system,
      messages: await convertToModelMessages(messages),
      maxOutputTokens: advisorConfig.maxOutputTokens,
      maxRetries: 0,
      abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
      // Do not log provider errors, which may contain request details.
      onError: () => {},
    });
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({
        stream: result.stream,
        sendReasoning: false,
        onError: () => "The advisor could not respond. Please try again shortly; the free-tier quota may be temporarily exhausted.",
      }),
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof RequestError) return new Response(error.message, { status: error.status });
    return new Response("The advisor is temporarily unavailable. Please try again later.", { status: 503 });
  }
}
