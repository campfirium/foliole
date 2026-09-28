import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { exportNodePdf } from '../../../shared/platform/desktop/attachmentPdfActions';
import { loadRuntimeNodeSourceDetails } from '../../../shared/platform/nodeSourceRuntimeRepository';
import { showAppRuntimeNotice } from '../../../shared/ui/AppRuntimeNotice';

import { NodeContextMenuItem, NodeContextMenuSeparator } from './nodeListContextMenuPresentation';
import { ReadwiseSourceMenuItems } from './ReadwiseSourceMenuItems';

export function PdfSourceMenuItems(props: {
  hasPreviousGroup: boolean;
  nodeId: string | null;
  readwiseNodeId: string | null;
}) {
  const t = useTranslation();
  const [pdfAvailable, setPdfAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    setPdfAvailable(false);
    if (props.nodeId) {
      void loadRuntimeNodeSourceDetails(props.nodeId).then((details) => {
        if (!active) return;
        setPdfAvailable(Boolean(
          details?.sourceNodeId === props.nodeId &&
          details.importSource?.sourceKind.toLowerCase() === 'pdf' &&
          details.importSource.sourceLocator.startsWith('foliole-asset://attachment/')
        ));
      });
    }
    return () => { active = false; };
  }, [props.nodeId]);

  const exportPdf = async () => {
    if (!props.nodeId) return;
    const result = await exportNodePdf(props.nodeId).catch(() => null);
    if (!result || !['saved', 'cancelled'].includes(result.status)) {
      showAppRuntimeNotice(t('desktop.pdf.export.failed'), 'error');
    }
  };

  return (
    <>
      {pdfAvailable ? (
        <>
          {props.hasPreviousGroup ? <NodeContextMenuSeparator /> : null}
          <NodeContextMenuItem icon={Download} onSelect={() => void exportPdf()}>
            {t('desktop.pdf.export.action')}
          </NodeContextMenuItem>
        </>
      ) : null}
      <ReadwiseSourceMenuItems
        hasPreviousGroup={props.hasPreviousGroup && !pdfAvailable}
        nodeId={props.readwiseNodeId}
      />
    </>
  );
}
