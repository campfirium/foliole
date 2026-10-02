import { saveReadwiseHandoffIntent } from '../sync/readwiseHandoffIntent.js';
import { resumeReadwiseExecutionAfterActivation } from '../sync/readwiseOwnerStop.js';

import { loadReadwiseHostAssignment, loadStoredReadwiseHost } from './readwiseHostAssignment.js';
import { loadReadwiseOwnerGuard, saveReadwiseOwnerGuard } from './readwiseOwnerGuard.js';
import { loadReadwiseSourceModeState } from './readwiseSourceMode.js';
import { saveJsonSetting } from './settingsStore.js';
import { loadDesktopSyncGroup } from './syncGroupStore.js';

export function retainReadwiseOwnerAfterBackupRestore(wasLocalOwner: boolean) {
  if (!wasLocalOwner) return;
  const stored = loadStoredReadwiseHost();
  if ((stored.deviceId || stored.hostName) && stored.epoch >= 0) return;

  const group = loadDesktopSyncGroup();
  const assignment = loadReadwiseHostAssignment();
  const guard = group ? loadReadwiseOwnerGuard(group.group_id) : null;
  const epoch = guard ? guard.epoch + 1 : 0;
  saveJsonSetting('readwise_active_host', {
    device_identity_key: group?.local_device_identity_key ?? null,
    epoch,
    host_name: assignment.current_host_name,
    selection_source: 'chosen'
  });
  if (group) {
    saveReadwiseHandoffIntent(null, group.group_id);
    saveReadwiseOwnerGuard({ epoch, groupId: group.group_id,
      mode: loadReadwiseSourceModeState().mode === 'api' ? 'api' : 'relay',
      ownerId: group.local_device_identity_key, state: 'active', targetId: null });
  }
  resumeReadwiseExecutionAfterActivation();
}
