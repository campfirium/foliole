import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';

export function requestSyncFixtureIdentity(name: 'desktop-a' | 'desktop-b' | 'desktop-c') {
  const index = ['desktop-a', 'desktop-b', 'desktop-c'].indexOf(name) + 1;
  return createSyncGroupDeviceIdentity({ group_id: 't326-group',
    device_anchor: `00000000-0000-4000-8000-00000000000${index}`,
    library_path: `/t326/${name}`, path_flavor: 'posix' });
}
