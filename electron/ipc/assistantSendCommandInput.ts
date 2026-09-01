import { validateAssistantImageDrafts } from '../assistant/assistantImageValidation.js';

import {
  readAssistantProvider,
  readOpeningLocation,
  readOptionalClientTurnId,
  readOptionalModelSelection,
  readOptionalProviderThreadId
} from './assistantCommandInputs.js';
import { readOptionalWorkspaceContext } from './assistantWorkspaceContextReader.js';

export function readAssistantSendCommandInput(args: Record<string, unknown>) {
  return {
    clientTurnId: readOptionalClientTurnId(args.clientTurnId) ?? createClientTurnId(),
    message: typeof args.message === 'string' ? args.message : '',
    modelSelection: readOptionalModelSelection(args.modelSelection),
    openingLocation: readOpeningLocation(args.openingLocation),
    provider: readAssistantProvider(args.provider),
    providerThreadId: readOptionalProviderThreadId(args.providerThreadId),
    validatedImages: validateAssistantImageDrafts(args.images),
    workspaceContext: readOptionalWorkspaceContext(args.workspaceContext)
  };
}

function createClientTurnId() {
  return `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
