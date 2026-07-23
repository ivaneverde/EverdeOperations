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

function isNarrowViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 639px)").matches;
}

/** Keep the drawer inside the visible area when iOS Safari keyboard is open. */
function useVisualViewportBox(active: boolean) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    if (!active || typeof window === "undefined") {
      setBox(null);
      return;
    }

    const vv = window.visualViewport;
    if (!vv) {
      setBox(null);
      return;
    }

    const sync = () => {
      setBox({
        top: vv.offsetTop,
        height: vv.height,
      });
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, [active]);

  return box;
}

export function PortalAssistant() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [provider, setProvider] = useState<AssistantProvider>("anthropic");
  const [lastModel, setLastModel] = useState<string | null>(null);
  /** Mobile: suggestions start collapsed so the composer stays reachable. */
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const drawerInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const openFromHeaderFocus = useRef(false);
  const viewportBox = useVisualViewportBox(open);

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
            : data.defaultProvider &&
                list.some((p) => p.id === data.defaultProvider)
              ? data.defaultProvider
              : (list[0]?.id ?? "openai");
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

  useEffect(() => {
    if (!open) return;
    // Desktop: suggestions expanded by default. Mobile: collapsed.
    setSuggestionsOpen(!isNarrowViewport());
    if (isNarrowViewport() || openFromHeaderFocus.current) {
      // Let the drawer paint, then focus composer (moves typing into drawer on phone).
      const t = window.setTimeout(() => {
        drawerInputRef.current?.focus({ preventScroll: true });
        openFromHeaderFocus.current = false;
      }, 50);
      return () => window.clearTimeout(t);
    }
  }, [open]);

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
      setSuggestionsOpen(false);

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
  const showEmptySuggestions = messages.length === 0 && suggestions.length > 0;
  /** Hide suggestion UI while typing on narrow screens so it never covers the field. */
  const hideSuggestionsForTyping =
    composerFocused || draft.trim().length > 0;
  /** Compact chrome when typing on phone so more room above the keyboard. */
  const compactMobileHeader = composerFocused;

  const overlayStyle =
    viewportBox != null
      ? {
          top: viewportBox.top,
          height: viewportBox.height,
          bottom: "auto" as const,
        }
      : undefined;

  const onComposerFocus = () => {
    setComposerFocused(true);
    // After keyboard animates, re-sync viewport and keep composer visible.
    window.setTimeout(() => {
      composerRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    }, 300);
  };

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
            onFocus={() => {
              openFromHeaderFocus.current = true;
              setOpen(true);
            }}
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
          style={overlayStyle}
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <aside
            className="flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl"
            style={
              viewportBox != null ? { height: viewportBox.height } : undefined
            }
            role="dialog"
            aria-label="Analyst assistant"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <header
              className={
                compactMobileHeader
                  ? "shrink-0 border-b border-zinc-200 px-4 py-2 sm:py-3"
                  : "shrink-0 border-b border-zinc-200 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-zinc-900">
                    Analyst assistant
                  </h2>
                  <p
                    className={
                      compactMobileHeader
                        ? "hidden text-xs text-zinc-500 sm:block"
                        : "text-xs text-zinc-500"
                    }
                  >
                    {activeProviderMeta
                      ? `${activeProviderMeta.label} · ${activeProviderMeta.model}`
                      : "Portal compendium: freight, sales plan, production & demand."}
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
                  className={
                    compactMobileHeader
                      ? "mt-2 hidden gap-1 sm:flex"
                      : "mt-2 flex gap-1"
                  }
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
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3"
            >
              {showEmptySuggestions && !hideSuggestionsForTyping ? (
                <div className="space-y-2">
                  {/* Mobile: collapsed disclosure + chip row. Desktop: full list. */}
                  <div className="sm:hidden">
                    <button
                      type="button"
                      onClick={() => setSuggestionsOpen((v) => !v)}
                      className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs font-medium text-zinc-700"
                      aria-expanded={suggestionsOpen}
                    >
                      Suggested questions
                      <span className="text-zinc-400" aria-hidden>
                        {suggestionsOpen ? "−" : "+"}
                      </span>
                    </button>
                    {suggestionsOpen ? (
                      <ul className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {suggestions.map((q) => (
                          <li key={q} className="shrink-0">
                            <button
                              type="button"
                              onClick={() => void send(q)}
                              className="max-w-[16rem] truncate rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-left text-xs text-zinc-800 hover:border-[var(--everde-forest)]"
                            >
                              {q}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <div className="hidden space-y-2 sm:block">
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
                </div>
              ) : null}

              {showEmptySuggestions && hideSuggestionsForTyping ? (
                <p className="text-xs text-zinc-400 sm:hidden">
                  Type your question below — or{" "}
                  <button
                    type="button"
                    className="font-medium text-[var(--everde-forest)] underline"
                    onClick={() => {
                      setComposerFocused(false);
                      setSuggestionsOpen(true);
                    }}
                  >
                    show suggestions
                  </button>
                  .
                </p>
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
              ref={composerRef}
              className="shrink-0 border-t border-zinc-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              onSubmit={(e) => {
                e.preventDefault();
                void send(draft);
              }}
            >
              <div className="flex gap-2">
                <input
                  ref={drawerInputRef}
                  type="text"
                  name="analyst-question"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onFocus={onComposerFocus}
                  onBlur={() => setComposerFocused(false)}
                  placeholder="Ask a question…"
                  enterKeyHint="send"
                  autoComplete="off"
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  spellCheck
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2.5 text-base sm:py-2 sm:text-sm focus:border-[var(--everde-forest)] focus:outline-none focus:ring-1 focus:ring-[var(--everde-forest)]"
                  aria-label="Ask the analyst"
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
