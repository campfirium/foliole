import { useEffect, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { savePartitionedWorkspaceBody } from '../../shared/platform/desktop/workspaceBodyPartition';
import { AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogContent, AppDialogOverlay, AppDialogPortal, AppDialogTitle } from '../../shared/ui';
import { listenForBodyOverflow, type BodyOverflowRequest } from '../../shared/ui/bodyOverflowRequest';
import { isPartitionableNodeBody, showNodeTextLimitNotice } from '../../shared/ui/nodeTextSaveBudget';
import { createWorkspaceNodeMutationPatch } from '../../store/workspaceNodeMutationPatch';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { drainPendingNodeContentRuntimePersists } from '../../store/workspaceStoreContentRuntimePersist';

function rejectNonBodyOverflow(request: BodyOverflowRequest) {
  const node = useWorkspaceStore.getState().nodesById[request.nodeId];
  if (!node || isPartitionableNodeBody(node)) return false;
  showNodeTextLimitNotice();
  request.cancel();
  return true;
}

export function BodyOverflowDialogHost() {
  const t = useTranslation();
  const [request, setRequest] = useState<BodyOverflowRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => listenForBodyOverflow((next) => {
    if (rejectNonBodyOverflow(next)) return;
    setRequest((current) => current ?? next);
    setError(false);
  }), []);
  if (!request) return null;
  const close = () => {
    if (busy) return;
    setRequest(null);
    request.cancel();
  };
  const handleConfirm = async () => {
    setBusy(true);
    setError(false);
    try {
      if (!request.prepare() || !await drainPendingNodeContentRuntimePersists()) throw new Error('body_partition_draft_changed');
      const result = await savePartitionedWorkspaceBody({ sourceNodeId: request.nodeId,
        expectedContent: request.previousContent, content: request.content });
      useWorkspaceStore.setState((state) => {
        const patch = createWorkspaceNodeMutationPatch(state, result);
        const nodesById = { ...patch.nodesById };
        for (const snapshot of result.nodes) {
          const node = nodesById[snapshot.nodeId];
          if (node) nodesById[snapshot.nodeId] = { ...node, content: snapshot.content, hasContent: snapshot.content.length > 0 };
        }
        return { ...patch, nodesById, rendererBoundaryKeepNodeIds: result.createdNodeIds ?? [] };
      });
      setRequest(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AppDialog open onOpenChange={(open) => !open && close()}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent aria-describedby={undefined}>
          <AppDialogTitle>{t('desktop.bodyOverflow.title')}</AppDialogTitle>
          <AppDialogBody>
            <p>{t('desktop.bodyOverflow.description')}</p>
            {error ? <p role="alert" className="text-destructive">{t('desktop.bodyOverflow.failed')}</p> : null}
          </AppDialogBody>
          <AppDialogActions>
            <AppButton variant="subtle" disabled={busy} onClick={close}>{t('common.cancel')}</AppButton>
            <AppButton disabled={busy} loading={busy} onClick={() => void handleConfirm()}>{t('desktop.bodyOverflow.confirm')}</AppButton>
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
