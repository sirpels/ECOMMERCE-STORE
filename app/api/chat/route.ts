import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
} from "ai";
import { advisorConfig, getAdvisorModel } from "@/lib/ai/config";
import { ChatRequestError as RequestError, getModelHistory, validateAdvisorMessages } from "@/lib/ai/chat-history";
import { createAdvisorTools, FabricGuidanceError, prepareAdvisorToolStep } from "@/lib/ai/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

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

export async function POST(request: Request) {
  try {
    const tools = createAdvisorTools();
    const messages = await validateAdvisorMessages(await readBody(request), tools);
    const model = getAdvisorModel();
    if (!model) {
      return new Response("The advisor is not configured yet. Please try again later.", { status: 503 });
    }
    const result = streamText({
      model,
      instructions: advisorConfig.system,
      messages: await convertToModelMessages(getModelHistory(messages), {
        tools,
        ignoreIncompleteToolCalls: true,
      }),
      tools,
      stopWhen: isStepCount(2),
      prepareStep: prepareAdvisorToolStep,
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
        onError: (error) => error instanceof FabricGuidanceError
          ? error.message
          : "The advisor could not respond. Please try again shortly; the free-tier quota may be temporarily exhausted.",
      }),
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof RequestError) return new Response(error.message, { status: error.status });
    return new Response("The advisor is temporarily unavailable. Please try again later.", { status: 503 });
  }
}
