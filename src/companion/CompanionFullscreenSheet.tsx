import { useRef, type ReactNode, type MutableRefObject } from 'react';

import { AppDialog, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../shared/ui';

import { companionMobileRailClassName } from './companionCssCompatibility';
import { CompanionTopBar } from './CompanionTopBar';

import './companionFullscreenSheet.css';

export function CompanionFullscreenSheet(props: {
  children: ReactNode;
  onOpenChange(open: boolean): void;
  open: boolean;
  title: string;
  scrollElementRef?: MutableRefObject<HTMLDivElement | null>;
}) {
  const opener = useRef<HTMLElement | null>(null);
  return <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
    <AppDialogPortal>
      <AppDialogOverlay />
      <AppDialogContent placement="fullscreen" className={`companion-fullscreen-sheet ${companionMobileRailClassName}`}
        onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={event => {
          if (!opener.current?.isConnected) return;
          event.preventDefault();
          opener.current.focus({ preventScroll: true });
        }}>
        <AppDialogTitle className="sr-only">{props.title}</AppDialogTitle>
        <CompanionTopBar onBack={() => props.onOpenChange(false)} title={props.title} visible />
        <div ref={props.scrollElementRef} className="app-scrollbar min-h-0 flex-1 overflow-y-auto pb-5 supports-[padding-bottom:max(0px)]:pb-[max(env(safe-area-inset-bottom),20px)]">
          <div className="mx-auto w-full max-w-[760px]">{props.children}</div>
        </div>
      </AppDialogContent>
    </AppDialogPortal>
  </AppDialog>;
}
