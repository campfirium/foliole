import { FileUp, Mic, Clipboard, type LucideIcon } from 'lucide-react';

import { cn } from '../shared/lib/utils';
import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  appInputFocusVisibleClassName
} from '../shared/ui';

function CaptureActionRow(props: {
  icon: LucideIcon;
  label: string;
}) {
  const Icon = props.icon;
  return (
    <button
      aria-disabled="true"
      className="flex w-full items-center gap-3 border-b border-companion-divider px-1 py-4 text-left text-foreground disabled:text-companion-text-tertiary"
      disabled
      type="button"
    >
      <Icon className="h-5 w-5" />
      <span className="text-base font-medium">{props.label}</span>
    </button>
  );
}

export function CompanionCaptureSheet(props: {
  onOpenChange(open: boolean): void;
  open: boolean;
}) {
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay className="companion-sheet-overlay" />
        <AppDialogContent className="companion-sheet bottom-0 left-0 top-auto w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-xl border-x-0 border-b-0 px-6 pt-3 pb-[max(env(safe-area-inset-bottom),24px)]">
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-9 rounded-full bg-companion-divider-strong" />
          <div className="mx-auto w-full max-w-[760px]">
            <div className="mb-4 flex items-center justify-between">
              <AppDialogClose className="rounded-md px-2 py-1 text-sm font-medium text-companion-text-secondary transition hover:bg-companion-subtle">
                Cancel
              </AppDialogClose>
              <AppDialogTitle>Capture</AppDialogTitle>
              <div className="w-14" />
            </div>
            <div className="rounded-md border border-companion-divider px-4 py-4">
              <button
                aria-disabled="true"
                className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-companion bg-companion-subtle text-companion-text-secondary"
                disabled
                type="button"
              >
                <Mic className="h-5 w-5" />
              </button>
              <textarea
                aria-label="Capture text"
                className={cn(
                  'min-h-24 w-full resize-none bg-transparent text-base leading-6 text-foreground placeholder:text-companion-text-tertiary',
                  appInputFocusVisibleClassName
                )}
                placeholder="Type or speak a new topic"
              />
            </div>
            <div className="mt-5 border-t border-companion-divider">
              <CaptureActionRow icon={Clipboard} label="Paste from Clipboard" />
              <CaptureActionRow icon={FileUp} label="Upload File" />
            </div>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
