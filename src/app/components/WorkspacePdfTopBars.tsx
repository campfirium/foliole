import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';

import { PdfTopBarsProvider, usePdfTopBars } from '../../features/pdf/components/PdfTopBarsContext';
import { usesNativeMacOSWindowControls } from '../../shared/platform/windowChrome';
import { FloatingBar } from '../../shared/ui';

import { useImmersiveWindowChrome } from './useImmersiveWindowChrome';

export function WorkspacePdfTopBars(props: { children: ReactNode; isImmersiveMode: boolean }) {
  return (
    <PdfTopBarsProvider suspended={props.isImmersiveMode}>
      {props.children}
    </PdfTopBarsProvider>
  );
}

export function PdfWindowChrome(props: { isImmersiveMode: boolean; sidebarHoverEnabled?: boolean; leftSidebarVisible?: boolean }) {
  const { floating } = usePdfTopBars();
  const autoHideControls = (floating || props.sidebarHoverEnabled === true) && usesNativeMacOSWindowControls();
  const [hovered, setHovered] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  useImmersiveWindowChrome(props.isImmersiveMode || (autoHideControls && !hovered && !props.leftSidebarVisible));

  useEffect(() => {
    if (!autoHideControls) {
      setHovered(false);
      return;
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.buttons) return;
      const bounds = zone.current?.getBoundingClientRect();
      setHovered(Boolean(bounds && event.clientX >= bounds.left && event.clientX < bounds.right &&
        event.clientY >= bounds.top && event.clientY < bounds.bottom));
    };
    const blur = () => setHovered(false);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('blur', blur);
    };
  }, [autoHideControls]);

  return autoHideControls ? (
    <div aria-hidden="true" className="pdf-native-controls-reveal-zone" ref={zone} />
  ) : null;
}

function isSideWhitespace(event: MouseEvent<HTMLDivElement>) {
  if (event.buttons !== 0) return false;
  const toolbar = event.currentTarget.querySelector<HTMLElement>('[data-pdf-reading-toolbar]');
  const shell = event.currentTarget.querySelector<HTMLElement>('[data-pdf-toolbar-shell]');
  if (toolbar && shell) {
    const bounds = toolbar.getBoundingClientRect();
    const bottom = shell.getBoundingClientRect().top + toolbar.offsetTop + toolbar.offsetHeight;
    if (bounds.width > 0 && event.clientY <= bottom && (event.clientX < bounds.left || event.clientX > bounds.right)) return true;
  }
  // While sidebars use edge hover, only the upper whitespace can summon the top bars.
  if (event.currentTarget.closest('[data-pdf-sidebar-hover="true"]')) return false;
  const pages = Array.from(event.currentTarget.querySelectorAll('.pdf-document-page-frame'))
    .map((page) => page.getBoundingClientRect())
    .filter((box) => box.width > 0);
  const distance = (box: DOMRect) => Math.max(box.top - event.clientY, event.clientY - box.bottom, 0);
  const nearest = pages.reduce<DOMRect | null>((chosen, box) =>
    !chosen || distance(box) < distance(chosen) ? box : chosen, null);
  return Boolean(nearest && (event.clientX < nearest.left || event.clientX > nearest.right));
}

export function PdfTopBarsRevealZone(props: { children?: ReactNode }) {
  const bars = usePdfTopBars();
  const { setRevealHovered } = bars;
  useEffect(() => () => setRevealHovered(false), [setRevealHovered]);
  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-1 flex-col"
      data-testid={bars.floating ? 'pdf-top-bars-reveal-zone' : undefined}
      onMouseMove={(event) => setRevealHovered(bars.floating && isSideWhitespace(event))}
      onMouseLeave={() => setRevealHovered(false)}
    >
      {props.children}
    </div>
  );
}

export function PdfTopBar(props: { children: ReactNode; kind: 'window' | 'document' }) {
  const bars = usePdfTopBars();
  const position =
    props.kind === 'window'
      ? 'pdf-floating-window-title top-0 h-[var(--workspace-top-toolbar-height)] bg-[var(--role-content-top-bg)] [&>div]:h-full'
      : 'top-[var(--workspace-top-toolbar-height)] bg-[var(--role-content-bg)]';
  return (
    <FloatingBar
      testId={`pdf-${props.kind}-top-bar`}
      floating={bars.floating}
      visible={bars.visible}
      onActiveChange={bars.setActivity}
      className={bars.floating ? `${position} z-surface-raised shadow-none` : ''}
    >
      {props.children}
    </FloatingBar>
  );
}

export function PdfTopBarsTitleHost() {
  const { setTitleHost } = usePdfTopBars();
  return <div ref={setTitleHost} />;
}

export function PdfWindowTitle(props: { children: ReactNode }) {
  const bars = usePdfTopBars();
  return bars.floating && bars.titleHost
    ? <div className="col-start-2 row-start-1">{createPortal(<PdfTopBar kind="window">{props.children}</PdfTopBar>, bars.titleHost)}</div>
    : <div className="contents" data-testid="pdf-window-top-bar" data-floating="false" data-visible="true">{props.children}</div>;
}
