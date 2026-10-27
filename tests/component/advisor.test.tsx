import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdvisorChat from "../../app/advisor/advisor-chat";
import FabricGuidanceResult, { type FabricGuidancePart } from "../../app/advisor/fabric-guidance-result";
import { FABRIC_GUIDANCE_DISCLAIMER } from "../../lib/ai/fabric-guidance";
import type { AdvisorMessage } from "../../lib/ai/messages";

type FinishEvent = {
  message: AdvisorMessage;
  messages: AdvisorMessage[];
  isAbort: boolean;
  isError: boolean;
  finishReason?: string;
};

// The actual Advisor component renders; only useChat's provider transport is mocked.
const chat = vi.hoisted(() => ({
  messages: [] as AdvisorMessage[],
  status: "ready" as "ready" | "submitted" | "streaming",
  sendMessage: vi.fn(async () => {}),
  regenerate: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  clearError: vi.fn(),
  onFinish: null as ((event: FinishEvent) => void) | null,
  onError: null as ((error: Error) => void) | null,
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: (options: { onFinish: (event: FinishEvent) => void; onError: (error: Error) => void }) => {
    chat.onFinish = options.onFinish;
    chat.onError = options.onError;
    return chat;
  },
}));

const input = { occasion: "wedding", climate: "hot", priority: "breathability" } as const;
const output = {
  kind: "general-fabric-guidance" as const,
  input,
  suggestions: [{
    name: "Light- to medium-weight cotton wovens",
    rationale: "Cotton wovens can offer breathable occasion wear.",
    consideration: "Check weight, density, and finish.",
  }],
  source: "developer-curated-reference" as const,
  inventoryVerified: false as const,
  disclaimer: FABRIC_GUIDANCE_DISCLAIMER,
};
const toolBase = { type: "tool-findFabricGuidance", toolCallId: "test-call" } as const;
const toolPart = (part: Record<string, unknown>) => ({ ...toolBase, ...part }) as FabricGuidancePart;
const message = (id: string, role: "user" | "assistant", text: string): AdvisorMessage => ({
  id, role, parts: [{ type: "text", text }],
});

beforeEach(() => {
  chat.messages = [];
  chat.status = "ready";
  chat.sendMessage.mockReset().mockResolvedValue(undefined);
  chat.regenerate.mockReset().mockResolvedValue(undefined);
  chat.stop.mockReset().mockResolvedValue(undefined);
  chat.clearError.mockReset();
  chat.onFinish = null;
  chat.onError = null;
});

describe("Advisor conversation and composer", () => {
  it("renders actual user and assistant text parts in named articles", () => {
    chat.messages = [message("u1", "user", "Which fabric is breathable?"), message("a1", "assistant", "Consider a cotton woven.")];
    render(<AdvisorChat />);
    expect(within(screen.getByRole("article", { name: "Your message" })).getByText("Which fabric is breathable?")).toBeVisible();
    expect(within(screen.getByRole("article", { name: "Advisor response" })).getByText("Consider a cotton woven.")).toBeVisible();
  });

  it("shows a pending response and an accessible Stop action", () => {
    chat.messages = [message("u1", "user", "Help with fabric")];
    chat.status = "submitted";
    render(<AdvisorChat />);
    expect(screen.getAllByText("Advisor is thinking…").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "Your fabric or style question" })).toBeDisabled();
  });

  it("shows streamed text while allowing Stop, without a stale thinking indicator", () => {
    chat.messages = [message("u1", "user", "Help"), message("a1", "assistant", "A first streamed sentence")];
    chat.status = "streaming";
    render(<AdvisorChat />);
    expect(within(screen.getByRole("article", { name: "Advisor response" })).getByText("A first streamed sentence")).toBeVisible();
    expect(screen.queryByText("Advisor is thinking…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  });

  it("keeps partial text and retries only the failed response", async () => {
    const user = userEvent.setup();
    const userMessage = message("u1", "user", "A fabric question");
    const partial = message("a1", "assistant", "Useful partial guidance");
    chat.messages = [userMessage, partial];
    render(<AdvisorChat />);
    act(() => {
      chat.onError?.(new Error("Transport failed"));
      chat.onFinish?.({ message: partial, messages: chat.messages, isAbort: false, isError: true, finishReason: "error" });
    });
    expect(screen.getByRole("alert", { name: "Advisor response issue" })).toHaveTextContent("Response interrupted");
    expect(within(screen.getByRole("article", { name: "Advisor response" })).getByText("Useful partial guidance")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry response" }));
    expect(chat.regenerate).toHaveBeenCalledExactlyOnceWith({ messageId: "a1" });
    expect(chat.sendMessage).not.toHaveBeenCalled();
    expect(screen.getAllByRole("article", { name: "Your message" })).toHaveLength(1);
    expect(within(screen.getByRole("complementary", { name: "Previous incomplete response" })).getByText("Useful partial guidance")).toBeVisible();
  });

  it("blocks empty and whitespace-only submissions", async () => {
    const user = userEvent.setup();
    render(<AdvisorChat />);
    const composer = screen.getByRole("textbox", { name: "Your fabric or style question" });
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled();
    await user.type(composer, "   ");
    expect(send).toBeDisabled();
    expect(chat.sendMessage).not.toHaveBeenCalled();
  });

  it("sends trimmed valid input and clears the composer", async () => {
    const user = userEvent.setup();
    render(<AdvisorChat />);
    const composer = screen.getByRole("textbox", { name: "Your fabric or style question" });
    await user.type(composer, "  How does linen feel?  ");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(chat.sendMessage).toHaveBeenCalledExactlyOnceWith({ text: "How does linen feel?" });
    expect(composer).toHaveValue("");
  });

  it("fills an editable example without sending it", async () => {
    const user = userEvent.setup();
    render(<AdvisorChat />);
    await user.click(screen.getByRole("button", { name: /Suggest fabric categories for a wedding/ }));
    const composer = screen.getByRole("textbox", { name: "Your fabric or style question" });
    expect(composer).toHaveValue("Suggest fabric categories for a wedding in hot weather; breathability matters most.");
    expect(chat.sendMessage).not.toHaveBeenCalled();
    await user.type(composer, " Please explain.");
    expect((composer as HTMLTextAreaElement).value).toContain("Please explain.");
  });

  it("renders a tool part as a recommendation card inside the assistant response", () => {
    chat.messages = [message("u1", "user", "Wedding fabric"), {
      id: "a1", role: "assistant", parts: [toolPart({ state: "output-available", input, output })],
    }];
    render(<AdvisorChat />);
    const response = screen.getByRole("article", { name: "Advisor response" });
    expect(within(response).getByRole("region", { name: "Fabric Match results" })).toBeVisible();
    expect(within(response).getByRole("heading", { name: "Light- to medium-weight cotton wovens" })).toBeVisible();
  });
});

describe("Fabric Match lifecycle", () => {
  it("renders validated preferences, rationale, consideration, and inventory disclaimer", () => {
    render(<FabricGuidanceResult part={toolPart({ state: "output-available", input, output })} active={false} />);
    const results = screen.getByRole("region", { name: "Fabric Match results" });
    expect(within(results).getByRole("heading", { name: "Light- to medium-weight cotton wovens" })).toBeVisible();
    expect(within(results).getByText(output.suggestions[0].rationale)).toBeVisible();
    expect(within(results).getByText(output.suggestions[0].consideration)).toBeVisible();
    expect(within(results).getByText(FABRIC_GUIDANCE_DISCLAIMER)).toBeVisible();
    expect(within(results).getByText("Wedding")).toBeVisible();
  });

  it("offers preference adjustment after a genuine no-results output", async () => {
    const user = userEvent.setup();
    const adjust = vi.fn();
    render(<FabricGuidanceResult part={toolPart({ state: "output-available", input, output: { ...output, suggestions: [] } })} active={false} onAdjustPreferences={adjust} />);
    expect(screen.getByText(/No matching fabric category is listed/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Adjust preferences" }));
    expect(adjust).toHaveBeenCalledOnce();
  });

  it("shows a safe tool failure and hides internal error details", () => {
    render(<FabricGuidanceResult part={toolPart({ state: "output-error", input, errorText: "PRIVATE_INTERNAL_ERROR" })} active={false} />);
    expect(screen.getByRole("alert", { name: "Fabric Match error" })).toHaveTextContent("Fabric guidance couldn't be loaded. Please try again.");
    expect(screen.queryByText("PRIVATE_INTERNAL_ERROR")).not.toBeInTheDocument();
  });

  it("distinguishes streamed input from a parsed lookup", () => {
    const { rerender } = render(<FabricGuidanceResult part={toolPart({ state: "input-streaming", input: { occasion: "wed" } })} active />);
    expect(screen.getByRole("heading", { name: /Fabric Match.*Preparing/ })).toBeVisible();
    expect(screen.getByText(/Preparing a fabric lookup/)).toBeVisible();
    expect(screen.queryByText("Wedding")).not.toBeInTheDocument();
    rerender(<FabricGuidanceResult part={toolPart({ state: "input-available", input })} active />);
    expect(screen.getByRole("heading", { name: /Fabric Match.*Searching/ })).toBeVisible();
    expect(screen.getByText("Wedding")).toBeVisible();
  });

  it("explains interrupted pending work without pretending it is still loading", () => {
    render(<FabricGuidanceResult part={toolPart({ state: "input-available", input })} active={false} outcome="interrupted" />);
    expect(screen.getByRole("status")).toHaveTextContent("Lookup interrupted. Retry the response or send another question.");
    expect(screen.queryByText(/Finding general fabric categories/)).not.toBeInTheDocument();
  });
});
