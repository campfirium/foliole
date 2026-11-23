import { allocateAideAttachedContext } from '../../lib/core/assistant/aideAttachedContextAllocation.js';
import { buildAideAttachedContextCandidates } from '../../lib/core/assistant/aideAttachedContextCandidates.js';
import { formatAideAttachedContext } from '../../lib/core/assistant/aideAttachedContextFormat.js';
import type {
  NativeAssistantProviderId,
  NativeAssistantWorkspaceContext
} from '../../lib/platform/nativeAssistantContract.js';
import { runWithAssistantHistoryConnectionOwner } from '../database/assistantHistoryConnection.js';
import { listAssistantThreadAttachedMaterialIds } from '../database/assistantThreadMessages.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';

import { loadAideAttachedContextSnapshot } from './aideAttachedContextLoader.js';
import { loadFolioleAideAttachedContextSettings } from './folioleAideAttachedContextSettings.js';

export interface AideAttachedContextForTurn {
  materialId: string;
  text: string;
}

export function composeAideAttachedUserText(message: string, attachedContext: string | undefined) {
  return attachedContext ? `${attachedContext}\n\nUser message:\n${message}` : message;
}

// A linked material's context is attached to the first message that has it open, then never again.
export async function prepareAideAttachedContextForTurn(input: {
  provider: NativeAssistantProviderId;
  providerThreadId?: string | undefined;
  workspaceContext?: NativeAssistantWorkspaceContext | undefined;
}): Promise<AideAttachedContextForTurn | null> {
  const context = input.workspaceContext;
  const materialId = context?.scope === 'node' ? context.activeNodeId : undefined;
  if (!materialId || !context?.conversationMaterials?.some((material) => material.nodeId === materialId)) return null;
  try {
    const threadId = input.providerThreadId;
    if (threadId) {
      const attached = await runWithAssistantHistoryConnectionOwner(
        () => listAssistantThreadAttachedMaterialIds(input.provider, threadId)
      );
      if (attached.includes(materialId)) return null;
    }
    return await runWithDatabaseConnectionOwner(() => buildAttachedContext(materialId, context.selection?.text));
  } catch {
    return null;
  }
}

function buildAttachedContext(materialId: string, selectionText: string | undefined) {
  const snapshot = loadAideAttachedContextSnapshot(materialId, selectionText);
  if (!snapshot) return null;
  const items = allocateAideAttachedContext(
    buildAideAttachedContextCandidates(snapshot),
    loadFolioleAideAttachedContextSettings()
  );
  const text = formatAideAttachedContext({ items, materialId, title: snapshot.focus.title });
  return text ? { materialId, text } : null;
}
