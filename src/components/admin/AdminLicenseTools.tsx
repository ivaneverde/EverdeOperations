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
import type { PreeminentLicenseStatus } from "@/lib/license/preeminentLicense";

type StatusResponse = {
  ok: boolean;
  enforce: boolean;
  allowed: boolean;
  status: PreeminentLicenseStatus | null;
};

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

export function AdminLicenseTools() {
  const [pca, setPca] = useState<PublicClientApplication | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [period, setPeriod] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!isMsalConfigured()) return;
    let cancelled = false;
    void getPublicClientApplication().then((app) => {
      if (cancelled || !app) return;
      setPca(app);
      const active = app.getActiveAccount() ?? app.getAllAccounts()[0] ?? null;
      setAccount(active);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/license/status", { cache: "no-store" });
    const data = (await res.json()) as StatusResponse;
    setStatus(data);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function upload() {
    if (!file) {
      setMsg("Choose a receipt file first.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (period.trim()) form.set("period", period.trim().toUpperCase());

      const headers: HeadersInit = {};
      if (pca && account) {
        const token = await acquireUserReadToken(pca, account);
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch("/api/admin/license-receipt", {
        method: "POST",
        headers,
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Upload failed");
      } else {
        setMsg(`Recorded paid for ${data.period}. Services re-enabled.`);
        setFile(null);
        await refresh();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const s = status?.status;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">
        Preeminent license
      </h2>
      <p className="mt-1 text-sm text-zinc-600">
        Pay around the 5th is fine. Prefer attaching the receipt in Cursor chat.
        Services only go offline if a month ended with no proof on file.
      </p>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Period
          </dt>
          <dd className="font-medium text-zinc-900">{s?.period ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Paid
          </dt>
          <dd className="font-medium text-zinc-900">
            {s ? (s.paid ? "Yes" : "No") : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Services
          </dt>
          <dd className="font-medium text-zinc-900">
            {s ? (s.services_enabled ? "Enabled" : "Disabled") : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Enforce in prod
          </dt>
          <dd className="font-medium text-zinc-900">
            {status?.enforce ? "On" : "Off (set PREEMINENT_LICENSE_ENFORCE=1)"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-zinc-500">
            Proof
          </dt>
          <dd className="text-zinc-800">
            {s?.proof
              ? `${s.proof.source}${s.proof.name ? `: ${s.proof.name}` : ""}${
                  s.proof.subject ? `: ${s.proof.subject}` : ""
                }`
              : "None on file"}
          </dd>
        </div>
      </dl>

      <div className="mt-5 space-y-3 border-t border-zinc-100 pt-4">
        <label className="block text-sm font-medium text-zinc-800">
          Upload receipt
          <input
            type="file"
            className="mt-1 block w-full text-sm"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="block text-sm font-medium text-zinc-800">
          Period (MMMYYYY; filename must include Preeminent + same period)
          <input
            type="text"
            placeholder="NOV2026"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={busy || !file}
          onClick={() => void upload()}
          className="rounded-md bg-[var(--everde-forest)] px-4 py-2 text-sm font-medium text-white hover:bg-[#143524] disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Save proof & enable"}
        </button>
        {msg ? <p className="text-sm text-zinc-700">{msg}</p> : null}
      </div>
    </section>
  );
}
