import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../shared/ui';

export function CompanionBottomSheet(props: {
  children: ReactNode;
  leadingAction?: ReactNode;
  onOpenChange(open: boolean): void;
  open: boolean;
  title: string;
}) {
  const t = useTranslation();

  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay className="companion-sheet-overlay" />
        <AppDialogContent className="companion-sheet bottom-0 left-0 top-auto flex max-h-[calc(100vh-2rem)] w-full translate-x-0 translate-y-0 flex-col overflow-hidden [transform:translate(0,0)] rounded-b-none rounded-t-xl border-x-0 border-b-0 px-6 pt-3 pb-6 supports-[max-height:calc(100dvh-2rem)]:max-h-[calc(100dvh-2rem)] supports-[padding-bottom:max(0px)]:pb-[max(env(safe-area-inset-bottom),24px)]">
          <div aria-hidden="true" className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-companion-divider-strong" />
          <div className="mx-auto flex min-h-0 w-full max-w-[760px] flex-col">
            <div className="mb-3 flex shrink-0 items-center justify-between">
              {props.leadingAction}
              <AppDialogTitle>{props.title}</AppDialogTitle>
              <AppDialogClose className="rounded-md px-2 py-1 text-sm font-medium text-companion-text-secondary transition hover:bg-companion-subtle">
                {t('common.cancel')}
              </AppDialogClose>
            </div>
            <div className="min-h-0 overflow-y-auto">{props.children}</div>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
