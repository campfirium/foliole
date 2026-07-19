import type { ReactNode } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { PanelScaleSurface as SharedPanelScaleSurface } from '../../shared/ui';

import type { CentralPanelKind } from './documentPanelSectionModel';

export function DocumentPanelScaleSurface(props: {
  children: ReactNode;
  chrome: ReactNode;
  isPdfSurface: boolean;
  overlay: ReactNode;
  panelKind: CentralPanelKind;
}) {
  const t = useTranslation();
  const isListPanel = props.panelKind === 'list';
  const panelId = isListPanel ? 'list-panel' : 'document-panel';
  const label = t(isListPanel ? 'desktop.list.panel' : 'desktop.document.panel');
  return (
    <section aria-label={label} className="workspace-region-main-document relative flex h-full min-h-0 flex-1 flex-col text-foreground">
      <SharedPanelScaleSurface enabled={!props.isPdfSurface} label={label} panelId={panelId}>
        <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
          {props.overlay}
          {props.chrome}
          {props.children}
        </div>
      </SharedPanelScaleSurface>
    </section>
  );
}
