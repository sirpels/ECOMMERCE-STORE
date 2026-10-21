import { APICallError } from "ai";

// Only these codes cross the server/client boundary. Never render raw errors.
export const advisorErrors = {
  offline: "You're offline. Reconnect, then try again. Your conversation is still here.",
  network: "The connection was interrupted. Check your connection and try again.",
  rate_limit: "Too many requests. Please wait before trying again.",
  quota: "The advisor is temporarily at its usage limit. Please try again later.",
  unavailable: "The advisor is temporarily unavailable. Please try again later.",
  validation: "This request could not be accepted. Edit your question, or reload to start a new conversation if the chat limit was reached.",
  timeout: "The response took too long. Anything received has been kept. You can try again.",
  stream: "The response was interrupted. Anything received has been kept. You can try again.",
  unknown: "Something went wrong with the response. Please try again.",
  empty: "The advisor finished without an answer. Please try again or rephrase your question.",
  refusal: "The advisor couldn't answer that request. Try rephrasing it as a fabric or styling question.",
} as const;
export type AdvisorErrorCode = keyof typeof advisorErrors;
export type AdvisorFailure = { code: AdvisorErrorCode; retryAt?: number };
export const errorCodeText = (code: AdvisorErrorCode) => `ADVISOR_ERROR:${code}`;
export function isAdvisorErrorCode(value: unknown): value is AdvisorErrorCode {
  return typeof value === "string" && Object.hasOwn(advisorErrors, value);
}
export class AdvisorRequestError extends Error {
  constructor(public readonly code: AdvisorErrorCode, public readonly retryAt?: number) {
    super(errorCodeText(code));
  }
}
export function httpErrorCode(status: number): AdvisorErrorCode {
  if (status === 429) return "rate_limit";
  if ([400, 413, 415, 422].includes(status)) return "validation";
  return status >= 500 ? "unavailable" : "unknown";
}
export function classifyAdvisorError(error: unknown, offline = false): AdvisorFailure {
  // Going offline must not erase an already received rate-limit deadline.
  if (error instanceof AdvisorRequestError) return { code: offline ? "offline" : error.code, retryAt: error.retryAt };
  if (offline) return { code: "offline" };
  if (APICallError.isInstance(error)) return { code: httpErrorCode(error.statusCode ?? 0) };
  if (error instanceof Error) {
    const code = error.message.startsWith("ADVISOR_ERROR:") ? error.message.slice(14) : undefined;
    if (isAdvisorErrorCode(code)) return { code };
    if (error instanceof TypeError) return { code: "network" };
  }
  return { code: "unknown" };
}
export function canRetryFailure(code: AdvisorErrorCode) {
  return code !== "validation" && code !== "refusal";
}
export function retryAfterTime(value: string | null, now = Date.now()): number | undefined {
  if (!value) return;
  const seconds = Number(value);
  const time = Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(value);
  // Ignore malformed or unreasonable dates, rather than scheduling giant timers.
  if (Number.isFinite(time) && time > now && time - now <= 86_400_000) return time;
}
export const advisorFetch: typeof fetch = async (input, init) => {
  const response = await globalThis.fetch(input, init);
  if (response.ok) return response;
  let code = httpErrorCode(response.status);
  if (response.headers.get("content-type")?.includes("application/json")) {
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "code" in body && isAdvisorErrorCode(body.code)) code = body.code;
    } catch { /* Unknown/HTML bodies never become user-facing copy. */ }
  }
  throw new AdvisorRequestError(code, retryAfterTime(response.headers.get("retry-after")));
};
