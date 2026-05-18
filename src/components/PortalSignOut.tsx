"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PortalSignOut() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onSignOut = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      router.push("/auth/sign-in");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void onSignOut()}
      disabled={busy}
      className="text-xs font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
