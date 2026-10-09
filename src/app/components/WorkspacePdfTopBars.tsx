import { useEffect, type ReactNode } from 'react';

import { PdfTopBarsProvider, usePdfTopBars } from '../../features/pdf/components/PdfTopBarsContext';
import { FloatingBar } from '../../shared/ui';

import { useImmersiveWindowChrome } from './useImmersiveWindowChrome';

export function WorkspacePdfTopBars(props: { children: ReactNode; isImmersiveMode: boolean }) {
  return (
    <PdfTopBarsProvider suspended={props.isImmersiveMode}>
      <PdfWindowChrome isImmersiveMode={props.isImmersiveMode} />
      {props.children}
      <TopBarsRevealZone />
    </PdfTopBarsProvider>
  );
}

function PdfWindowChrome(props: { isImmersiveMode: boolean }) {
  const bars = usePdfTopBars();
  useImmersiveWindowChrome(props.isImmersiveMode || (bars.floating && !bars.visible));
  return null;
}

function TopBarsRevealZone() {
  const bars = usePdfTopBars();
  const { setRevealHovered } = bars;
  useEffect(() => () => setRevealHovered(false), [setRevealHovered]);
  if (!bars.floating) return null;
  return (
    <div
      className="fixed inset-x-0 top-0 z-floating h-3 [-webkit-app-region:no-drag]"
      data-testid="pdf-top-bars-reveal-zone"
      onMouseEnter={() => setRevealHovered(true)}
      onMouseLeave={() => setRevealHovered(false)}
    />
  );
}

export function PdfTopBar(props: { children: ReactNode; kind: 'window' | 'document' }) {
  const bars = usePdfTopBars();
  const position =
    props.kind === 'window'
      ? 'top-0'
      : 'top-[var(--workspace-top-toolbar-height)] bg-[var(--workspace-region-main-document-bg)]';
  return (
    <FloatingBar
      testId={`pdf-${props.kind}-top-bar`}
      floating={bars.floating}
      visible={bars.visible}
      onActiveChange={bars.setActivity}
      className={bars.floating ? position : ''}
    >
      {props.children}
    </FloatingBar>
  );
}
