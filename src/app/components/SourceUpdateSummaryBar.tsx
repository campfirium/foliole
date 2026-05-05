function formatHighlightTrend(currentHighlightCount: number, updatedHighlightCount: number) {
  if (currentHighlightCount === updatedHighlightCount) {
    return `Highlights stay at ${updatedHighlightCount}`;
  }
  if (updatedHighlightCount > currentHighlightCount) {
    return `Highlights grow from ${currentHighlightCount} to ${updatedHighlightCount}`;
  }
  return `Highlights shrink from ${currentHighlightCount} to ${updatedHighlightCount}`;
}

export function SourceUpdateSummaryBar(props: {
  currentHighlightCount: number;
  updatedHighlightCount: number;
}) {
  return (
    <section className="grid grid-cols-2 gap-3 border-b border-border px-4 py-3">
      <div className="rounded-md bg-[#eef2f8] px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.12em] text-foreground/45">Current</p>
        <p className="mt-1 text-sm font-medium text-foreground">{props.currentHighlightCount} highlights</p>
      </div>
      <div className="rounded-md bg-[#f4efe5] px-3 py-2">
        <p className="text-[11px] uppercase tracking-[0.12em] text-foreground/45">Incoming</p>
        <p className="mt-1 text-sm font-medium text-foreground">{formatHighlightTrend(props.currentHighlightCount, props.updatedHighlightCount)}</p>
      </div>
    </section>
  );
}
