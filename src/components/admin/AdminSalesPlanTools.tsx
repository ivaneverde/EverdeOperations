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

export function AdminSalesPlanTools() {
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
      const res = await fetch("/api/sales-plan/dashboard-data");
      const src = res.headers.get("x-everde-sales-plan-data-source") ?? "?";
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
        }
      } catch (e) {
        keys = e instanceof Error ? e.message : "parse failed";
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
    const invInput = form.elements.namedItem("inv") as HTMLInputElement;
    const ytdInput = form.elements.namedItem("ytd") as HTMLInputElement;
    const inv = invInput?.files?.[0];
    const ytd = ytdInput?.files?.[0];
    if (!inv && !ytd) {
      setMessage("Choose Inventory Transform and/or YTD Sales file.");
      return;
    }

    setBusy(true);
    try {
      const token = await acquireUserReadToken(pca, account);
      const body = new FormData();
      if (inv) body.set("inv", inv);
      if (ytd) body.set("ytd", ytd);
      const res = await fetch("/api/admin/sales-plan-upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const json: unknown = await res.json();
      setMessage(JSON.stringify(json, null, 2));
      if (res.ok) {
        if (invInput) invInput.value = "";
        if (ytdInput) ytdInput.value = "";
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!isMsalConfigured()) {
    return (
      <p className="text-sm text-zinc-600">
        Microsoft sign-in required for uploads (or configure{" "}
        <code className="rounded bg-zinc-100 px-1">EVERDE_ADMIN_UPLOAD_KEY</code>
        ).
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">
          Sales plan weekly drop → Azure Blob
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Upload Inventory Transform and/or 2026 Sales by Item. Files land under{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">
            sales-plan/incoming/&lt;timestamp&gt;/inv|ytd/
          </code>
          . Run{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">
            extract_sales_plan.py
          </code>{" "}
          on a VPN machine, then{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">
            npm run publish:sales-plan-json
          </code>
          .
        </p>

        {!account ? (
          <button
            type="button"
            disabled={!pca || busy}
            className="mt-4 rounded-md bg-[var(--everde-forest)] px-4 py-2 text-sm font-medium text-white hover:bg-[#143524] disabled:opacity-50"
            onClick={() => {
              if (!pca) return;
              setBusy(true);
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
                  setMessage(e instanceof Error ? e.message : String(e));
                })
                .finally(() => setBusy(false));
            }}
          >
            Sign in with Microsoft
          </button>
        ) : !allowed ? (
          <p className="mt-4 text-sm text-red-700">
            Signed in as {account.username} — uploads require @{domain}.
          </p>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={(e) => void onUpload(e)}>
            <label className="block text-sm text-zinc-700">
              Inventory Transform (.xlsx)
              <input
                name="inv"
                type="file"
                accept=".xlsx,.xlsm"
                className="mt-1 block w-full max-w-md text-sm"
              />
            </label>
            <label className="block text-sm text-zinc-700">
              2026 Sales by Item YTD (.xlsx)
              <input
                name="ytd"
                type="file"
                accept=".xlsx,.xlsm"
                className="mt-1 block w-full max-w-md text-sm"
              />
            </label>
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
          Sales plan JSON endpoint
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          <code className="rounded bg-zinc-100 px-1 text-xs">
            GET /api/sales-plan/dashboard-data
          </code>{" "}
          — Blob{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs">
            sales-plan/latest/sales_plan_data.json
          </code>
          , then <code className="rounded bg-zinc-100 px-1 text-xs">public/sales_plan_data.json</code>.
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
