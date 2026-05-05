interface DocumentPriorityQuickSetHintProps {
  isActive: boolean;
}

export function DocumentPriorityQuickSetHint({ isActive }: DocumentPriorityQuickSetHintProps) {
  if (!isActive) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
      <div
        aria-live="polite"
        className="flex items-center gap-2 rounded-full border border-border/70 bg-bg-elevated/95 px-4 py-2 text-sm text-foreground/76 shadow-sm"
      >
        <span className="font-medium text-foreground/82">Set priority</span>
        <span aria-hidden="true" className="text-foreground/35">
          /
        </span>
        <span>0-9 to set</span>
        <span aria-hidden="true" className="text-foreground/35">
          /
        </span>
        <span>Esc to cancel</span>
      </div>
    </div>
  );
}
