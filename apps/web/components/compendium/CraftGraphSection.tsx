import Link from "next/link";
import type { RecipeView, StackView } from "@/lib/queries/craft-graph";

function StackList({ stacks }: { stacks: StackView[] }) {
  if (stacks.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {stacks.map((s, i) => (
        <li key={`${s.refType}-${s.refId}-${i}`}>
          <span className="text-muted-foreground">{s.quantity}×</span>{" "}
          {s.slug && s.refType === "item" ? (
            <Link href={`/items/${s.slug}`} className="hover:underline">
              {s.name}
            </Link>
          ) : (
            <span>{s.name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function RecipeCard({ recipe }: { recipe: RecipeView }) {
  return (
    <div className="rounded-md border p-3">
      <div className="font-medium">{recipe.name}</div>
      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Inputs</div>
          <StackList stacks={recipe.inputs} />
        </div>
        <div>
          <div className="text-xs uppercase text-muted-foreground">Outputs</div>
          <StackList stacks={recipe.outputs} />
        </div>
      </div>
    </div>
  );
}

export function CraftGraphSection({ title, recipes }: { title: string; recipes: RecipeView[] }) {
  if (recipes.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="grid gap-3">
        {recipes.map((r) => (
          <RecipeCard key={r.id} recipe={r} />
        ))}
      </div>
    </section>
  );
}
