import { readWebDavAuthenticationPause } from '../../lib/core/sync/webDavAuthenticationPause.js';
import { hasWebDavRelayPublishedChanges } from '../../lib/core/sync/webDavRelayBodyOutbox.js';
import { readWebDavRelayBodyScope } from '../../lib/core/sync/webDavRelayBodyScope.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { openDatabaseConnection } from '../database/connection.js';

import { desktopSyncChangeSessions } from './desktopSyncChangeSessions.js';
import { desktopWebDavAuthenticationKey } from './desktopWebDavRelayAuthorization.js';
import { loadDesktopBoundWebDavRelay } from './desktopWebDavRelaySettings.js';

export async function loadDesktopWebDavRelayStatus() {
  const binding = loadDesktopBoundWebDavRelay();
  if (!binding) return { lan_baseline_required: false, published_via_relay: false };
  const db = createBetterSqliteDbPort(openDatabaseConnection().sqlite);
  const authentication_status = await readWebDavAuthenticationPause(db, desktopWebDavAuthenticationKey(binding));
  const scope = await readWebDavRelayBodyScope(db, binding, binding.desktop_device_id);
  const published = scope && await hasWebDavRelayPublishedChanges(db, scope);
  return { authentication_status, lan_baseline_required: !scope, published_via_relay: Boolean(published) &&
    !desktopSyncChangeSessions().hasSessions(binding.phone_device_id) };
}
