"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 p-8 font-sans text-zinc-900">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 max-w-xl text-sm text-zinc-600">
          {error.message}
          {error.digest ? ` (digest ${error.digest})` : ""}
        </p>
        <button
          type="button"
          className="mt-4 rounded-md bg-emerald-900 px-4 py-2 text-sm font-medium text-white"
          onClick={() => reset()}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
