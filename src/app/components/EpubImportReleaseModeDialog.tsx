import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';
import type { EpubImportReleaseMode } from '../hooks/epubImportReleaseMode';
import {
  closeEpubImportReleaseModeDialog,
  useEpubImportReleaseModeDialogSnapshot
} from '../hooks/epubImportReleaseModeDialogStore';

const MODE_OPTIONS: Array<{
  description: string;
  label: string;
  suitability: string;
  mode: EpubImportReleaseMode;
}> = [
  {
    description: 'Read in order. The next chapter enters the Review queue after the current chapter is dismissed.',
    label: 'Sequential Reading',
    suitability: 'Suited to new content',
    mode: 'sequential'
  },
  {
    description: 'Keep every chapter available so they can enter the Review queue without chapter-order locks.',
    label: 'Free Reading',
    suitability: 'Suited to existing content',
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
            <AppDialogTitle className="text-base font-semibold">Choose Reading Mode</AppDialogTitle>
            <p className="text-[13px] text-foreground/65">{snapshot.file.fileName}</p>
          </div>
          <div className="mt-4 space-y-3">
            <AppDialogDescription className="text-[13px] leading-5 text-foreground/70">
              You can change this later from the Topic context menu.
            </AppDialogDescription>
            <div aria-label="EPUB reading mode" className="grid gap-2">
              {MODE_OPTIONS.map((option) => (
                <button
                  className="rounded-md border border-border-subtle p-3 text-left transition-colors hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  key={option.mode}
                  onClick={() => closeEpubImportReleaseModeDialog(option.mode)}
                  type="button"
                >
                  <span className="block text-[13px] font-medium text-foreground">{option.label}</span>
                  <span className="mt-1 block text-[12px] text-foreground/55">{option.suitability}</span>
                  <span className="mt-1 block text-[12px] leading-5 text-foreground/60">{option.description}</span>
                </button>
              ))}
            </div>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
