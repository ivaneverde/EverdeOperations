"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { suggestedPromptsForPath } from "@/lib/assistant/suggestedPrompts";

type ChatMessage = { role: "user" | "assistant"; content: string };

export function PortalAssistant() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(
    () => suggestedPromptsForPath(pathname),
    [pathname],
  );

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, open, loading]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setError(null);
      const nextMessages: ChatMessage[] = [
        ...messages,
        { role: "user", content: trimmed },
      ];
      setMessages(nextMessages);
      setDraft("");
      setLoading(true);
      setOpen(true);

      try {
        const res = await fetch("/api/assistant/chat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages,
            pathname,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          detail?: string;
          message?: ChatMessage;
        };
        if (!res.ok) {
          throw new Error(
            data.error || data.detail || `Request failed (${res.status})`,
          );
        }
        if (data.message?.content) {
          setMessages((prev) => [...prev, data.message!]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, pathname],
  );

  const onHeaderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  return (
    <>
      <form
        onSubmit={onHeaderSubmit}
        className="flex w-full max-w-xl min-w-0 items-center gap-2"
      >
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Ask the analyst about this page…"
          className="min-w-0 flex-1 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-[var(--everde-forest)] focus:outline-none focus:ring-1 focus:ring-[var(--everde-forest)]"
          aria-label="Ask the analyst"
        />
        <button
          type="submit"
          disabled={loading || !draft.trim()}
          className="shrink-0 rounded-full bg-[var(--everde-forest)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:opacity-90 disabled:opacity-50"
        >
          Ask
        </button>
      </form>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/25"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <aside
            className="flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl"
            role="dialog"
            aria-label="Analyst assistant"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">
                  Analyst assistant
                </h2>
                <p className="text-xs text-zinc-500">
                  Answers use published freight &amp; sales plan data.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-800"
              >
                Close
              </button>
            </header>

            <div
              ref={listRef}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
            >
              {messages.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-500">
                    Try a question for this section:
                  </p>
                  <ul className="space-y-1.5">
                    {suggestions.map((q) => (
                      <li key={q}>
                        <button
                          type="button"
                          onClick={() => void send(q)}
                          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs text-zinc-800 hover:border-[var(--everde-forest)] hover:bg-white"
                        >
                          {q}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={
                    m.role === "user"
                      ? "ml-6 rounded-lg bg-[var(--everde-forest)]/10 px-3 py-2 text-sm text-zinc-900"
                      : "mr-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 whitespace-pre-wrap"
                  }
                >
                  {m.content}
                </div>
              ))}

              {loading ? (
                <p className="text-xs text-zinc-500">Thinking…</p>
              ) : null}
              {error ? (
                <p className="text-xs text-red-600" role="alert">
                  {error}
                </p>
              ) : null}
            </div>

            <form
              className="border-t border-zinc-200 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
              }}
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Follow up…"
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-[var(--everde-forest)] focus:outline-none focus:ring-1 focus:ring-[var(--everde-forest)]"
                />
                <button
                  type="submit"
                  disabled={loading || !draft.trim()}
                  className="shrink-0 rounded-lg bg-[var(--everde-forest)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
