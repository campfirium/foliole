import path from 'node:path';

import { authorizationFingerprint } from './android-sync-group-authorization-inspection.mjs';
import { openReadonlySqliteDatabaseSync } from './sqlite-readonly.mjs';

function matchingDepartures(database, departed) {
  return database.prepare(`SELECT departure.authorization_id,
      member.authorization_id AS member_authorization_id
    FROM sync_group_member_departures departure JOIN sync_group_members member
      ON member.group_id = departure.group_id AND member.host_name = departure.host_name
    WHERE departure.group_id = ? AND member.state = 'left' LIMIT 3`)
    .all(departed.storedSyncGroupId).filter((row) =>
      authorizationFingerprint(row.authorization_id)
        === departed.storedLocalDepartureAuthorizationFingerprint
      && authorizationFingerprint(row.member_authorization_id)
        === departed.storedLocalMemberAuthorizationFingerprint);
}

export function inspectDesktopDepartureBoundary(
  libraryHome, departed, openDatabase = openReadonlySqliteDatabaseSync
) {
  const database = openDatabase(path.join(libraryHome, 'Data', 'foliole.db'));
  try {
    const local = database.prepare(`SELECT local.group_id, groups.timeline_id,
        member.authorization_id AS local_authorization_id
      FROM sync_group_local_state local JOIN sync_groups groups ON groups.group_id = local.group_id
      JOIN sync_group_members member
        ON member.group_id = local.group_id AND member.host_name = local.local_host_name
      WHERE local.singleton_id = 1 AND local.member_state = 'active'
        AND member.state = 'active' LIMIT 2`).all();
    const departures = matchingDepartures(database, departed);
    const exact = local.length === 1 && departures.length === 1
      && local[0].group_id === departed.storedSyncGroupId
      && local[0].timeline_id === departed.storedSyncGroupTimelineId;
    if (!exact) throw new Error('Desktop did not commit the matching protected A5 departure.');
    return { groupId: local[0].group_id,
      remotePeerAuthorizationFingerprint:
        authorizationFingerprint(local[0].local_authorization_id),
      timelineId: local[0].timeline_id };
  } finally { database.close(); }
}
