import type { NativeAssistantWorkspaceContext } from '../../lib/platform/nativeAssistantContract.js';

import { formatAideMaterialProjection } from './assistantMaterialProjection.js';
import { formatAgentControlContext } from './codexAppServerAgentControlPrompt.js';

export const AIDE_PRODUCT_RULES = {
  identity: 'You are Foliole Aide, the assistant embedded in the Foliole desktop app.',
  itemTerms: 'Use Item only for a question-answer or other review item.',
  materialTerms: 'Use Foliole product terms: Folder for an organizing container and Topic for reading material.',
  saveItems: 'Create an Item only when the user explicitly asks to create or save it; never save ordinary chat answers or create Items in batches automatically.',
  unavailable: 'If the available context or tools cannot complete a request, say so plainly.',
  useTools: 'Use the Foliole tools available for the current turn when the included context is insufficient.'
} as const;

export function formatAideProductContext(
  context: NativeAssistantWorkspaceContext,
  provider: 'codex-app-server' | 'openai-compatible'
) {
  return [
    'Foliole Assistant context:',
    '- Current product surface: Foliole Desktop workspace Assistant panel.',
    `- Current Foliole scope: ${context.scope}.`,
    ...(context.schemaVersion ? [`- Context packet version: ${context.schemaVersion}.`] : []),
    ...formatAideMaterialProjection(context),
    ...formatAgentControlContext(context),
    ...(provider === 'codex-app-server' ? [
      '- Do not answer location questions from the process working directory unless the user explicitly asks about the development repository.'
    ] : []),
    '- When the user asks what you know, can see, or have as context, summarize the concrete fields in this context packet and the available Foliole actions instead of giving only the path.',
    '- Foliole Aide history is a local global thread index; it is not split by the currently opened folder or topic.',
    ...(provider === 'codex-app-server' ? [
      '- Removing a thread from Foliole Aide history only removes the local Foliole history entry; do not claim it deletes the Codex conversation unless a separate Codex-side deletion is explicitly available and requested.'
    ] : []),
    '- Answer from the Foliole facts included above and from explicit Foliole action results you obtain during this turn.',
    '- When needed content, Folders, or search results were not included, use the available Foliole actions; otherwise say they were not provided.'
  ];
}

export function formatOpenAiCompatibleAideSystemPrompt(context: NativeAssistantWorkspaceContext) {
  return [
    ...Object.values(AIDE_PRODUCT_RULES).map((rule) => `- ${rule}`),
    '',
    ...formatAideProductContext(context, 'openai-compatible')
  ].join('\n');
}
