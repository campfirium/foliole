import { cn } from '../../shared/lib/utils';
import { AppButton, AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';
import type { EpubImportReleaseMode } from '../hooks/epubImportReleaseMode';
import {
  closeEpubImportReleaseModeDialog,
  selectEpubImportReleaseMode,
  useEpubImportReleaseModeDialogSnapshot
} from '../hooks/epubImportReleaseModeDialogStore';

const MODE_OPTIONS: Array<{
  description: string;
  label: string;
  mode: EpubImportReleaseMode;
}> = [
  {
    description: 'Release Derived Topics in tree order.',
    label: 'Sequential Reading',
    mode: 'sequential'
  },
  {
    description: 'Keep Derived Topics available without locking later topics.',
    label: 'Free Reading',
    mode: 'free'
  }
];

export function EpubImportReleaseModeDialog() {
  const snapshot = useEpubImportReleaseModeDialogSnapshot();
  if (!snapshot) {
    return null;
  }
  return (
    <AppDialog onOpenChange={(open) => (!open ? closeEpubImportReleaseModeDialog(null) : undefined)} open>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(460px,calc(100vw-32px))] p-5">
          <div className="space-y-1">
            <AppDialogTitle className="text-base font-semibold">Import EPUB</AppDialogTitle>
            <p className="text-[13px] text-foreground/65">{snapshot.file.fileName}</p>
          </div>
          <div className="mt-4 space-y-3">
            <p className="text-[13px] leading-5 text-foreground/70">
              Choose how this Source Topic releases its Derived Topics.
            </p>
            <div aria-label="EPUB release mode" className="grid gap-2" role="radiogroup">
              {MODE_OPTIONS.map((option) => (
                <button
                  aria-checked={snapshot.selectedMode === option.mode}
                  className={cn(
                    'rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    snapshot.selectedMode === option.mode
                      ? 'border-border-strong bg-foreground/[0.05]'
                      : 'border-border-subtle hover:bg-foreground/[0.03]'
                  )}
                  key={option.mode}
                  onClick={() => selectEpubImportReleaseMode(option.mode)}
                  role="radio"
                  type="button"
                >
                  <span className="block text-[13px] font-medium text-foreground">{option.label}</span>
                  <span className="mt-1 block text-[12px] leading-5 text-foreground/60">{option.description}</span>
                  {snapshot.recommendedMode === option.mode ? (
                    <span className="mt-2 block text-[12px] text-foreground/55">
                      {snapshot.hasHighlights
                        ? 'Recommended because this EPUB appears to contain Highlights.'
                        : 'Recommended because no Highlights were detected.'}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <AppButton onClick={() => closeEpubImportReleaseModeDialog(null)} variant="ghost">
              Cancel
            </AppButton>
            <AppButton onClick={() => closeEpubImportReleaseModeDialog(snapshot.selectedMode)} variant="primary">
              Import
            </AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
