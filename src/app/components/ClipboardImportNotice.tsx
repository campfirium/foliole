import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

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
  tone
}: {
  message: string;
  tone: ClipboardImportNoticeTone;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute left-[calc(var(--workspace-rail-width)+theme(spacing.2))] top-[calc(var(--workspace-top-toolbar-height)+theme(spacing.2))] z-40 flex max-w-72 items-start gap-2 rounded-md border border-border/70 bg-bg-panel/95 px-3 py-2 text-sm text-foreground shadow-panel"
      data-testid="clipboard-import-notice"
      role="status"
    >
      {renderIcon(tone)}
      <span>{message}</span>
    </div>
  );
}
