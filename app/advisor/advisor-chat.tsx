"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import type { AdvisorMessage } from "../../lib/ai/messages";
import { getOutgoingMessages } from "../../lib/ai/client-history";
import FabricGuidanceResult from "./fabric-guidance-result";
import { advisorErrors, advisorFetch, canRetryFailure, classifyAdvisorError, type AdvisorFailure } from "../../lib/ai/errors";

const transport = new DefaultChatTransport<AdvisorMessage>({
  api: "/api/chat",
  fetch: advisorFetch,
  prepareSendMessagesRequest: ({ messages }) => ({
    body: {
      messages: getOutgoingMessages(messages),
    },
  }),
});

type FailedTurn = { userId: string; targetId: string; failure: AdvisorFailure };
function hasContent(message: AdvisorMessage) {
  return message.parts.some(part => part.type === "tool-findFabricGuidance" || (part.type === "text" && part.text.trim().length > 0));
}
const examples = [
  "Suggest fabric categories for a wedding in hot weather; breathability matters most.",
  "What should I consider when choosing lace for an occasion outfit?",
  "How do fabric weight and weave affect a senator-style outfit?",
];

export default function AdvisorChat() {
  const [failedTurn, setFailedTurn] = useState<FailedTurn | null>(null);
  const [retrySnapshot, setRetrySnapshot] = useState<AdvisorMessage | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, "stopped" | "interrupted">>({});
  const [completionNotice, setCompletionNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [slow, setSlow] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const requestLock = useRef(false);
  const intentionalStop = useRef(false);
  const pendingError = useRef<AdvisorFailure | null>(null);
  const { messages, sendMessage, regenerate, status, stop, clearError } = useChat<AdvisorMessage>({
    transport,
    resume: false,
    onError(error) { pendingError.current = classifyAdvisorError(error, !navigator.onLine); },
    onFinish({ message, messages: history, isAbort, isError, finishReason }) {
      setSlow(false);
      const user = history.findLast(item => item.role === "user");
      if (!user) return;
      if (intentionalStop.current || isAbort) {
        setOutcomes(previous => ({ ...previous, [message.id]: "stopped" }));
        setFailedTurn(null);
        setCompletionNotice("Response stopped. You can send another question.");
        return;
      }
      const answered = message.parts.some(part => (part.type === "text" && part.text.trim()) ||
        (part.type === "tool-findFabricGuidance" && ["output-available", "output-error"].includes(part.state)));
      const failure: AdvisorFailure | null = isError ? pendingError.current ?? { code: "stream" } :
        finishReason === "content-filter" ? { code: "refusal" } :
        finishReason === undefined || finishReason === "error" ? { code: "stream" } :
        !answered ? { code: "empty" } : null;
      if (failure) {
        setNow(Date.now());
        setOutcomes(previous => ({ ...previous, [message.id]: "interrupted" }));
        setFailedTurn({ userId: user.id, targetId: history.some(item => item.id === message.id) ? message.id : user.id, failure });
      } else {
        setFailedTurn(null);
        setRetrySnapshot(null);
        setCompletionNotice(finishReason === "length" ? "Response reached its length limit. You can ask a follow-up." : null);
      }
    },
  });
  const [input, setInput] = useState("");
  const [stopping, setStopping] = useState(false);
  const [hasNewContent, setHasNewContent] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pinnedRef = useRef(true);
  const previousTopRef = useRef(0);
  const touchYRef = useRef(0);
  const busy = status === "submitted" || status === "streaming";
  const latestUser = messages.findLast(message => message.role === "user");
  const currentFailure = failedTurn?.userId === latestUser?.id ? failedTurn : null;
  const hasPartialResponse = !!retrySnapshot || messages.some(message => message.id === currentFailure?.targetId && message.role === "assistant" && hasContent(message));
  const cooldown = Math.max(0, Math.ceil(((currentFailure?.failure.retryAt ?? 0) - now) / 1000));
  const lastMessage = messages.at(-1);
  const hasResponseText = lastMessage?.role === "assistant" &&
    lastMessage.parts.some((part) => part.type === "text" && part.text.length > 0);
  const hasToolPart = lastMessage?.role === "assistant" &&
    lastMessage.parts.some((part) => part.type === "tool-findFabricGuidance");
  const thinking = busy && !hasResponseText && !hasToolPart;

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    // Subscribe before reading so offline changes aren't missed during hydration.
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const timer = setTimeout(update, 0);
    return () => { clearTimeout(timer); window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(timer);
  }, [busy]);
  useEffect(() => {
    if (!currentFailure?.failure.retryAt) return;
    const retryAt = currentFailure.failure.retryAt;
    const timer = setInterval(() => {
      const time = Date.now();
      setNow(time);
      if (time >= retryAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [currentFailure?.failure.retryAt]);

  function fillComposer(text: string) {
    if (requestLock.current || busy || stopping) return;
    setInput(text);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function requestResponse(retry = false) {
    if (requestLock.current || busy || stopping || !navigator.onLine) return;
    const text = input.trim();
    if (retry ? !currentFailure || !canRetryFailure(currentFailure.failure.code) ||
      (currentFailure.failure.retryAt ?? 0) > Date.now() : !text) return;
    requestLock.current = true; // Synchronous: two clicks in one render cannot race.
    intentionalStop.current = false;
    pendingError.current = null;
    setCompletionNotice(null);
    setSlow(false);
    clearError();
    try {
      if (retry && currentFailure) {
        const previous = messages.find(message => message.id === currentFailure.targetId && message.role === "assistant");
        if (previous && hasContent(previous)) setRetrySnapshot(structuredClone(previous));
        await regenerate({ messageId: currentFailure.targetId });
      } else {
        setFailedTurn(null);
        setRetrySnapshot(null);
        setInput("");
        await sendMessage({ text });
      }
    } finally {
      requestLock.current = false;
    }
  }

  function renderParts(message: AdvisorMessage, snapshot = false) {
    return message.parts.map((part, index) => {
      if (part.type === "text") return <p key={index} className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{part.text}</p>;
      if (part.type === "tool-findFabricGuidance") return <FabricGuidanceResult key={part.toolCallId} part={part}
        active={!snapshot && busy && !stopping && message.id === lastMessage?.id}
        outcome={snapshot ? "interrupted" : outcomes[message.id] ?? (stopping ? "stopped" : "interrupted")}
        onAdjustPreferences={!snapshot && !busy && !stopping ? () => fillComposer("I'd like to adjust my fabric preferences. Help me choose a different occasion, climate, or priority.") : undefined} />;
      return null;
    });
  }

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    // Observe actual content growth rather than scheduling scrolling per token.
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) {
        viewport.scrollTop = viewport.scrollHeight;
        previousTopRef.current = viewport.scrollTop;
      } else if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 48) {
        setHasNewContent(true);
      }
    });
    observer.observe(content);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  function handleScroll() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const nearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 48;
    if (viewport.scrollTop < previousTopRef.current) {
      pinnedRef.current = false;
    } else if (nearBottom) {
      pinnedRef.current = true;
      setHasNewContent(false);
    }
    previousTopRef.current = viewport.scrollTop;
  }

  function jumpToLatest() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    pinnedRef.current = true;
    viewport.scrollTop = viewport.scrollHeight;
    previousTopRef.current = viewport.scrollTop;
    setHasNewContent(false);
  }

  async function stopResponse() {
    if (stopping) return;
    intentionalStop.current = true;
    setStopping(true);
    try {
      // SDK stop aborts fetch and keeps all received message parts.
      await stop();
    } finally {
      setStopping(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  return (
    <div className="mt-6 max-w-3xl overflow-hidden rounded-card border border-border bg-surface">
      <h2 id="conversation-title" className="border-b border-border px-4 py-3 font-semibold sm:px-6">Your conversation</h2>
      <div
        ref={viewportRef}
        role="region"
        aria-labelledby="conversation-title"
        tabIndex={0}
        onScroll={handleScroll}
        onWheel={(event) => { if (event.deltaY < 0) pinnedRef.current = false; }}
        onTouchStart={(event) => { touchYRef.current = event.touches[0].clientY; }}
        onTouchMove={(event) => {
          const y = event.touches[0].clientY;
          if (y > touchYRef.current) pinnedRef.current = false;
          touchYRef.current = y;
        }}
        onKeyDown={(event) => {
          if (["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) {
            pinnedRef.current = false;
          }
        }}
        className="h-[min(52vh,30rem)] min-h-48 overflow-y-auto overscroll-contain p-4 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-primary sm:p-6 [overflow-anchor:none]"
      >
        <div ref={contentRef} className="space-y-5">
          {messages.length === 0 && <div>
            <p className="text-sm leading-6 text-muted">Tell me about your occasion or the fabric you have in mind. Please avoid sharing personal details. Choose a question to edit before sending:</p>
            <div className="mt-3 grid gap-2">{examples.map(example => <button key={example} type="button" onClick={() => fillComposer(example)} className="rounded-card border border-border px-3 py-3 text-left text-sm leading-6 hover:bg-accent">{example}</button>)}</div>
          </div>}
          {messages.map((message) => {
            if (!message.parts.some((part) => part.type === "tool-findFabricGuidance" ||
              (part.type === "text" && part.text.length > 0))) return null;
            return (
              <article key={message.id} aria-label={message.role === "user" ? "Your message" : "Advisor response"} className={`min-w-0 max-w-[95%] rounded-card p-4 ${message.role === "user" ? "ml-auto bg-accent" : "mr-auto border border-border bg-background"}`}>
                <p className="mb-2 text-xs font-semibold text-primary">{message.role === "user" ? "You" : "Advisor"}</p>
                {renderParts(message)}
              </article>
            );
          })}
          {retrySnapshot && <aside aria-label="Previous incomplete response" className="rounded-card border border-dashed border-border p-4">
            <h3 className="mb-2 text-xs font-semibold text-muted">Previous incomplete response — {busy ? "kept while trying again" : "retained from the earlier attempt"}</h3>
            {renderParts(retrySnapshot, true)}
          </aside>}
          {thinking && <p className="text-sm text-muted motion-safe:animate-pulse">Advisor is thinking…</p>}
        </div>
      </div>
      <div className="border-t border-border px-4 py-3 sm:px-6">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <p role="status" aria-live="polite" className="min-w-0 text-xs text-muted">{stopping ? "Stopping response…" : busy && slow ? "Still working. You can stop the response at any time." : thinking ? "Advisor is thinking…" : busy ? "Advisor is responding…" : currentFailure ? "The latest response needs attention" : completionNotice ?? "Ready for your message"}</p>
          {hasNewContent && <button type="button" onClick={jumpToLatest} className="shrink-0 rounded-card border border-border px-3 py-2 text-xs font-semibold">Jump to latest</button>}
        </div>
        {!online && <p role="status" className="my-3 rounded-card bg-accent p-3 text-sm">You&apos;re offline. You can keep drafting; reconnect to send or retry.</p>}
        {currentFailure && <section role={currentFailure.failure.code === "refusal" ? "status" : "alert"} aria-label="Advisor response issue" className="my-3 min-w-0 rounded-card border border-border bg-accent p-3 text-sm [overflow-wrap:anywhere]">
          <h3 className="font-semibold">{currentFailure.failure.code === "refusal" ? "Try a different question" : busy ? "Trying your latest question again" : hasPartialResponse ? "Response interrupted" : "Couldn't get a response"}</h3>
          <p className="mt-2">{advisorErrors[currentFailure.failure.code]}</p>
          {canRetryFailure(currentFailure.failure.code) ? <>
            <p className="mt-2 text-xs leading-5">Retry answers your latest question again. Earlier conversation stays unchanged.</p>
            <button type="button" onClick={() => void requestResponse(true)} disabled={busy || stopping || !online || cooldown > 0} className="mt-3 rounded-card border border-primary bg-surface px-4 py-3 font-semibold disabled:opacity-50">Retry response</button>
            {cooldown > 0 && <p className="mt-2 text-xs">Please wait {cooldown} seconds before retrying.</p>}
          </> : <button type="button" onClick={() => fillComposer(latestUser?.parts.filter(part => part.type === "text").map(part => part.text).join(" ") ?? "")} disabled={busy || stopping} className="mt-3 rounded-card border border-primary px-4 py-3">Edit question</button>}
        </section>}
        <form onSubmit={(event) => {
          event.preventDefault();
          void requestResponse();
        }}>
          <label htmlFor="advisor-message" className="mb-2 block text-sm font-medium">Your fabric or style question</label>
          <textarea ref={inputRef} id="advisor-message" value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} rows={3} disabled={busy || stopping} aria-describedby="advisor-input-help" className="block w-full resize-y rounded-card border border-border bg-background p-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60" />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p id="advisor-input-help" className="text-xs text-muted">Up to 2,000 characters. Chats are not saved.</p>
            {busy || stopping ? <button type="button" onClick={() => void stopResponse()} disabled={stopping} className="shrink-0 rounded-card border border-primary px-5 py-3 text-sm font-semibold disabled:opacity-50">{stopping ? "Stopping…" : "Stop"}</button> : <button type="submit" disabled={!input.trim() || !online} className="shrink-0 rounded-card bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Send</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
