"use client";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { expand } from "@/lib/calculator/expand";
import type { RefType, Selections, Subgraph } from "@/lib/calculator/types";
import { ShoppingList } from "./ShoppingList";
import { TotalsCard } from "./TotalsCard";
import { CraftTree } from "./CraftTree";

export function CalculatorResult({
  subgraph,
  target,
}: {
  subgraph: Subgraph;
  target: { refType: RefType; refId: number };
}) {
  const [qty, setQty] = useState(1);
  const [selections, setSelections] = useState<Selections>({});

  const result = useMemo(
    () => expand(subgraph, { refType: target.refType, refId: target.refId, quantity: Math.max(1, qty) }, selections),
    [subgraph, target.refType, target.refId, qty, selections],
  );

  return (
    <div className="mt-6 space-y-8">
      <label className="flex items-center gap-2 text-sm">
        Quantity
        <Input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value) || 1)}
          className="w-24"
          aria-label="Quantity to craft"
        />
      </label>

      <TotalsCard totals={result.totals} />

      <section>
        <h2 className="mb-2 text-xl font-semibold">Shopping list</h2>
        <ShoppingList lines={result.shoppingList} />
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">Craft tree</h2>
        <CraftTree
          node={result.tree}
          subgraph={subgraph}
          selections={selections}
          onSelect={(key, id) => setSelections((s) => ({ ...s, [key]: id }))}
        />
      </section>
    </div>
  );
}
