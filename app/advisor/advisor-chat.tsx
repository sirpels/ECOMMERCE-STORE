"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";

const transport = new DefaultChatTransport<UIMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ messages }) => ({
    body: {
      // Send only text. SDK step markers and empty stopped responses are not context.
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts.filter((part) => part.type === "text"),
      })).filter((message) => message.parts.some((part) => part.text.trim())),
    },
  }),
});

function errorMessage(error: Error): string {
  // Our handler returns these safe messages; do not render arbitrary network errors.
  if (/^(The advisor |Conversation |Message exceeds |Messages cannot |Only text |Request exceeds )/.test(error.message)) {
    return error.message;
  }
  return "Could not reach the advisor. Check your connection and try again.";
}

export default function AdvisorChat() {
  const { messages, sendMessage, status, error, stop, clearError } = useChat<UIMessage>({
    transport,
    resume: false,
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
  const lastMessage = messages.at(-1);
  const hasResponseText = lastMessage?.role === "assistant" &&
    lastMessage.parts.some((part) => part.type === "text" && part.text.length > 0);
  const thinking = busy && !hasResponseText;

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
          {messages.length === 0 && <p className="text-sm leading-6 text-muted">Tell me about your occasion or the fabric you have in mind. Please avoid sharing personal details.</p>}
          {messages.map((message) => {
            const textParts = message.parts.filter((part) => part.type === "text");
            if (!textParts.some((part) => part.text.length > 0)) return null;
            return (
              <article key={message.id} aria-label={message.role === "user" ? "Your message" : "Advisor response"} className={`max-w-[95%] rounded-card p-4 ${message.role === "user" ? "ml-auto bg-accent" : "mr-auto border border-border bg-background"}`}>
                <p className="mb-2 text-xs font-semibold text-primary">{message.role === "user" ? "You" : "Advisor"}</p>
                {textParts.map((part, index) => <p key={index} className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{part.text}</p>)}
              </article>
            );
          })}
          {thinking && <p className="text-sm text-muted motion-safe:animate-pulse">Advisor is thinking…</p>}
        </div>
      </div>
      <div className="border-t border-border px-4 py-3 sm:px-6">
        <div className="flex min-h-9 items-center justify-between gap-3">
          <p role="status" aria-live="polite" className="text-xs text-muted">{stopping ? "Stopping response…" : thinking ? "Advisor is thinking…" : busy ? "Advisor is responding…" : "Ready for your message"}</p>
          {hasNewContent && <button type="button" onClick={jumpToLatest} className="shrink-0 rounded-card border border-border px-3 py-2 text-xs font-semibold">Jump to latest</button>}
        </div>
        {error && <p role="alert" className="my-3 rounded-card bg-accent p-3 text-sm [overflow-wrap:anywhere]">{errorMessage(error)}</p>}
        <form onSubmit={(event) => {
          event.preventDefault();
          const text = input.trim();
          if (!text || busy || stopping) return;
          clearError();
          void sendMessage({ text });
          setInput("");
        }}>
          <label htmlFor="advisor-message" className="mb-2 block text-sm font-medium">Your fabric or style question</label>
          <textarea ref={inputRef} id="advisor-message" value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} rows={3} disabled={busy || stopping} aria-describedby="advisor-input-help" className="block w-full resize-y rounded-card border border-border bg-background p-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60" />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p id="advisor-input-help" className="text-xs text-muted">Up to 2,000 characters. Chats are not saved.</p>
            {busy || stopping ? <button type="button" onClick={() => void stopResponse()} disabled={stopping} className="shrink-0 rounded-card border border-primary px-5 py-3 text-sm font-semibold disabled:opacity-50">{stopping ? "Stopping…" : "Stop"}</button> : <button type="submit" disabled={!input.trim()} className="shrink-0 rounded-card bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">Send</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
