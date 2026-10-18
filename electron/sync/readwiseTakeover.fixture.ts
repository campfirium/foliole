import { loadReadwiseHostAssignment } from '../database/readwiseHostAssignment.js';
import { loadReadwiseOwnerGuard, saveReadwiseOwnerGuard } from '../database/readwiseOwnerGuard.js';
import { saveJsonSetting } from '../database/settingsStore.js';
import { loadDesktopSyncGroup } from '../database/syncGroupStore.js';

import { activateReadwiseWithHandoff } from './readwiseOwnerHandoff.js';

export async function runReadwiseTakeoverFixture(action: string, args: Record<string, unknown>) {
  const group = loadDesktopSyncGroup();
  if (!group) throw new Error('fixture_group_missing');
  if (action === 'readwiseSeed') {
    const owner = String(args.owner);
    saveJsonSetting('readwise_source_mode', { mode: 'relay', version: 1 });
    saveJsonSetting('readwise_active_host', { device_identity_key: owner, host_name: 'Owner', epoch: 4 });
    if (owner === group.local_device_identity_key) saveReadwiseOwnerGuard({
      epoch: 4, groupId: group.group_id, mode: 'relay', ownerId: owner, state: 'active', targetId: null
    });
  } else if (action === 'readwiseTakeover') await activateReadwiseWithHandoff();
  else if (action !== 'readwiseRead') throw new Error('unknown readwise fixture action');
  return { assignment: loadReadwiseHostAssignment(), guard: loadReadwiseOwnerGuard(group.group_id) };
}
