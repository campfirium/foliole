import type { NativeAssistantWorkspaceContext } from '../../lib/platform/nativeAssistantContract.js';

export function formatAgentControlContext(context: NativeAssistantWorkspaceContext) {
  const control = context.agentControl;
  if (!control) return [];
  if (control.state !== 'running') {
    return ['- Foliole tools are unavailable for this turn; say when the requested information or change cannot be completed.'];
  }
  const capabilities = new Set(control.capabilities);
  const actions = AVAILABLE_ACTIONS
    .filter((action) => action.capabilities.some((capability) => capabilities.has(capability)))
    .map((action) => action.description);
  const lines = [
    '- Foliole tools are available through the self-describing `foliole` command; inspect `foliole help --json` when the included context is insufficient or the user requests a change.'
  ];
  if (actions.length > 0) lines.push(`- Available Foliole actions: ${actions.join('; ')}.`);
  if (hasWriteCapability(capabilities)) {
    lines.push('- Change Foliole data only when the user explicitly requests that product action. Preserve backup and conflict evidence returned by the action.');
    lines.push('- Use soft delete and restore for removal workflows; permanent deletion is unavailable.');
  }
  lines.push(...formatActiveContextGuidance(context, capabilities));
  return lines;
}

const AVAILABLE_ACTIONS = [
  { capabilities: ['materials.search'], description: 'search Topics and Folders' },
  { capabilities: ['materials.read'], description: 'read a Topic or Folder' },
  { capabilities: ['materials.listChildren'], description: 'list Folder contents' },
  { capabilities: ['materials.create'], description: 'create a Topic or Folder' },
  { capabilities: ['materials.update'], description: 'update a Topic' },
  { capabilities: ['materials.move'], description: 'move a Topic or Folder' },
  { capabilities: ['materials.reorder'], description: 'reorder Folder contents' },
  { capabilities: ['materials.deleteSoft', 'materials.restore'], description: 'move materials to trash or restore them' },
  { capabilities: ['virtualFolders.list', 'virtualFolders.read'], description: 'list or read virtual Folders' },
  { capabilities: ['virtualFolders.create', 'virtualFolders.update'], description: 'create or update a virtual Folder' },
  { capabilities: ['virtualFolders.addItems', 'virtualFolders.removeItems', 'virtualFolders.reorder'], description: 'manage virtual Folder items' },
  { capabilities: ['virtualFolders.deleteSoft', 'virtualFolders.restore'], description: 'move virtual Folders to trash or restore them' }
];

function hasWriteCapability(capabilities: Set<string>) {
  return [...capabilities].some((capability) =>
    capability.startsWith('materials.') && !READ_CAPABILITIES.has(capability) ||
    capability.startsWith('virtualFolders.') && !READ_CAPABILITIES.has(capability)
  );
}

const READ_CAPABILITIES = new Set([
  'materials.listChildren', 'materials.read', 'materials.search',
  'virtualFolders.list', 'virtualFolders.read'
]);

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
