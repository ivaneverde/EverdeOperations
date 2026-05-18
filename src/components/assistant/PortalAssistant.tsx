"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { suggestedPromptsForPath } from "@/lib/assistant/suggestedPrompts";
import type { AssistantProvider } from "@/lib/assistant/types";

type ChatMessage = { role: "user" | "assistant"; content: string };

type ProviderOption = {
  id: AssistantProvider;
  label: string;
  model: string;
};

const PROVIDER_STORAGE_KEY = "everde-assistant-provider";

function readStoredProvider(): AssistantProvider | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(PROVIDER_STORAGE_KEY);
  return v === "openai" || v === "anthropic" ? v : null;
}

function storeProvider(provider: AssistantProvider) {
  localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
}

export function PortalAssistant() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [provider, setProvider] = useState<AssistantProvider>("openai");
  const [lastModel, setLastModel] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(
    () => suggestedPromptsForPath(pathname),
    [pathname],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/assistant/config", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          defaultProvider?: AssistantProvider;
          providers?: ProviderOption[];
        };
        if (cancelled) return;
        const list = data.providers ?? [];
        setProviders(list);
        const stored = readStoredProvider();
        const pick =
          stored && list.some((p) => p.id === stored)
            ? stored
            : data.defaultProvider && list.some((p) => p.id === data.defaultProvider)
              ? data.defaultProvider
              : list[0]?.id ?? "openai";
        setProvider(pick);
      } catch {
        /* config optional for render */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onProviderChange = (next: AssistantProvider) => {
    setProvider(next);
    storeProvider(next);
    setMessages([]);
    setError(null);
    setLastModel(null);
  };

  const activeProviderMeta = providers.find((p) => p.id === provider);

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
            provider,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          detail?: string;
          message?: ChatMessage;
          model?: string;
          provider?: AssistantProvider;
        };
        if (!res.ok) {
          throw new Error(
            data.error || data.detail || `Request failed (${res.status})`,
          );
        }
        if (data.message?.content) {
          setMessages((prev) => [...prev, data.message!]);
        }
        if (data.model) setLastModel(data.model);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, pathname, provider],
  );

  const onHeaderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  const showProviderToggle = providers.length > 1;

  return (
    <>
      <div className="flex w-full max-w-xl min-w-0 flex-col items-stretch gap-1.5">
        {showProviderToggle ? (
          <div
            className="flex justify-center gap-1"
            role="group"
            aria-label="AI provider"
          >
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onProviderChange(p.id)}
                className={
                  provider === p.id
                    ? "rounded-full bg-[var(--everde-forest)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                    : "rounded-full border border-zinc-300 bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 hover:border-[var(--everde-forest)]"
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={onHeaderSubmit}
          className="flex min-w-0 items-center gap-2"
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
      </div>

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
            <header className="border-b border-zinc-200 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900">
                    Analyst assistant
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {activeProviderMeta
                      ? `${activeProviderMeta.label} · ${activeProviderMeta.model}`
                      : "Answers use published freight & sales plan data."}
                    {lastModel && activeProviderMeta?.model !== lastModel
                      ? ` (replied with ${lastModel})`
                      : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-800"
                >
                  Close
                </button>
              </div>
              {showProviderToggle ? (
                <div
                  className="mt-2 flex gap-1"
                  role="group"
                  aria-label="AI provider"
                >
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onProviderChange(p.id)}
                      className={
                        provider === p.id
                          ? "rounded-md bg-[var(--everde-forest)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white"
                          : "rounded-md border border-zinc-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 hover:border-[var(--everde-forest)]"
                      }
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              ) : null}
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
                      : "mr-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm whitespace-pre-wrap text-zinc-800"
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
