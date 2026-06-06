import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Not found</h1>
      <p className="mt-3 text-muted-foreground">
        That page doesn’t exist — it may have been renamed or removed.
      </p>
      <Link
        href="/compendium"
        className="mt-6 inline-block rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
      >
        Browse the Compendium →
      </Link>
    </main>
  );
}
