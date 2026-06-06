"use client";
import { useState } from "react";
import { EntityIcon } from "@/components/compendium/EntityIcon";
import { defaultRecipeId } from "@/lib/calculator/expand";
import { refKey, type CalcNode, type Selections, type Subgraph } from "@/lib/calculator/types";

interface TreeProps {
  node: CalcNode;
  subgraph: Subgraph;
  selections: Selections;
  onSelect: (key: string, recipeId: number) => void;
}

export function CraftTree({ node, subgraph, selections, onSelect }: TreeProps) {
  return (
    <ul className="space-y-1 text-sm">
      <TreeNode node={node} subgraph={subgraph} selections={selections} onSelect={onSelect} />
    </ul>
  );
}

function TreeNode({ node, subgraph, selections, onSelect }: TreeProps) {
  const [open, setOpen] = useState(true);
  const key = refKey(node.refType, node.refId);
  const recipes = subgraph.recipesByRef[key] ?? [];
  const selectedId = node.recipeId ?? (recipes.length ? selections[key] ?? defaultRecipeId(recipes) : null);

  return (
    <li>
      <div className="flex items-center gap-2 py-1">
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-label={open ? "Collapse" : "Expand"}
            className="w-4 text-muted-foreground"
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <EntityIcon assetName={node.iconAssetName} name={node.name} size={24} />
        <span>{node.name}</span>
        <span className="font-mono text-muted-foreground">×{node.needed}</span>
        {node.surplus > 0 && <span className="text-xs text-muted-foreground">(+{node.surplus} surplus)</span>}
        {node.hasAlternatives && selectedId != null && (
          <select
            value={selectedId}
            onChange={(e) => onSelect(key, Number(e.target.value))}
            aria-label={`Recipe for ${node.name}`}
            className="ml-auto h-7 rounded border border-input bg-transparent px-2 text-xs"
          >
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {open && node.children.length > 0 && (
        <ul className="ml-5 space-y-1 border-l border-border pl-3">
          {node.children.map((c) => (
            <TreeNode key={`${c.refType}:${c.refId}`} node={c} subgraph={subgraph} selections={selections} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}
