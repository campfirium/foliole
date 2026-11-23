import {
  AIDE_READ_SCOPE_KEYS,
  AIDE_WRITE_TOOL_KEYS,
  type AideReadScopeKey,
  type AideToolPermissionSettings,
  type AideWriteToolKey
} from '../../lib/core/assistant/aideToolPermissionSettings.js';

// Names match the AI permissions settings, so the model can answer "what can you read or change" in the person's terms.
const READ_PLACES: Record<AideReadScopeKey, string> = {
  baseTopic: 'Its base topic and derived materials (the whole Base Topic of each current material)',
  current: 'Current material (materials linked to this conversation and the one open in the window)',
  dives: 'Dives (the Dives that hold a current material, and their sources)',
  external: 'External (documents outside the library that Foliole searches; read them with read_external_document)',
  folder: 'Folders (the top-level Folder each current material sits in)',
  home: 'Home (the whole library outside Virtual, Dives and Trash)',
  trash: 'Trash',
  virtual: 'Virtual (the indexes that hold a current material, and the Topics they list)'
};

const CHANGES: Record<AideWriteToolKey, string> = {
  createExcerpt: 'create excerpts',
  createMaterial: 'create Folders, Topics and Items',
  editContent: 'edit content',
  manageDives: 'manage Dives',
  manageIndexes: 'manage Virtual indexes',
  moveAndOrder: 'move and reorder',
  trash: 'move to and restore from Trash'
};

export function formatAidePermissionContext(permissions: AideToolPermissionSettings | undefined) {
  if (!permissions) return [];
  const open = AIDE_READ_SCOPE_KEYS.filter((key) => permissions.read[key]);
  const closed = AIDE_READ_SCOPE_KEYS.filter((key) => !permissions.read[key]);
  const allowed = AIDE_WRITE_TOOL_KEYS.filter((key) => permissions.write[key]).map((key) => CHANGES[key]);
  const refused = AIDE_WRITE_TOOL_KEYS.filter((key) => !permissions.write[key]).map((key) => CHANGES[key]);
  return [
    '- AI permissions set by the person for this reply (read places let you find and read in full; tools refuse anything outside them with outside_read_scope):',
    `  - Readable places: ${open.length ? open.map((key) => READ_PLACES[key]).join('; ') : 'none'}.`,
    ...(closed.length ? [`  - Switched off: ${closed.map((key) => READ_PLACES[key].replace(/ \(.*\)$/u, '')).join(', ')}.`] : []),
    `  - Changes allowed: ${allowed.length ? allowed.join(', ') : 'none'}${permissions.askBeforeWrite ? ', each after the person confirms it' : ''}.`,
    ...(refused.length ? [`  - Changes switched off: ${refused.join(', ')}.`] : []),
    `  - Reading is limited to about ${permissions.readBudget} tokens per reply.`,
    '- When asked what you can read or change, answer from these permissions in their names; say a switch is off rather than guessing.'
  ];
}
