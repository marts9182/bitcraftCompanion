import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">BitCraft Companion</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        The fast, comprehensive companion for BitCraft Online. Compendium, guides, and live data —
        coming online.
      </p>
      <Link
        href="/items"
        className="mt-6 inline-block rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
      >
        Browse the Item Compendium →
      </Link>
    </main>
  );
}
