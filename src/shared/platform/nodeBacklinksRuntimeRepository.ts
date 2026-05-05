import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';
import type { BacklinkItem } from '../../features/nodes/model/internalLinks';

import { toRuntimeNodeBacklinks } from './nodeBacklinksRuntimePayloads';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export async function loadRuntimeNodeBacklinks(nodeId: string): Promise<BacklinkItem[] | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const backlinks = toRuntimeNodeBacklinks(
      await runtimeInvoke(NATIVE_COMMANDS.loadNodeBacklinks, { node_id: nodeId })
    );
    if (!backlinks) {
      logRuntimeWarning('native node backlinks payload invalid', {
        action: 'load_runtime_node_backlinks',
        area: 'bridge',
        command: NATIVE_COMMANDS.loadNodeBacklinks,
        fallback: 'return_null'
      });
    }
    return backlinks;
  } catch (error) {
    logRuntimeWarning('native node backlinks loading failed', {
      action: 'load_runtime_node_backlinks',
      area: 'bridge',
      command: NATIVE_COMMANDS.loadNodeBacklinks,
      fallback: 'return_null',
      error
    });
    return null;
  }
}
