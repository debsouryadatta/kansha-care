import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Check,
  ChevronDown,
  Circle,
  LoaderCircle,
  MessageSquareText,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  TerminalSquare,
  X
} from "lucide-react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { Button, cn, toast } from "@kansha/ui";
import { api, apiBase } from "../lib/api";
import { notifyError } from "../lib/notifications";

type AgentSession = {
  conversationId: string;
  messages: UIMessage[];
  suggestedActions: string[];
};

const actionTools = new Set([
  "addMonitoredLocation",
  "updateLocationRules",
  "removeMonitoredLocation",
  "disconnectTelegram"
]);

const defaultSuggestions = [
  "What can you do?",
  "Summarize last 24h",
  "Check my locations",
  "Find M4+ near Delhi",
  "Explain my latest alert"
];

export function AgentWidget() {
  const [open, setOpen] = React.useState(false);
  const [session, setSession] = React.useState<AgentSession | null>(null);
  const [error, setError] = React.useState("");
  const [isLoadingSession, setIsLoadingSession] = React.useState(true);
  const mountedRef = React.useRef(true);

  const loadSession = React.useCallback(async () => {
    setIsLoadingSession(true);
    setError("");
    try {
      const result = await api<AgentSession>("/agent/session");
      if (mountedRef.current) {
        setSession(result);
        setError("");
      }
    } catch (err) {
      if (mountedRef.current) {
        const message = notifyError(err, "Assistant unavailable");
        setError(message);
      }
    } finally {
      if (mountedRef.current) setIsLoadingSession(false);
    }
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    void loadSession();
    return () => {
      mountedRef.current = false;
    };
  }, [loadSession]);

  const root = (
    <div className="fixed bottom-5 right-5 z-[1000] sm:bottom-7 sm:right-7">
      <AnimatePresence>
        {open && (
          <motion.div
            key="agent-panel"
            initial={{ opacity: 0, y: 22, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mb-4 w-[calc(100vw-2.5rem)] origin-bottom-right overflow-hidden rounded-[26px] border border-slate-200/80 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.26)] sm:w-[430px]"
          >
            {session ? (
              <AgentChat
                key={session.conversationId}
                session={session}
                onClose={() => setOpen(false)}
              />
            ) : (
              <AgentPanelState
                error={error}
                isLoading={isLoadingSession}
                onClose={() => setOpen(false)}
                onRetry={() => void loadSession()}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => {
          setOpen((value) => {
            const next = !value;
            if (next && !session && !isLoadingSession) void loadSession();
            return next;
          });
        }}
        className={cn(
          "relative ml-auto grid h-[72px] w-[72px] place-items-center rounded-[28px] bg-indigo-600 text-white shadow-[0_24px_72px_rgba(79,70,229,0.42)] ring-[6px] ring-white/95 transition-all duration-200 hover:-translate-y-0.5 hover:bg-indigo-700 hover:shadow-[0_28px_90px_rgba(79,70,229,0.5)]",
          open && "bg-slate-950 shadow-[0_22px_70px_rgba(15,23,42,0.38)]",
          !open && "after:absolute after:inset-[-10px] after:-z-10 after:rounded-[34px] after:bg-indigo-500/20 after:blur-xl"
        )}
        aria-label={open ? "Close Kansha assistant" : "Open Kansha assistant"}
        title={error || (open ? "Close assistant" : "Open assistant")}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-8 w-8" />}
      </button>
    </div>
  );

  return createPortal(root, document.body);
}

function AgentPanelState({
  error,
  isLoading,
  onClose,
  onRetry
}: {
  error: string;
  isLoading: boolean;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="flex h-[360px] flex-col bg-white">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-100">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Kansha assistant</h2>
            <p className="text-xs font-medium text-slate-500">{isLoading ? "Connecting" : "Connection needed"}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-9 w-9 rounded-xl px-0" aria-label="Close assistant">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="grid flex-1 place-items-center px-5 text-center">
        <div className="max-w-[280px]">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
            {isLoading ? <LoaderCircle className="h-6 w-6 animate-spin" /> : <Bot className="h-6 w-6" />}
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-950">
            {isLoading ? "Opening assistant" : "Assistant could not load"}
          </h3>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
            {isLoading
              ? "Getting your chat history and tools ready."
              : error || "Please check the API server and try again."}
          </p>
          {!isLoading && (
            <Button type="button" onClick={onRetry} className="mt-4 h-10 rounded-xl bg-indigo-600 px-4 hover:bg-indigo-700">
              Try again
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function AgentChat({ session, onClose }: { session: AgentSession; onClose: () => void }) {
  const [input, setInput] = React.useState("");
  const [localNotice, setLocalNotice] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const lastChatError = React.useRef("");
  const {
    messages,
    status,
    error,
    sendMessage,
    stop,
    addToolOutput
  } = useChat({
    id: session.conversationId,
    messages: session.messages,
    transport: new DefaultChatTransport({
      api: `${apiBase}/agent/chat`,
      credentials: "include",
      body: { conversationId: session.conversationId }
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    experimental_throttle: 80
  });

  React.useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status, localNotice]);

  React.useEffect(() => {
    if (!error?.message || error.message === lastChatError.current) return;
    notifyError(error, "Assistant request failed");
    lastChatError.current = error.message;
  }, [error]);

  const isBusy = status === "submitted" || status === "streaming";
  const suggestions = session.suggestedActions.length ? session.suggestedActions : defaultSuggestions;

  async function submitPrompt(prompt: string) {
    const value = prompt.trim();
    if (!value || isBusy) return;
    setInput("");
    setLocalNotice("");
    try {
      await sendMessage({ text: value });
    } catch (err) {
      notifyError(err, "Could not send assistant request");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await submitPrompt(input);
  }

  async function resolveAction(part: any, approved: boolean) {
    const toolName = getToolName(part);
    if (!toolName || !part.toolCallId) return;
    setLocalNotice(approved ? "Running approved action..." : "Action denied.");
    if (!approved) {
      await addToolOutput({
        tool: toolName as never,
        toolCallId: part.toolCallId,
        output: { ok: false, denied: true, message: "The user denied this action." } as never
      });
      setLocalNotice("");
      return;
    }

    try {
      const response = await api<{ result: unknown }>("/agent/actions", {
        method: "POST",
        body: JSON.stringify({
          toolName,
          input: part.input
        })
      });
      await addToolOutput({
        tool: toolName as never,
        toolCallId: part.toolCallId,
        output: response.result as never
      });
      toast.success("Action completed");
      setLocalNotice("");
    } catch (err) {
      notifyError(err, "Assistant action failed");
      await addToolOutput({
        tool: toolName as never,
        toolCallId: part.toolCallId,
        state: "output-error",
        errorText: err instanceof Error ? err.message : "Action failed"
      } as any);
      setLocalNotice("");
    }
  }

  return (
    <section className="flex h-[min(680px,calc(100vh-7rem))] flex-col bg-white">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-100">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-950">Kansha assistant</h2>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Circle className={cn("h-2 w-2 fill-current", isBusy ? "text-amber-500" : "text-emerald-500")} />
              {isBusy ? "Working" : "Ready"}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-9 w-9 rounded-xl px-0" aria-label="Close assistant">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-[22px] bg-slate-950 px-4 py-3 text-sm font-medium leading-6 text-white shadow-xl shadow-slate-200">
              Ask about current earthquake activity, saved locations, alerts, Telegram, or location risk.
            </div>
            <div className="grid gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void submitPrompt(suggestion)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              onResolveAction={(part, approved) => void resolveAction(part, approved)}
            />
          ))}
          {localNotice && (
            <div className="flex items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              {localNotice}
            </div>
          )}
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error.message}
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-100 p-3">
        <div className="flex items-end gap-2 rounded-[22px] bg-slate-50 p-2 ring-1 ring-slate-200">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitPrompt(input);
              }
            }}
            rows={1}
            placeholder="Ask Kansha"
            className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400"
          />
          {isBusy ? (
            <Button
              type="button"
              onClick={() => {
                stop();
              }}
              className="h-10 w-10 rounded-2xl bg-slate-900 px-0"
              aria-label="Stop response"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button disabled={!input.trim()} className="h-10 w-10 rounded-2xl bg-indigo-600 px-0 hover:bg-indigo-700" aria-label="Send message">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

function ChatMessage({
  message,
  onResolveAction
}: {
  message: UIMessage;
  onResolveAction: (part: any, approved: boolean) => void;
}) {
  const isUser = message.role === "user";
  return (
    <article className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[88%] space-y-2", isUser && "items-end")}>
        {message.parts.map((part, index) => (
          <MessagePart
            key={`${message.id}-${index}`}
            part={part as any}
            isUser={isUser}
            onResolveAction={onResolveAction}
          />
        ))}
      </div>
    </article>
  );
}

function MessagePart({
  part,
  isUser,
  onResolveAction
}: {
  part: any;
  isUser: boolean;
  onResolveAction: (part: any, approved: boolean) => void;
}) {
  if (part.type === "text") {
    return (
      <div
        className={cn(
          "whitespace-pre-wrap rounded-[20px] px-3.5 py-2.5 text-sm font-medium leading-6",
          isUser
            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100"
            : "bg-slate-100 text-slate-800"
        )}
      >
        {part.text}
      </div>
    );
  }

  if (part.type === "reasoning") {
    return (
      <details className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
        <summary className="cursor-pointer font-semibold text-slate-700">Reasoning</summary>
        <div className="mt-2 whitespace-pre-wrap leading-5">{part.text}</div>
      </details>
    );
  }

  if (part.type === "step-start") {
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-500">
        <ChevronDown className="h-3.5 w-3.5" />
        Next step
      </div>
    );
  }

  if (isToolPart(part)) {
    return <ToolCard part={part} onResolveAction={onResolveAction} />;
  }

  return null;
}

function ToolCard({
  part,
  onResolveAction
}: {
  part: any;
  onResolveAction: (part: any, approved: boolean) => void;
}) {
  const toolName = getToolName(part);
  const isAction = toolName ? actionTools.has(toolName) : false;
  const awaitingApproval = isAction && part.state === "input-available";
  const hasOutput = part.state === "output-available" || part.state === "output-error" || part.state === "output-denied";

  return (
    <div className="rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
            {isAction ? <ShieldCheck className="h-4 w-4" /> : <TerminalSquare className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-500">
              {formatToolName(toolName ?? "tool")}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-slate-800">{toolStateLabel(part.state)}</p>
          </div>
        </div>
        {part.state === "input-streaming" || part.state === "input-available" ? (
          <LoaderCircle className="mt-1 h-4 w-4 shrink-0 animate-spin text-indigo-600" />
        ) : hasOutput ? (
          <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
        ) : null}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-indigo-700">Details</summary>
        <pre className="mt-2 max-h-44 overflow-auto rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
          {formatJson({
            input: part.input,
            output: part.output,
            error: part.errorText
          })}
        </pre>
      </details>

      {awaitingApproval && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700" onClick={() => onResolveAction(part, true)}>
            Approve
          </Button>
          <Button size="sm" variant="secondary" className="h-9 rounded-xl" onClick={() => onResolveAction(part, false)}>
            Deny
          </Button>
        </div>
      )}
    </div>
  );
}

function isToolPart(part: any) {
  return typeof part?.type === "string" && (part.type.startsWith("tool-") || part.type === "dynamic-tool");
}

function getToolName(part: any) {
  if (part?.type === "dynamic-tool") return part.toolName as string | undefined;
  if (typeof part?.type === "string" && part.type.startsWith("tool-")) return part.type.slice(5);
  return undefined;
}

function toolStateLabel(state: string | undefined) {
  if (state === "input-streaming") return "Preparing tool input";
  if (state === "input-available") return "Waiting for approval";
  if (state === "output-available") return "Tool finished";
  if (state === "output-error") return "Tool failed";
  if (state === "output-denied") return "Action denied";
  if (state === "approval-requested") return "Approval requested";
  if (state === "approval-responded") return "Approval recorded";
  return "Tool activity";
}

function formatToolName(name: string) {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatJson(value: unknown) {
  const text = JSON.stringify(redact(value), null, 2);
  return text.length > 2200 ? `${text.slice(0, 2200)}\n...` : text;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const lowered = key.toLowerCase();
      if (
        lowered.includes("token") ||
        lowered.includes("userid") ||
        lowered.includes("chatid") ||
        lowered.includes("raw") ||
        lowered.includes("secret") ||
        lowered.includes("hash")
      ) {
        return [key, "[redacted]"];
      }
      return [key, redact(item)];
    })
  );
}
