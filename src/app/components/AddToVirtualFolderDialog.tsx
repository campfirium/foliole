import { FolderPlus } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { appendMissingTopicIds, listAvailableManualVirtualFolders } from './workspaceVirtualFolderMembership';

export function AddToVirtualFolderDialog(props: { onClose: () => void; topicIds: string[] }) {
  const t = useTranslation();
  const nodeOrder = useWorkspaceStore((state) => state.nodeOrder);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const setFolderManualChildOrder = useWorkspaceStore((state) => state.setFolderManualChildOrder);
  const targets = listAvailableManualVirtualFolders({ nodeOrder, nodesById, topicIds: props.topicIds });

  const addToFolder = (folderId: string) => {
    const folder = useWorkspaceStore.getState().nodesById[folderId];
    if (!folder || !setFolderManualChildOrder) return;
    setFolderManualChildOrder(folderId, appendMissingTopicIds(folder.manualChildOrder ?? [], props.topicIds));
    props.onClose();
  };

  return (
    <AppDialog onOpenChange={(open) => !open && props.onClose()} open>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))] p-5">
          <AppDialogTitle>{t('desktop.nodeList.addToVirtualFolder.title')}</AppDialogTitle>
          <AppDialogDescription className="mt-2">
            {t('desktop.nodeList.addToVirtualFolder.description')}
          </AppDialogDescription>
          <div className="mt-4 flex max-h-72 flex-col gap-1 overflow-y-auto">
            {targets.map((folder) => (
              <AppButton key={folder.id} onClick={() => addToFolder(folder.id)} variant="list">
                <FolderPlus aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{folder.title}</span>
              </AppButton>
            ))}
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
