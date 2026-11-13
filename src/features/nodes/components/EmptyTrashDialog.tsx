import { useState } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import {
  AppButton, AppDialog, AppDialogActions, AppDialogBody, AppDialogClose, AppDialogContent,
  AppDialogDescription, AppDialogOverlay, AppDialogPortal, AppDialogTitle
} from '../../../shared/ui';
import { useWorkspaceStore } from '../../../store/workspaceStore';

export function useEmptyTrashConfirmation() {
  const [requestedIds, setRequestedIds] = useState<string[] | null>(null);
  const request = () => {
    const { trashedNodeIds } = useWorkspaceStore.getState();
    if (trashedNodeIds.length > 0) setRequestedIds([...trashedNodeIds]);
  };
  return {
    request,
    dialog: requestedIds ? <EmptyTrashDialog ids={requestedIds} onClose={() => setRequestedIds(null)} /> : null
  };
}

function EmptyTrashDialog({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const t = useTranslation();
  const confirm = () => {
    const { deleteNodesPermanently, trashedNodeIds } = useWorkspaceStore.getState();
    const stillTrashed = new Set(trashedNodeIds);
    deleteNodesPermanently(ids.filter((id) => stillTrashed.has(id)));
    onClose();
  };

  return (
    <AppDialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))]" layout="task">
          <AppDialogTitle>{t('desktop.nodeList.emptyTrashDialog.title')}</AppDialogTitle>
          <AppDialogBody>
            <AppDialogDescription>{t('desktop.nodeList.emptyTrashDialog.description')}</AppDialogDescription>
          </AppDialogBody>
          <AppDialogActions>
            <AppDialogClose asChild>
              <AppButton variant="ghost">{t('desktop.nodeList.trash.deleteDialog.cancel')}</AppButton>
            </AppDialogClose>
            <AppButton variant="danger" onClick={confirm}>{t('desktop.nodeList.emptyTrash')}</AppButton>
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
