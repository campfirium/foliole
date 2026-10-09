import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { PdfTopBarsProvider, usePdfTopBars } from '../../features/pdf/components/PdfTopBarsContext';
import { FloatingBar } from '../../shared/ui';

import { useImmersiveWindowChrome } from './useImmersiveWindowChrome';

export function WorkspacePdfTopBars(props: { children: ReactNode; isImmersiveMode: boolean }) {
  return (
    <PdfTopBarsProvider suspended={props.isImmersiveMode}>
      <PdfWindowChrome isImmersiveMode={props.isImmersiveMode} />
      {props.children}
    </PdfTopBarsProvider>
  );
}

function PdfWindowChrome(props: { isImmersiveMode: boolean }) {
  useImmersiveWindowChrome(props.isImmersiveMode);
  return null;
}

export function PdfTopBarsRevealZone() {
  const bars = usePdfTopBars();
  const { setRevealHovered } = bars;
  useEffect(() => () => setRevealHovered(false), [setRevealHovered]);
  if (!bars.floating) return null;
  return (
    <div
      className="absolute inset-x-0 top-0 z-surface-raised h-3 [-webkit-app-region:no-drag]"
      data-testid="pdf-top-bars-reveal-zone"
      onMouseEnter={() => setRevealHovered(true)}
      onMouseLeave={() => setRevealHovered(false)}
    >
      <div className="absolute inset-0" data-testid="pdf-toolbar-reveal-zone" />
    </div>
  );
}

export function PdfTopBar(props: { children: ReactNode; kind: 'window' | 'document' }) {
  const bars = usePdfTopBars();
  const position =
    props.kind === 'window'
      ? 'top-0 h-[var(--workspace-top-toolbar-height)] bg-[var(--workspace-region-titlebar-document-bg)] [&>div]:h-full'
      : 'top-[var(--workspace-top-toolbar-height)] bg-[var(--workspace-region-main-document-bg)]';
  return (
    <FloatingBar
      testId={`pdf-${props.kind}-top-bar`}
      floating={bars.floating}
      visible={bars.visible}
      onActiveChange={bars.setActivity}
      className={bars.floating ? `${position} z-surface-raised` : ''}
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
    ? <div>{createPortal(<PdfTopBar kind="window">{props.children}</PdfTopBar>, bars.titleHost)}</div>
    : <div data-testid="pdf-window-top-bar" data-floating="false" data-visible="true">{props.children}</div>;
}
