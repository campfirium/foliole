export function renderDeleteStatusOverlay(deleteStatusLabel: string | null) {
  if (!deleteStatusLabel) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-auto absolute inset-0 z-surface flex items-start bg-bg-panel/70 p-3 backdrop-blur-[1px]"
    >
      <div className="rounded-md border border-border bg-bg-panel px-3 py-2 text-sm font-medium text-foreground shadow-control">
        {deleteStatusLabel}
      </div>
    </div>
  );
}
