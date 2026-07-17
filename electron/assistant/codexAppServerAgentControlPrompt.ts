import type { NativeAssistantWorkspaceContext } from '../../lib/platform/nativeAssistantContract.js';

export function formatAgentControlContext(context: NativeAssistantWorkspaceContext) {
  const control = context.agentControl;
  if (!control) return [];
  if (control.state !== 'running') {
    return ['- Foliole tools are unavailable for this turn; say when the requested information or change cannot be completed.'];
  }
  const capabilities = new Set(control.capabilities);
  const actions = READ_ACTIONS
    .filter((action) => action.capabilities.some((capability) => capabilities.has(capability)))
    .map((action) => action.description);
  const lines = [
    '- Read-only Foliole tools are available for this turn; use them when the included context is insufficient.'
  ];
  if (actions.length > 0) lines.push(`- Available Foliole actions: ${actions.join('; ')}.`);
  lines.push(...formatActiveContextGuidance(context, capabilities));
  return lines;
}

const READ_ACTIONS = [
  { capabilities: ['materials.search'], description: 'search Topics and Folders' },
  { capabilities: ['materials.read'], description: 'read a Topic or Folder' },
  { capabilities: ['materials.listChildren'], description: 'list Folder contents' },
  { capabilities: ['virtualFolders.list', 'virtualFolders.read'], description: 'list or read virtual Folders' },
];

function formatActiveContextGuidance(context: NativeAssistantWorkspaceContext, capabilities: Set<string>) {
  if (context.anchor?.parentNodeId && capabilities.has('materials.read')) {
    return ['- When the included anchor preview is insufficient, read its parent Topic for source context.'];
  }
  if (context.activeSpecialKind && capabilities.has('materials.search')) {
    return ['- For a special Folder, use included children first and search when more detail is needed.'];
  }
  if (context.activeNodeId && capabilities.has('materials.read')) {
    return ['- When the active Topic or Folder preview is insufficient, read the active Foliole item.'];
  }
  return [];
}
