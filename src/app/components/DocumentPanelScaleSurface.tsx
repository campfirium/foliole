import type { ReactNode } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { PanelScaleSurface as SharedPanelScaleSurface } from '../../shared/ui';

export function DocumentPanelScaleSurface(props: {
  children: ReactNode;
  chrome: ReactNode;
  isFolderListView: boolean;
  isPdfSurface: boolean;
  overlay: ReactNode;
}) {
  const t = useTranslation();
  const panelId = props.isFolderListView ? 'list-panel' : 'document-panel';
  const label = props.isFolderListView ? 'List panel' : 'Document panel';
  return (
    <section aria-label={t('desktop.document.panel')} className="workspace-region-main-document relative flex h-full min-h-0 flex-1 flex-col text-foreground">
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
