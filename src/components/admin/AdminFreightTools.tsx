"use client";

import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type PublicClientApplication,
} from "@azure/msal-browser";
import { useCallback, useEffect, useState } from "react";
import {
  getPublicClientApplication,
  isMsalConfigured,
} from "@/lib/msal/clientApp";
import { USER_READ_SCOPES } from "@/lib/msal/userReadScopes";

async function acquireUserReadToken(
  app: PublicClientApplication,
  account: AccountInfo,
): Promise<string> {
  try {
    const res = await app.acquireTokenSilent({
      account,
      scopes: [...USER_READ_SCOPES],
    });
    return res.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      const res = await app.acquireTokenPopup({
        account,
        scopes: [...USER_READ_SCOPES],
      });
      return res.accessToken;
    }
    throw e;
  }
}

export function AdminFreightTools() {
  const [pca, setPca] = useState<PublicClientApplication | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [jsonProbe, setJsonProbe] = useState<string | null>(null);

  useEffect(() => {
    if (!isMsalConfigured()) return;
    let cancelled = false;
    void getPublicClientApplication().then((app) => {
      if (cancelled || !app) return;
      setPca(app);
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

  const domain = "everde.com";
  const allowed =
    account?.username?.toLowerCase().endsWith(`@${domain}`) ?? false;

  const probeJson = useCallback(async () => {
    setJsonProbe(null);
    try {
      const res = await fetch("/api/freight/dashboard-data");
      const src = res.headers.get("x-everde-freight-data-source") ?? "?";
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setJsonProbe(`${res.status} ${j.error ?? res.statusText} (${src})`);
        return;
      }
      const text = (await res.text()).replace(/^\uFEFF/, "").trim();
      let keys = "";
      try {
        const parsed: unknown = JSON.parse(text);
        if (
          parsed !== null &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
        ) {
          keys = Object.keys(parsed as Record<string, unknown>)
            .slice(0, 8)
            .join(", ");
        } else if (Array.isArray(parsed)) {
          keys = `array (length ${parsed.length})`;
        } else {
          keys = typeof parsed;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "parse failed";
        keys = `(invalid JSON: ${msg})`;
      }
      setJsonProbe(`OK — source: ${src}; top-level keys: ${keys}…`);
    } catch (e) {
      setJsonProbe(e instanceof Error ? e.message : "Probe failed");
    }
  }, []);

  const onUpload = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    setMessage(null);
    if (!pca || !account) {
      setMessage("Sign in with Microsoft first.");
      return;
    }
    if (!allowed) {
      setMessage(`Only @${domain} accounts may upload.`);
      return;
    }
    const form = ev.currentTarget;
    const input = form.elements.namedItem("file") as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) {
      setMessage("Choose a file.");
      return;
    }

    setBusy(true);
    try {
      const token = await acquireUserReadToken(pca, account);
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/admin/freight-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const json: unknown = await res.json();
      setMessage(JSON.stringify(json, null, 2));
      if (res.ok) input.value = "";
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!isMsalConfigured()) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Microsoft sign-in is not configured.</p>
        <p className="mt-1 text-amber-800">
          Set <code className="rounded bg-white px-1">NEXT_PUBLIC_MS_ENTRA_CLIENT_ID</code>{" "}
          and tenant in <code className="rounded bg-white px-1">.env.local</code>, or use{" "}
          <code className="rounded bg-white px-1">EVERDE_ADMIN_UPLOAD_KEY</code> with{" "}
          <code className="rounded bg-white px-1">x-everde-admin-key</code> from a REST client.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">
          Freight weekly drop → Azure Blob
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Upload stores the file under{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">incoming/&lt;timestamp&gt;/</code>{" "}
          in your configured container. Processing still runs via{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">
            scripts/freight/claude-handoff/extract_data.py
          </code>{" "}
          on your machine (or VM), then publish{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">dashboard_data.json</code>{" "}
          with <code className="rounded bg-zinc-100 px-1 text-xs">npm run publish:freight-json</code>.
        </p>

        {!account ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-zinc-600">
              Sign in with your Everde Microsoft account to upload.
            </p>
            <button
              type="button"
              disabled={!pca || busy}
              onClick={() => {
                if (!pca) return;
                setBusy(true);
                setMessage(null);
                void pca
                  .loginPopup({ scopes: [...USER_READ_SCOPES] })
                  .then((r) => {
                    const acct = r.account;
                    if (acct) {
                      pca.setActiveAccount(acct);
                      setAccount(acct);
                    }
                  })
                  .catch((e: unknown) => {
                    setMessage(
                      e instanceof Error ? e.message : String(e),
                    );
                  })
                  .finally(() => setBusy(false));
              }}
              className="rounded-md bg-[var(--everde-forest)] px-4 py-2 text-sm font-medium text-white hover:bg-[#143524] disabled:opacity-50"
            >
              Sign in with Microsoft
            </button>
          </div>
        ) : !allowed ? (
          <p className="mt-4 text-sm text-red-700">
            Signed in as {account.username} — uploads require @{domain}.
          </p>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={(e) => void onUpload(e)}>
            <input
              name="file"
              type="file"
              accept=".xlsb,.xlsx,.xlsm,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="block w-full max-w-md text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[var(--everde-forest)] px-4 py-2 text-sm font-medium text-white hover:bg-[#143524] disabled:opacity-50"
            >
              {busy ? "Uploading…" : "Upload to Blob"}
            </button>
          </form>
        )}

        {message ? (
          <pre className="mt-4 max-h-64 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
            {message}
          </pre>
        ) : null}
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">
          Dashboard JSON endpoint
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          <code className="rounded bg-zinc-100 px-1 text-xs">GET /api/freight/dashboard-data</code>{" "}
          — Blob first, then <code className="rounded bg-zinc-100 px-1 text-xs">public/dashboard_data.json</code>.
        </p>
        <button
          type="button"
          onClick={() => void probeJson()}
          className="mt-3 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
        >
          Test fetch now
        </button>
        {jsonProbe ? (
          <p className="mt-2 text-sm text-zinc-700">{jsonProbe}</p>
        ) : null}
      </section>
    </div>
  );
}
