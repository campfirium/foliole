import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { NativeReadwiseOriginalEpubActionState } from '../../../../lib/platform/nativeReadwiseContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { exportRuntimeReadwiseOriginalEpub } from '../../../shared/platform/import/readwiseOriginalEpubExportRuntimeRepository';
import { loadRuntimeReadwiseOriginalEpubActionState } from '../../../shared/platform/import/readwiseOriginalEpubRuntimeRepository';
import { clearAppRuntimeNotice, showAppRuntimeNotice } from '../../../shared/ui/AppRuntimeNotice';

import { NodeContextMenuItem } from './nodeListContextMenuPresentation';

export function ReadwiseOriginalEpubExportMenuItem({ nodeId }: { nodeId: string | null }) {
  const t = useTranslation();
  const [state, setState] = useState<NativeReadwiseOriginalEpubActionState | null>(null);

  useEffect(() => {
    let active = true;
    setState(null);
    if (nodeId) {
      void loadRuntimeReadwiseOriginalEpubActionState(nodeId)
        .then((next) => { if (active) setState(next); })
        .catch(() => { if (active) setState(null); });
    }
    return () => { active = false; };
  }, [nodeId]);

  if (!nodeId || !state || state.status === 'not_applicable') return null;
  const run = async () => {
    if (state.status !== 'ready') return;
    const noticeId = showAppRuntimeNotice(t('desktop.nodeList.exportOriginalEpub.exporting'), 'info');
    const result = await exportRuntimeReadwiseOriginalEpub(nodeId).catch(() => null);
    if (noticeId !== null) clearAppRuntimeNotice(noticeId);
    if (result?.status === 'cancelled') return;
    if (result?.status === 'saved') {
      showAppRuntimeNotice(t('desktop.nodeList.exportOriginalEpub.success'));
    } else {
      showAppRuntimeNotice(t(result?.error_code === 'original_epub_not_distributed'
        ? 'desktop.nodeList.exportOriginalEpub.missing'
        : 'desktop.nodeList.exportOriginalEpub.failed'), 'error');
    }
  };

  return (
    <NodeContextMenuItem disabled={state.status !== 'ready'} icon={Download} onSelect={() => void run()}>
      {t('desktop.nodeList.menu.exportOriginalEpub')}
    </NodeContextMenuItem>
  );
}
