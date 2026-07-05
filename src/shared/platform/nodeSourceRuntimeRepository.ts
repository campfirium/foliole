import { NATIVE_COMMANDS } from '../../../lib/platform/nativeCommands';

import {
  toRuntimeNodeSourceDetails,
  type RuntimeNodeSourceDetails
} from './nodeSourceRuntimePayloads';
import {
  toRuntimeNodeSourceUpdatePreview,
  type RuntimeNodeSourceUpdatePreview
} from './nodeSourceUpdateRuntimePayloads';
import { getRuntimeInvoke } from './runtimeInvoke';
import { logRuntimeWarning } from './runtimeLogging';

export type { RuntimeNodeSourceDetails } from './nodeSourceRuntimePayloads';
export type { RuntimeNodeSourceUpdatePreview } from './nodeSourceUpdateRuntimePayloads';

export interface RuntimeIncomingUpdateActionResult {
  incomingUpdateId: string;
  nodeId: string | null;
  status: 'accepted' | 'dismissed' | 'imported_as_new' | 'unavailable';
}

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

function toRuntimeIncomingUpdateActionResult(value: unknown): RuntimeIncomingUpdateActionResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.incoming_update_id !== 'string' ||
    (payload.node_id !== null && typeof payload.node_id !== 'string') ||
    (payload.status !== 'accepted' &&
      payload.status !== 'dismissed' &&
      payload.status !== 'imported_as_new' &&
      payload.status !== 'unavailable')
  ) {
    return null;
  }
  return {
    incomingUpdateId: payload.incoming_update_id,
    nodeId: payload.node_id,
    status: payload.status
  };
}

export async function acceptRuntimeIncomingUpdate(
  incomingUpdateId: string,
  content: string
): Promise<RuntimeIncomingUpdateActionResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return toRuntimeIncomingUpdateActionResult(
    await runtimeInvoke(NATIVE_COMMANDS.acceptIncomingUpdate, {
      content,
      incoming_update_id: incomingUpdateId
    })
  );
}

export async function dismissRuntimeIncomingUpdate(incomingUpdateId: string): Promise<RuntimeIncomingUpdateActionResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return toRuntimeIncomingUpdateActionResult(
    await runtimeInvoke(NATIVE_COMMANDS.dismissIncomingUpdate, {
      incoming_update_id: incomingUpdateId
    })
  );
}

export async function importRuntimeIncomingUpdateAsNew(incomingUpdateId: string): Promise<RuntimeIncomingUpdateActionResult | null> {
  const runtimeInvoke = getRuntimeInvoke();
  if (!runtimeInvoke) {
    return null;
  }
  return toRuntimeIncomingUpdateActionResult(
    await runtimeInvoke(NATIVE_COMMANDS.importIncomingUpdateAsNew, {
      incoming_update_id: incomingUpdateId
    })
  );
}
