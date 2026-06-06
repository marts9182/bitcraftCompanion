"use client";

import Link from "next/link";

/**
 * Global error boundary. Shows a friendly message without leaking error detail
 * or connection info. The error is logged to the console for diagnostics.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // eslint-disable-next-line no-console
  console.error(error);
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-muted-foreground">An unexpected error occurred. Please try again.</p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
        >
          Try again
        </button>
        <Link href="/" className="rounded-md border px-4 py-2 font-medium hover:bg-muted/40">
          Home
        </Link>
      </div>
    </main>
  );
}
