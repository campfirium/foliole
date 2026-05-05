export function DocumentPanelLoadingContent({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div
        aria-label={loadingLabel}
        className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-foreground/55"
      />
    </div>
  );
}
