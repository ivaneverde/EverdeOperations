"use client";

import { Fragment, useEffect, useRef } from "react";
import { chatMessageBodyToPlainText } from "@/lib/teamsGraphFormat";

export type ThreadMessage = {
  id: string;
  messageType?: string;
  createdDateTime?: string;
  body?: { contentType?: string; content?: string };
  from?: { user?: { id?: string; displayName?: string } };
};

type TeamsChatThreadProps = {
  chatTitle: string | null;
  selectedChatId: string | null;
  messages: ThreadMessage[];
  messagesLoading: boolean;
  threadError: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onRefresh: () => void;
  sending: boolean;
  myUserId: string | null;
  /** Shown in the header next to auto-refresh copy (seconds). */
  autoRefreshIntervalSeconds: number;
};

export function TeamsChatThread({
  chatTitle,
  selectedChatId,
  messages,
  messagesLoading,
  threadError,
  draft,
  onDraftChange,
  onSend,
  onRefresh,
  sending,
  myUserId,
  autoRefreshIntervalSeconds,
}: TeamsChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Only snap to bottom on new messages if the user was already near the bottom (or just switched chats). */
  const stickBottomRef = useRef(true);

  useEffect(() => {
    stickBottomRef.current = true;
  }, [selectedChatId]);

  const handleMessageListScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickBottomRef.current = dist < 80;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, selectedChatId]);

  if (!selectedChatId) {
    return (
      <div className="flex min-h-[min(280px,40vh)] flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50/80 p-6 text-center text-sm text-zinc-600">
        <p className="font-medium text-zinc-800">Select a chat</p>
        <p className="mt-2 max-w-sm">
          Choose a conversation under <span className="font-medium">Chats</span>,
          or open a <span className="font-medium">Message</span> thread from{" "}
          <span className="font-medium">Contacts</span> when an existing one-to-one
          chat is found.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[min(360px,50vh)] flex-col rounded-lg border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Conversation
          </p>
          <p className="truncate text-sm font-semibold text-zinc-900">
            {chatTitle ?? "Chat"}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            New messages load automatically about every{" "}
            {autoRefreshIntervalSeconds}s while this browser tab is visible.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRefresh()}
          disabled={messagesLoading || sending}
          className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
        >
          Refresh now
        </button>
      </div>

      {threadError && (
        <div className="border-b border-red-100 bg-red-50 px-3 py-2 text-xs text-red-900">
          {threadError}
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleMessageListScroll}
        className="max-h-[min(320px,42vh)] flex-1 space-y-2 overflow-y-auto p-3"
      >
        {messagesLoading && (
          <p className="py-8 text-center text-sm text-zinc-500">Loading messages…</p>
        )}
        {!messagesLoading &&
          messages.map((m) => {
            const fromId = m.from?.user?.id;
            const mine = Boolean(myUserId && fromId && fromId === myUserId);
            const text = chatMessageBodyToPlainText(m.body);
            const isSystem =
              m.messageType &&
              m.messageType !== "message" &&
              m.messageType !== "unknownFutureValue";
            if (isSystem && !text) {
              return (
                <Fragment key={m.id}>
                  <div className="text-center text-[10px] uppercase tracking-wide text-zinc-400">
                    {m.messageType?.replace(/([A-Z])/g, " $1").trim()}
                  </div>
                </Fragment>
              );
            }
            if (!text) {
              return <Fragment key={m.id} />;
            }
            return (
              <Fragment key={m.id}>
                <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={
                      mine
                        ? "max-w-[min(92%,520px)] rounded-lg rounded-br-sm bg-[var(--everde-forest)] px-3 py-2 text-sm text-white"
                        : "max-w-[min(92%,520px)] rounded-lg rounded-bl-sm border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900"
                    }
                  >
                    {!mine && (
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        {m.from?.user?.displayName ?? "Participant"}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{text}</p>
                    {m.createdDateTime && (
                      <p
                        className={
                          mine
                            ? "mt-1 text-[10px] text-white/70"
                            : "mt-1 text-[10px] text-zinc-500"
                        }
                      >
                        {new Date(m.createdDateTime).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </Fragment>
            );
          })}
        {!messagesLoading && messages.length === 0 && !threadError && (
          <p className="py-8 text-center text-sm text-zinc-500">No messages yet.</p>
        )}
      </div>

      <div className="border-t border-zinc-100 p-3">
        <label className="sr-only" htmlFor="teams-chat-draft">
          Message
        </label>
        <textarea
          id="teams-chat-draft"
          rows={3}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Type a message…"
          className="w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[var(--everde-forest)] focus:outline-none focus:ring-1 focus:ring-[var(--everde-forest)]"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => onSend()}
            disabled={sending || !draft.trim()}
            className="rounded-md bg-[var(--everde-forest)] px-4 py-2 text-sm font-medium text-white hover:bg-[#143524] disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
