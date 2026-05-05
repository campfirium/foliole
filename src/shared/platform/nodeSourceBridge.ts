import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import {
  toRuntimeNodeSourceDetails,
  type RuntimeNodeSourceDetails
} from './nodeSourceBridgePayloads';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type { RuntimeNodeSourceDetails } from './nodeSourceBridgePayloads';

export async function loadRuntimeNodeSourceDetails(nodeId: string): Promise<RuntimeNodeSourceDetails | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const details = toRuntimeNodeSourceDetails(
      await runtimeInvoke(NATIVE_COMMANDS.loadNodeSourceDetails, {
        node_id: nodeId
      })
    );
    if (!details) {
      logRuntimeWarning('native node source payload invalid', {
        action: 'load_runtime_node_source_details',
        area: 'bridge',
        command: NATIVE_COMMANDS.loadNodeSourceDetails,
        fallback: 'return_null'
      });
    }
    return details;
  } catch (error) {
    logRuntimeWarning('native node source loading failed', {
      action: 'load_runtime_node_source_details',
      area: 'bridge',
      command: NATIVE_COMMANDS.loadNodeSourceDetails,
      fallback: 'return_null',
      error
    });
    return null;
  }
}
