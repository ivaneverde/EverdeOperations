"use client";

import {
  InteractionRequiredAuthError,
  type AccountInfo,
  type PublicClientApplication,
} from "@azure/msal-browser";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  getPublicClientApplication,
  isMsalConfigured,
} from "@/lib/msal/clientApp";
import { USER_READ_SCOPES } from "@/lib/msal/userReadScopes";

type MsalTokens = {
  accessToken: string;
  idToken?: string;
};

async function acquireUserReadTokens(
  app: PublicClientApplication,
  account: AccountInfo,
): Promise<MsalTokens> {
  try {
    const res = await app.acquireTokenSilent({
      account,
      scopes: [...USER_READ_SCOPES],
    });
    return { accessToken: res.accessToken, idToken: res.idToken };
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      const res = await app.acquireTokenPopup({
        account,
        scopes: [...USER_READ_SCOPES],
      });
      return { accessToken: res.accessToken, idToken: res.idToken };
    }
    throw e;
  }
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams?.get("returnUrl") || "/";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pca, setPca] = useState<PublicClientApplication | null>(null);

  useEffect(() => {
    if (!isMsalConfigured()) return;
    void getPublicClientApplication().then(setPca);
  }, []);

  const establishSession = useCallback(
    async (
      accessToken: string,
      idToken?: string,
      accountUsername?: string,
    ) => {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          idToken,
          accountUsername,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? res.statusText);
      }
      router.replace(returnUrl.startsWith("/") ? returnUrl : "/");
      router.refresh();
    },
    [returnUrl, router],
  );

  const onSignIn = async () => {
    setError(null);
    if (!pca) {
      setError("Microsoft sign-in is not configured on this deployment.");
      return;
    }
    setBusy(true);
    try {
      let account = pca.getActiveAccount() ?? pca.getAllAccounts()[0] ?? null;
      let idToken: string | undefined;
      if (!account) {
        const login = await pca.loginPopup({ scopes: [...USER_READ_SCOPES] });
        account = login.account;
        idToken = login.idToken;
        if (account) pca.setActiveAccount(account);
      }
      if (!account) {
        throw new Error("No Microsoft account selected.");
      }
      const tokens = await acquireUserReadTokens(pca, account);
      await establishSession(
        tokens.accessToken,
        tokens.idToken ?? idToken,
        account.username,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!isMsalConfigured()) {
    return (
      <p className="text-sm text-zinc-600">
        Set{" "}
        <code className="rounded bg-zinc-100 px-1">
          NEXT_PUBLIC_MS_ENTRA_CLIENT_ID
        </code>{" "}
        and tenant ID in environment variables.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
      <h1 className="font-serif text-2xl font-semibold text-[var(--everde-forest)]">
        Everde AI Operations
      </h1>
      <p className="mt-2 text-sm text-zinc-600">
        Sign in with your <strong>@everde.com</strong> Microsoft work account to
        access the portal.
      </p>
      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void onSignIn()}
        disabled={busy}
        className="mt-6 w-full rounded-md bg-[var(--everde-forest)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#143524] disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in with Microsoft"}
      </button>
    </div>
  );
}

export default function SignInPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--everde-canvas)] px-4">
      <Suspense fallback={<p className="text-sm text-zinc-600">Loading…</p>}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
