import type { WebContents } from 'electron';

import { createDefaultAideToolPermissionSettings } from '../../lib/core/assistant/aideToolPermissionSettings.js';
import type { NativeAssistantProviderId, NativeAssistantTurnEvent } from '../../lib/platform/nativeAssistantContract.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
import type { readLibraryConnectionLifetime } from '../database/libraryConnectionLifetime.js';

import { createAideToolSession } from './aideToolSession.js';
import { cancelAideWriteApprovals, requestAideWriteApproval } from './aideWriteApprovals.js';
import { describeAideWriteRequests } from './aideWriteChangeDescriptions.js';
import { loadFolioleAideToolPermissionSettings } from './folioleAideToolPermissionSettings.js';

const IPC_ASSISTANT_TURN_EVENT_CHANNEL = 'foliole:assistant-turn-event';

export async function createTurnToolSession(input: {
  clientTurnId: string;
  library: ReturnType<typeof readLibraryConnectionLifetime>;
  linkedMaterialIds: readonly string[];
  provider: NativeAssistantProviderId;
  sender: WebContents | undefined;
}) {
  const { clientTurnId, library, linkedMaterialIds, provider, sender } = input;
  const settings = await runWithDatabaseConnectionOwner(loadFolioleAideToolPermissionSettings)
    .catch(createDefaultAideToolPermissionSettings);
  if (!sender) {
    return { ...createAideToolSession(settings, undefined, linkedMaterialIds), writeLibraryGeneration: library.generation };
  }
  const send = createAssistantTurnEventSender(sender, clientTurnId);
  const session = createAideToolSession(settings, async (requests, turnSignal) => {
    const signal = turnSignal ? AbortSignal.any([library.signal, turnSignal]) : library.signal;
    if (signal.aborted || sender.isDestroyed()) return false;
    const cancel = () => cancelAideWriteApprovals(clientTurnId);
    sender.once('destroyed', cancel);
    try {
      const changes = await runWithDatabaseConnectionOwner(() =>
        signal.aborted ? null : describeAideWriteRequests(requests));
      if (!changes || sender.isDestroyed()) return false;
      return await requestAideWriteApproval({
        changes, clientTurnId, signal,
        emit: (approval) => send({ approval, clientTurnId, kind: 'approval_requested', provider }),
        onAbort: (approvalId) => {
          try {
            send({ approvalId, clientTurnId, kind: 'approval_cancelled', provider });
          } catch {
            // The window may have gone away while the approval was being withdrawn.
          }
        }
      });
    } finally {
      sender.removeListener('destroyed', cancel);
    }
  }, linkedMaterialIds);
  session.writeLibraryGeneration = library.generation;
  return session;
}

export function createAssistantTurnEventSender(sender: WebContents, clientTurnId: string) {
  return (event: NativeAssistantTurnEvent) => {
    if (event.clientTurnId !== clientTurnId || sender.isDestroyed()) return;
    sender.send(IPC_ASSISTANT_TURN_EVENT_CHANNEL, event);
  };
}
