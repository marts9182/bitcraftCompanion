export function RecipeTypeBadge({ type }: { type: string }) {
  if (!type) return null;
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  const cls = type === "construction" ? "text-orange-400 border-orange-600" : "text-sky-400 border-sky-600";
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
