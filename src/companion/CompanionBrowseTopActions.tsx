import { ClipboardPlus, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { useState } from 'react';

import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../shared/ui';

function TopActionButton(props: {
  icon: LucideIcon;
  label: string;
  onClick(): void;
}) {
  const Icon = props.icon;
  return (
    <button
      aria-label={props.label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-companion-text-secondary transition hover:bg-bg-subtle/60 hover:text-foreground"
      onClick={props.onClick}
      type="button"
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function MenuRow(props: {
  label: string;
  status: string;
}) {
  return (
    <button
      aria-disabled="true"
      className="flex w-full items-center justify-between gap-4 border-b border-companion-divider px-1 py-4 text-left text-foreground"
      disabled
      type="button"
    >
      <span className="text-base font-medium">{props.label}</span>
      <span className="text-sm text-companion-text-tertiary">{props.status}</span>
    </button>
  );
}

function CompanionBrowseMenuSheet(props: {
  onOpenChange(open: boolean): void;
  open: boolean;
}) {
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="bottom-0 left-0 top-auto w-full translate-x-0 translate-y-0 rounded-b-none rounded-t-xl border-x-0 border-b-0 px-6 pb-6 pt-5">
          <div className="mx-auto w-full max-w-[760px]">
            <div className="mb-3 flex items-center justify-between">
              <AppDialogTitle>Browse menu</AppDialogTitle>
              <AppDialogClose className="rounded-md px-2 py-1 text-sm font-medium text-companion-text-secondary transition hover:bg-companion-subtle">
                Cancel
              </AppDialogClose>
            </div>
            <div className="border-t border-companion-divider">
              <MenuRow label="Sort" status="Not available yet" />
              <MenuRow label="Theme" status="Not available yet" />
            </div>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

export function CompanionBrowseTopActions(props: {
  onOpenCapture(): void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <TopActionButton icon={ClipboardPlus} label="Capture" onClick={props.onOpenCapture} />
      <TopActionButton icon={MoreHorizontal} label="More" onClick={() => setIsMenuOpen(true)} />
      <CompanionBrowseMenuSheet onOpenChange={setIsMenuOpen} open={isMenuOpen} />
    </div>
  );
}
