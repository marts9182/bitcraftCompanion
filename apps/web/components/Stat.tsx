/** Stat card: `help` renders as a native title tooltip (with a ⓘ marker); `note` is always-visible explainer text. */
export function Stat({ label, value, help, note }: { label: string; value: string | number; help?: string; note?: string }) {
  return (
    <div className={`rounded-lg border border-border p-4${help ? " cursor-help" : ""}`} title={help}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
        {help ? <span aria-hidden="true" className="ml-1 normal-case">ⓘ</span> : null}
      </div>
      <div className="mt-1 text-xl font-semibold font-mono">{typeof value === "number" ? value.toLocaleString() : value}</div>
      {note ? <div className="mt-1 text-xs text-muted-foreground">{note}</div> : null}
    </div>
  );
}
