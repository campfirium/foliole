import type { NativeAssistantWorkspaceContext } from '../../lib/platform/nativeAssistantContract.js';

export function formatAgentControlContext(context: NativeAssistantWorkspaceContext) {
  const control = context.agentControl;
  if (!control) return [];
  if (control.state !== 'running') {
    return ['- Foliole tools are unavailable for this turn; say when the requested information or change cannot be completed.'];
  }
  const capabilities = new Set(control.capabilities);
  const actions = ACTIONS
    .filter((action) => action.capabilities.some((capability) => capabilities.has(capability)))
    .map((action) => action.description);
  const canWrite = WRITE_CAPABILITIES.some((capability) => capabilities.has(capability));
  const lines = [canWrite
    ? '- Foliole tools can read and update the workspace for this turn; use them to complete requested changes.'
    : '- Read-only Foliole tools are available for this turn; use them when the included context is insufficient.'];
  if (actions.length > 0) lines.push(`- Available Foliole actions: ${actions.join('; ')}.`);
  if (capabilities.has('materials.create')) {
    lines.push('- Create an Item only when the user explicitly asks to create or save it; never save ordinary chat answers or create Items in batches automatically.');
  }
  lines.push(...formatActiveContextGuidance(context, capabilities));
  return lines;
}

const ACTIONS = [
  { capabilities: ['materials.search'], description: 'search Topics and Folders' },
  { capabilities: ['materials.read'], description: 'read a Topic, Folder, or Item' },
  { capabilities: ['materials.listChildren'], description: 'list Folder contents' },
  { capabilities: ['virtualFolders.list', 'virtualFolders.read'], description: 'list or read virtual Folders' },
  { capabilities: ['materials.create'], description: 'create a Topic, Folder, or explicitly requested question-answer Item' },
  { capabilities: ['materials.update'], description: 'update a Topic or Item' },
  { capabilities: ['materials.move', 'materials.reorder'], description: 'move or reorder Topics, Folders, and Items' },
  { capabilities: ['materials.deleteSoft', 'materials.restore'], description: 'move materials to trash or restore them' },
  { capabilities: ['virtualFolders.create', 'virtualFolders.update'], description: 'create or rename virtual Folders' },
  { capabilities: ['virtualFolders.addItems', 'virtualFolders.removeItems', 'virtualFolders.reorder'], description: 'change virtual Folder contents' },
  { capabilities: ['virtualFolders.deleteSoft', 'virtualFolders.restore'], description: 'move virtual Folders to trash or restore them' },
];

const WRITE_CAPABILITIES = [
  'materials.create', 'materials.update', 'materials.move', 'materials.reorder',
  'materials.deleteSoft', 'materials.restore', 'virtualFolders.create', 'virtualFolders.update',
  'virtualFolders.addItems', 'virtualFolders.removeItems', 'virtualFolders.reorder',
  'virtualFolders.deleteSoft', 'virtualFolders.restore'
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
