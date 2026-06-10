import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import {
  toRuntimeNodeSourceDetails,
  toRuntimeNodeSourceUpdatePreview,
  type RuntimeNodeSourceDetails,
  type RuntimeNodeSourceUpdatePreview
} from './nodeSourceRuntimePayloads';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type { RuntimeNodeSourceDetails, RuntimeNodeSourceUpdatePreview } from './nodeSourceRuntimePayloads';

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

export async function loadRuntimeNodeSourceUpdatePreview(nodeId: string): Promise<RuntimeNodeSourceUpdatePreview | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }

  try {
    const preview = toRuntimeNodeSourceUpdatePreview(
      await runtimeInvoke(NATIVE_COMMANDS.loadNodeSourceUpdatePreview, {
        node_id: nodeId
      })
    );
    if (!preview) {
      logRuntimeWarning('native node source update payload invalid', {
        action: 'load_runtime_node_source_update_preview',
        area: 'bridge',
        command: NATIVE_COMMANDS.loadNodeSourceUpdatePreview,
        fallback: 'return_null'
      });
    }
    return preview;
  } catch (error) {
    logRuntimeWarning('native node source update loading failed', {
      action: 'load_runtime_node_source_update_preview',
      area: 'bridge',
      command: NATIVE_COMMANDS.loadNodeSourceUpdatePreview,
      fallback: 'return_null',
      error
    });
    return null;
  }
}
