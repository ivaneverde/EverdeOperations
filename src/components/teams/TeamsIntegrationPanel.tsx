"use client";

import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type PublicClientApplication,
} from "@azure/msal-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getPublicClientApplication,
  isMsalConfigured,
} from "@/lib/msal/clientApp";
import { TeamsChatThread, type ThreadMessage } from "@/components/teams/TeamsChatThread";

const GRAPH = "https://graph.microsoft.com/v1.0";

/** Background message refresh while a chat is open (Graph throttling: keep modest). */
const MESSAGE_POLL_MS = 8000;

/** Delegated Graph scopes (SPA). Grant admin consent for Chat.ReadWrite and Chat.Create in Entra. */
const SCOPES = [
  "User.Read",
  "Chat.ReadWrite",
  "Chat.Create",
  "People.Read",
] as const;

async function acquireTokenSilentOrPopup(
  app: PublicClientApplication,
  acct: AccountInfo,
): Promise<string> {
  try {
    return (
      await app.acquireTokenSilent({
        account: acct,
        scopes: [...SCOPES],
      })
    ).accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      return (
        await app.acquireTokenPopup({
          account: acct,
          scopes: [...SCOPES],
        })
      ).accessToken;
    }
    throw e;
  }
}

type GraphMember = {
  "@odata.type"?: string;
  userId?: string;
  email?: string;
  displayName?: string;
};

type GraphChatRow = {
  id: string;
  topic?: string | null;
  chatType?: string;
  members?: GraphMember[];
};

type GraphPerson = Record<string, unknown>;

function personLine(p: GraphPerson): string {
  const emails = p.scoredEmailAddresses as { address?: string }[] | undefined;
  const first = emails?.find((e) => e.address)?.address;
  return (
    first ??
    (p.userPrincipalName as string | undefined) ??
    (p.mail as string | undefined) ??
    ""
  );
}

function memberLabel(m: GraphMember): string {
  const name = m.displayName?.trim();
  const mail = m.email?.trim();
  if (name && mail && name.toLowerCase() !== mail.toLowerCase()) return name;
  if (name) return name;
  if (mail) return mail;
  if (m.userId) return `User ${m.userId.slice(0, 8)}…`;
  return "Participant";
}

/** Members other than the signed-in user (for titles). */
function otherMembers(c: GraphChatRow, myUserId: string | null): GraphMember[] {
  const members = c.members ?? [];
  if (!myUserId) return members;
  return members.filter((m) => m.userId && m.userId !== myUserId);
}

function chatListPrimaryLabel(c: GraphChatRow, myUserId: string | null): string {
  const topic = c.topic?.trim();
  if (topic) return topic;
  if (c.chatType === "oneOnOne") {
    if (!myUserId) return "Direct message";
    const others = otherMembers(c, myUserId);
    const labels = others.map(memberLabel).filter(Boolean);
    if (labels.length > 0) return labels.join(", ");
    return "Direct message";
  }
  if (c.chatType === "meeting") return "Meeting";
  if (c.chatType === "group") return "Group chat";
  if (c.chatType)
    return c.chatType.charAt(0).toUpperCase() + c.chatType.slice(1);
  return "Chat";
}

function chatListCaption(c: GraphChatRow, myUserId: string | null): string {
  const n = c.members?.length ?? 0;
  if (c.chatType === "oneOnOne") {
    if (!myUserId) return "Loading…";
    const others = otherMembers(c, myUserId);
    const emails = others.map((m) => m.email?.trim()).filter(Boolean) as string[];
    if (emails.length > 0) return emails.join(" · ");
    return "Direct message";
  }
  if (c.chatType === "meeting") {
    return n > 0 ? `Meeting · ${n} people` : "Meeting";
  }
  if (c.chatType === "group") {
    return n > 0 ? `Group · ${n} people` : "Group chat";
  }
  return n > 0 ? `${n} people` : "";
}

function findOneOnOneChatIdForEmail(
  rows: GraphChatRow[],
  myUserId: string,
  targetEmail: string,
): string | null {
  const want = targetEmail.trim().toLowerCase();
  for (const c of rows) {
    if (c.chatType !== "oneOnOne") continue;
    const members = c.members ?? [];
    for (const m of members) {
      if (m.userId === myUserId) continue;
      const em = (m.email ?? "").trim().toLowerCase();
      if (em && em === want) return c.id;
    }
  }
  return null;
}

function odataUsersBindUrl(userIdentifier: string): string {
  const escaped = userIdentifier.replace(/'/g, "''");
  return `https://graph.microsoft.com/v1.0/users('${escaped}')`;
}

export function TeamsIntegrationPanel() {
  const [pca, setPca] = useState<PublicClientApplication | null>(null);
  const [msalReady, setMsalReady] = useState(false);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [tab, setTab] = useState<"chats" | "contacts">("chats");
  const [chats, setChats] = useState<GraphChatRow[]>([]);
  const [people, setPeople] = useState<GraphPerson[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chatsLoading, setChatsLoading] = useState(false);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [contactNotice, setContactNotice] = useState<string | null>(null);
  const [creatingForEmail, setCreatingForEmail] = useState<string | null>(null);

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const loadMessagesReq = useRef(0);

  useEffect(() => {
    if (!isMsalConfigured()) return;
    let cancelled = false;
    void getPublicClientApplication().then((app) => {
      if (cancelled || !app) return;
      setPca(app);
      setMsalReady(true);
      const active = app.getActiveAccount() ?? app.getAllAccounts()[0] ?? null;
      if (active) {
        app.setActiveAccount(active);
        setAccount(active);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Chats (with members for contact matching) + signed-in user id */
  useEffect(() => {
    if (!msalReady || !pca || !account) return;
    const app = pca;
    const acct = account;
    let cancelled = false;

    async function run() {
      setChatsLoading(true);
      setError(null);
      try {
        const token = await acquireTokenSilentOrPopup(app, acct);
        if (cancelled) return;
        const headers = { Authorization: `Bearer ${token}` };

        const meRes = await fetch(`${GRAPH}/me`, { headers });
        if (!meRes.ok) {
          const t = await meRes.text();
          throw new Error(`Profile ${meRes.status}: ${t.slice(0, 200)}`);
        }
        const me = (await meRes.json()) as { id?: string };
        if (!cancelled && me.id) setMyUserId(me.id);

        const chatRes = await fetch(
          `${GRAPH}/me/chats?$top=50&$expand=members`,
          { headers },
        );
        if (!chatRes.ok) {
          const t = await chatRes.text();
          throw new Error(`Chats ${chatRes.status}: ${t.slice(0, 240)}`);
        }
        const chatJson = (await chatRes.json()) as { value?: GraphChatRow[] };
        if (!cancelled) setChats(chatJson.value ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Request failed");
        }
      } finally {
        if (!cancelled) setChatsLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [msalReady, pca, account]);

  /** People list when Contacts tab is active */
  useEffect(() => {
    if (!msalReady || !pca || !account || tab !== "contacts") return;
    const app = pca;
    const acct = account;
    let cancelled = false;

    async function run() {
      setPeopleLoading(true);
      setError(null);
      try {
        const token = await acquireTokenSilentOrPopup(app, acct);
        if (cancelled) return;
        const headers = { Authorization: `Bearer ${token}` };
        const res = await fetch(`${GRAPH}/me/people?$top=40`, { headers });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`People ${res.status}: ${t.slice(0, 240)}`);
        }
        const json = (await res.json()) as { value?: GraphPerson[] };
        if (!cancelled) setPeople(json.value ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Request failed");
        }
      } finally {
        if (!cancelled) setPeopleLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [msalReady, pca, account, tab]);

  const loadMessages = useCallback(
    async (chatId: string, opts?: { silent?: boolean }) => {
      if (!pca || !account) return;
      const silent = opts?.silent ?? false;
      const seq = ++loadMessagesReq.current;
      if (!silent) {
        setMessagesLoading(true);
        setThreadError(null);
      }
      try {
        const token = await acquireTokenSilentOrPopup(pca, account);
        const res = await fetch(
          `${GRAPH}/chats/${encodeURIComponent(chatId)}/messages?$top=50`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          const t = await res.text();
          throw new Error(
            `Messages ${res.status}: ${t.slice(0, 280)} — confirm Chat.ReadWrite is granted (admin consent) for this app.`,
          );
        }
        const json = (await res.json()) as { value?: ThreadMessage[] };
        const rows = json.value ?? [];
        const chronological = [...rows].reverse();
        if (seq === loadMessagesReq.current) setMessages(chronological);
      } catch (err) {
        if (seq === loadMessagesReq.current) {
          if (!silent) {
            setThreadError(
              err instanceof Error ? err.message : "Failed to load messages",
            );
            setMessages([]);
          }
        }
      } finally {
        if (seq === loadMessagesReq.current && !silent) {
          setMessagesLoading(false);
        }
      }
    },
    [pca, account],
  );

  /** Poll for new replies while a conversation is selected and the browser tab is visible. */
  useEffect(() => {
    if (!selectedChatId || !pca || !account) return;

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void loadMessages(selectedChatId, { silent: true });
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };

    const intervalId = setInterval(poll, MESSAGE_POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [selectedChatId, pca, account, loadMessages]);

  const sendMessage = useCallback(async () => {
    if (!selectedChatId || !draft.trim() || !pca || !account) return;
    setSending(true);
    setThreadError(null);
    try {
      const token = await acquireTokenSilentOrPopup(pca, account);
      const res = await fetch(
        `${GRAPH}/chats/${encodeURIComponent(selectedChatId)}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            body: { content: draft.trim() },
          }),
        },
      );
      if (!res.ok) {
        const t = await res.text();
        throw new Error(
          `Send failed ${res.status}: ${t.slice(0, 280)} — confirm Chat.ReadWrite is granted.`,
        );
      }
      setDraft("");
      await loadMessages(selectedChatId, { silent: true });
    } catch (err) {
      setThreadError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }, [selectedChatId, draft, pca, account, loadMessages]);

  if (!isMsalConfigured()) {
    return (
      <div className="space-y-3 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">
          Microsoft sign-in is not configured yet
        </p>
        <p>
          Create an{" "}
          <span className="font-medium">Entra ID app registration</span>{" "}
          (single-page application), then add to{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">.env.local</code>:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-zinc-600">
          <li>
            <code className="rounded bg-zinc-100 px-1 text-xs">
              NEXT_PUBLIC_MS_ENTRA_CLIENT_ID
            </code>{" "}
            — Application (client) ID
          </li>
          <li>
            <code className="rounded bg-zinc-100 px-1 text-xs">
              NEXT_PUBLIC_MS_ENTRA_TENANT_ID
            </code>{" "}
            — Directory (tenant) ID, or{" "}
            <code className="rounded bg-zinc-100 px-1 text-xs">
              organizations
            </code>{" "}
            for multi-work accounts
          </li>
        </ul>
        <details className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
          <summary className="cursor-pointer font-semibold text-zinc-800">
            SPA redirect &amp; API permissions
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Authentication → Platform: Single-page application; redirect URIs:
              add <code className="rounded bg-white px-0.5">/auth/msal-bridge</code>{" "}
              on this origin (e.g.{" "}
              <code className="rounded bg-white px-0.5">
                http://localhost:3000/auth/msal-bridge
              </code>
              ) for popup sign-in, plus any other origins you deploy to.
            </li>
            <li>
              API permissions (Microsoft Graph, delegated):{" "}
              <code className="rounded bg-white px-0.5">User.Read</code>,{" "}
              <code className="rounded bg-white px-0.5">Chat.ReadWrite</code>,{" "}
              <code className="rounded bg-white px-0.5">Chat.Create</code>,{" "}
              <code className="rounded bg-white px-0.5">People.Read</code> — grant
              admin consent for the tenant after adding scopes.
            </li>
            <li>
              Chats use <code className="rounded bg-white px-0.5">/me/chats</code>{" "}
              and{" "}
              <code className="rounded bg-white px-0.5">/chats/{`{id}`}/messages</code>
              ; contacts use{" "}
              <code className="rounded bg-white px-0.5">/me/people</code>.
            </li>
          </ul>
        </details>
      </div>
    );
  }

  async function handleSignIn() {
    const app = pca ?? (await getPublicClientApplication());
    if (!app) return;
    setError(null);
    setChatsLoading(true);
    try {
      const result = await app.loginPopup({ scopes: [...SCOPES] });
      app.setActiveAccount(result.account);
      setAccount(result.account);
      if (!pca) setPca(app);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setChatsLoading(false);
    }
  }

  async function handleSignOut() {
    if (!pca || !account) return;
    setError(null);
    try {
      await pca.logoutPopup({ account });
    } finally {
      setAccount(null);
      setChats([]);
      setPeople([]);
      setMyUserId(null);
      setSelectedChatId(null);
      setChatTitle(null);
      setMessages([]);
      setDraft("");
      setThreadError(null);
      setContactNotice(null);
      setCreatingForEmail(null);
    }
  }

  function selectChat(c: GraphChatRow) {
    setContactNotice(null);
    setSelectedChatId(c.id);
    setChatTitle(chatListPrimaryLabel(c, myUserId));
    setThreadError(null);
    void loadMessages(c.id);
  }

  async function openContactChat(name: string, email: string) {
    if (!pca || !account) return;
    setContactNotice(null);
    setThreadError(null);
    if (!myUserId) {
      setContactNotice("Still loading your profile; try again in a moment.");
      return;
    }
    const trimmed = email.trim();
    const cid = findOneOnOneChatIdForEmail(chats, myUserId, trimmed);
    if (cid) {
      setSelectedChatId(cid);
      setChatTitle(name);
      setTab("chats");
      void loadMessages(cid);
      return;
    }
    setCreatingForEmail(trimmed);
    try {
      const token = await acquireTokenSilentOrPopup(pca, account);
      const res = await fetch(`${GRAPH}/chats`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chatType: "oneOnOne",
          members: [
            {
              "@odata.type": "#microsoft.graph.aadUserConversationMember",
              roles: ["owner"],
              "user@odata.bind": odataUsersBindUrl(myUserId),
            },
            {
              "@odata.type": "#microsoft.graph.aadUserConversationMember",
              roles: ["owner"],
              "user@odata.bind": odataUsersBindUrl(trimmed),
            },
          ],
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(
          `Could not start chat (${res.status}): ${t.slice(0, 260)} — ensure Chat.Create (and Chat.ReadWrite) are granted, then sign out and sign in again.`,
        );
      }
      const created = (await res.json()) as {
        id: string;
        chatType?: string;
        topic?: string | null;
      };
      const row: GraphChatRow = {
        id: created.id,
        chatType: created.chatType ?? "oneOnOne",
        topic: created.topic ?? null,
        members: [
          { userId: myUserId },
          { email: trimmed.toLowerCase() },
        ],
      };
      setChats((prev) => [row, ...prev.filter((c) => c.id !== created.id)]);
      setSelectedChatId(created.id);
      setChatTitle(name);
      setTab("chats");
      void loadMessages(created.id);
    } catch (err) {
      setContactNotice(
        err instanceof Error ? err.message : "Could not create chat.",
      );
    } finally {
      setCreatingForEmail(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-zinc-700">
        Sign in with your Everde Microsoft account to read and send{" "}
        <span className="font-medium">Teams chat messages</span> in the portal
        (Microsoft Graph{" "}
        <code className="rounded bg-zinc-100 px-1 text-xs">
          /chats/{`{id}`}/messages
        </code>
        ). Pick a chat on the left, type below, and press Send. From{" "}
        <span className="font-medium">Contacts</span>, <span className="font-medium">Message</span>{" "}
        opens an existing one-to-one or creates a new Teams chat when allowed.
        Nothing is sent to Claude; tokens stay in the browser session. After
        adding permissions in Entra, use <span className="font-medium">Grant admin consent</span>{" "}
        for <span className="font-medium">Chat.ReadWrite</span> and{" "}
        <span className="font-medium">Chat.Create</span>, then sign out and back
        in once so your token includes them.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {!account ? (
          <button
            type="button"
            onClick={() => void handleSignIn()}
            disabled={chatsLoading || !msalReady}
            className="rounded-md bg-[var(--everde-forest)] px-4 py-2 text-sm font-medium text-white hover:bg-[#143524] disabled:opacity-50"
          >
            {chatsLoading ? "Working…" : "Sign in with Microsoft"}
          </button>
        ) : (
          <>
            <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800">
              <span className="text-zinc-500">Signed in as </span>
              <span className="font-medium">{account.name ?? account.username}</span>
              {account.username ? (
                <span className="text-zinc-500"> ({account.username})</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
            >
              Sign out
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </div>
      )}

      {contactNotice && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {contactNotice}
        </div>
      )}

      {account && (
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,300px)_1fr]">
          <div className="space-y-3">
            <div className="inline-flex rounded-md border border-zinc-200 bg-zinc-100 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setTab("chats")}
                className={
                  tab === "chats"
                    ? "rounded px-3 py-1.5 bg-white text-zinc-900 shadow-sm"
                    : "rounded px-3 py-1.5 text-zinc-600 hover:text-zinc-900"
                }
              >
                Chats
              </button>
              <button
                type="button"
                onClick={() => setTab("contacts")}
                className={
                  tab === "contacts"
                    ? "rounded px-3 py-1.5 bg-white text-zinc-900 shadow-sm"
                    : "rounded px-3 py-1.5 text-zinc-600 hover:text-zinc-900"
                }
              >
                Contacts (people)
              </button>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                {tab === "chats" ? "Your chats" : "Related people"}
              </div>
              <div className="max-h-[min(420px,50vh)] overflow-auto p-1">
                {((tab === "chats" && chatsLoading) ||
                  (tab === "contacts" && peopleLoading)) && (
                  <p className="px-2 py-6 text-center text-sm text-zinc-500">
                    Loading…
                  </p>
                )}
                {!chatsLoading && tab === "chats" && chats.length === 0 && (
                  <p className="px-2 py-6 text-center text-sm text-zinc-500">
                    No chats returned (or none yet).
                  </p>
                )}
                {!peopleLoading && tab === "contacts" && people.length === 0 && (
                  <p className="px-2 py-6 text-center text-sm text-zinc-500">
                    No people returned.
                  </p>
                )}
                {!chatsLoading && tab === "chats" && chats.length > 0 && (
                  <ul className="divide-y divide-zinc-100">
                    {chats.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => selectChat(c)}
                          className={
                            selectedChatId === c.id
                              ? "w-full rounded-md bg-amber-50 px-2 py-2 text-left text-sm ring-1 ring-amber-200/80"
                              : "w-full rounded-md px-2 py-2 text-left text-sm hover:bg-zinc-50"
                          }
                        >
                          <span className="font-medium text-zinc-900">
                            {chatListPrimaryLabel(c, myUserId)}
                          </span>
                          <span className="mt-0.5 block text-xs text-zinc-500">
                            {chatListCaption(c, myUserId)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!peopleLoading && tab === "contacts" && people.length > 0 && (
                  <ul className="divide-y divide-zinc-100">
                    {people.map((p, i) => {
                      const id = (p.id as string) ?? `p-${i}`;
                      const name =
                        (p.displayName as string) ||
                        (p.givenName as string) ||
                        "—";
                      const email = personLine(p);
                      const title = (p.jobTitle as string) || "";
                      return (
                        <li
                          key={id}
                          className="flex flex-wrap items-start justify-between gap-2 px-2 py-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-zinc-900">{name}</div>
                            {email ? (
                              <div className="text-xs text-zinc-600">{email}</div>
                            ) : null}
                            {title ? (
                              <div className="text-xs text-zinc-500">{title}</div>
                            ) : null}
                          </div>
                          {email ? (
                            <button
                              type="button"
                              onClick={() => void openContactChat(name, email)}
                              disabled={creatingForEmail === email.trim()}
                              className="shrink-0 rounded-md border border-[var(--everde-forest)] bg-white px-2.5 py-1.5 text-center text-xs font-medium text-[var(--everde-forest)] hover:bg-[var(--everde-canvas)] disabled:opacity-50"
                            >
                              {creatingForEmail === email.trim()
                                ? "Creating…"
                                : "Message"}
                            </button>
                          ) : (
                            <span className="shrink-0 self-center text-xs text-zinc-400">
                              No work email
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <TeamsChatThread
            chatTitle={chatTitle}
            selectedChatId={selectedChatId}
            messages={messages}
            messagesLoading={messagesLoading}
            threadError={threadError}
            draft={draft}
            onDraftChange={setDraft}
            onSend={() => void sendMessage()}
            onRefresh={() => {
              if (selectedChatId) void loadMessages(selectedChatId);
            }}
            sending={sending}
            myUserId={myUserId}
            autoRefreshIntervalSeconds={MESSAGE_POLL_MS / 1000}
          />
        </div>
      )}
    </div>
  );
}
