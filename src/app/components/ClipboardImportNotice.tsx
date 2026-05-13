import { ArrowUpRight, CheckCircle2, Loader2, XCircle } from 'lucide-react';

export type ClipboardImportNoticeTone = 'loading' | 'success' | 'error';

const iconClassName = 'mt-0.5 size-4 shrink-0';

function renderIcon(tone: ClipboardImportNoticeTone) {
  if (tone === 'loading') {
    return <Loader2 aria-hidden="true" className={`${iconClassName} animate-spin`} strokeWidth={1.75} />;
  }
  if (tone === 'success') {
    return <CheckCircle2 aria-hidden="true" className={iconClassName} strokeWidth={1.75} />;
  }
  return <XCircle aria-hidden="true" className={iconClassName} strokeWidth={1.75} />;
}

export function ClipboardImportNotice({
  message,
  onOpen,
  tone
}: {
  message: string;
  onOpen?: () => void;
  tone: ClipboardImportNoticeTone;
}) {
  const content = (
    <>
      {renderIcon(tone)}
      <span className="min-w-0 flex-1">{message}</span>
      {onOpen ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground/70 group-hover:text-foreground">
          Open topic
          <ArrowUpRight aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        </span>
      ) : null}
    </>
  );

  return (
    <div
      aria-live="polite"
      className={`absolute left-[calc(var(--workspace-rail-width)+theme(spacing.2))] top-[calc(var(--workspace-top-toolbar-height)+theme(spacing.2))] z-40 max-w-80 rounded-md border border-border/70 bg-bg-panel/95 text-sm text-foreground shadow-panel ${onOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      data-testid="clipboard-import-notice"
      role="status"
    >
      {onOpen ? (
        <button
          aria-label="Open imported clipboard topic"
          className="group flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onOpen}
          type="button"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-start gap-2 px-3 py-2">{content}</div>
      )}
    </div>
  );
}
