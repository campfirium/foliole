import { FolioleCompanionSync } from '../shared/platform/companionWorkspaceRuntimeRepository';
import type { CompanionNativeDiscoveryEvent } from '../shared/platform/companionWorkspaceSyncPluginTypes';

import { postResult } from './iosBridgeAcceptance';

function hasEvent(events: CompanionNativeDiscoveryEvent[], change: string, status: string) {
  return events.some((event) => event.change === change && event.status === status);
}

export async function runIosSyncGroupDiscoveryAcceptance() {
  const events: CompanionNativeDiscoveryEvent[] = [];
  let removeListener: (() => Promise<void>) | null = null;
  try {
    const handle = await FolioleCompanionSync.addListener('syncGroupDiscoveryChanged', (event) => events.push(event));
    removeListener = () => handle.remove();
    events.push(await FolioleCompanionSync.startDiscoverySession());
    events.push(await FolioleCompanionSync.stopDiscoverySession());
    if (!hasEvent(events, 'started', 'searching') || !hasEvent(events, 'stopped', 'stopped')) {
      throw new Error('The iOS discovery bridge did not expose its start and stop events.');
    }
    postResult({
      error: null,
      events,
      phase: 'events-observed',
      scenario: 'sync-group-discovery-events',
      status: 'passed'
    });
  } catch (error) {
    postResult({
      error: error instanceof Error ? error.message : String(error),
      events,
      phase: 'failed',
      scenario: 'sync-group-discovery-events',
      status: 'failed'
    });
  } finally {
    await removeListener?.();
  }
}
