import "server-only";
import { APICallError, type UIMessageChunk } from "ai";
import { errorCodeText } from "./errors";
import { FabricGuidanceError } from "./tools";

export function safeStreamError(error: unknown) {
  if (error instanceof FabricGuidanceError) return error.message;
  if (APICallError.isInstance(error)) {
    return errorCodeText(error.statusCode === 429 ? "quota" : "unavailable");
  }
  return errorCodeText("stream");
}
export function withTimeoutError(stream: ReadableStream<UIMessageChunk>, timeout: AbortSignal, request: AbortSignal) {
  return stream.pipeThrough(new TransformStream<UIMessageChunk, UIMessageChunk>({
    transform(chunk, controller) {
      // A customer Stop closes fetch; a server deadline must be a recoverable error.
      if (chunk.type === "abort" && timeout.aborted && !request.aborted) {
        controller.enqueue({ type: "error", errorText: errorCodeText("timeout") });
      } else controller.enqueue(chunk);
    },
  }));
}
