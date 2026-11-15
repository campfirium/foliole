import { useEffect } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../shared/config/appSettings';
import { saveRuntimeAppSettingsState } from '../../shared/platform/appSettingsState';
import { subscribeContentEditAcknowledgements } from '../../store/workspaceContentEditAcknowledgements';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function useMaterialHistoryEditTracking() {
  useEffect(() => subscribeContentEditAcknowledgements((event) => {
    if (event.type !== 'saved') return;
    const { nodesById } = useWorkspaceStore.getState();
    const node = nodesById[event.nodeId];
    if (!node || node.kind === 'folder' || node.specialKind) return;
    void saveRuntimeAppSettingsState({ [APP_SETTINGS_STORAGE_KEYS.materialHistoryLastEdit]: node.id });
  }), []);
}
