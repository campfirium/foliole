export function renderImportOpening(value: string) {
  return (
    <div className="mt-2 rounded-md bg-bg-elevated px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/48">Opening</p>
      <span className="mt-1 block min-h-10 line-clamp-2 text-sm leading-6 text-foreground/78">{value}</span>
    </div>
  );
}

export function renderImportDate(label: string, prefix: string) {
  return <span>{prefix} {label}</span>;
}

export function renderImportMeta(value: string) {
  return (
    <div className="mt-1">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/45">Path</p>
      <span className="mt-1 block break-all">{value}</span>
    </div>
  );
}
