import { useMemo } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { MembershipDestinationPalette } from './MembershipDestinationPalette';
import { appendMissingSourceIds, listAvailableManualVirtualFolders } from './workspaceVirtualFolderMembership';

export function AddToVirtualFolderDialog(props: { onClose: () => void; sourceIds: string[] }) {
  const t = useTranslation();
  const nodeOrder = useWorkspaceStore((state) => state.nodeOrder);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const targets = useMemo(() => listAvailableManualVirtualFolders({ nodeOrder, nodesById, sourceIds: props.sourceIds }),
    [nodeOrder, nodesById, props.sourceIds]);

  function addToFolder(folderId: string) {
    const { nodesById, setFolderManualChildOrder } = useWorkspaceStore.getState();
    const folder = nodesById[folderId];
    if (!folder || !setFolderManualChildOrder) return;
    setFolderManualChildOrder(folderId, appendMissingSourceIds(folder.manualChildOrder ?? [], props.sourceIds));
    props.onClose();
  }

  return (
    <MembershipDestinationPalette
      copy={{
        title: t('desktop.nodeList.addToVirtualFolder.title'),
        input: t('desktop.nodeList.addToVirtualFolder.input'),
        placeholder: t('desktop.nodeList.addToVirtualFolder.placeholder'),
        results: t('desktop.nodeList.addToVirtualFolder.results'),
        empty: t('desktop.nodeList.addToVirtualFolder.empty'),
        noResults: t('desktop.nodeList.addToVirtualFolder.noResults'),
        create: t('desktop.nodeList.createVirtualFolder')
      }}
      onClose={props.onClose}
      onCreate={() => void useWorkspaceStore.getState().createVirtualNode({ mode: 'manual' })}
      onSelect={addToFolder}
      targets={targets}
    />
  );
}
