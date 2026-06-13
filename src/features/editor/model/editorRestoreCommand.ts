import type { EditorSelection, EditorViewportMode } from '../adapters/EditorAdapter';

export type EditorRestoreSelectionMode = 'caret' | 'range';

export interface ReadingPositionRestoreCommand {
  commandId: string;
  nodeId: string | null;
  reason: string;
  selection: EditorSelection | null;
  selectionMode?: EditorRestoreSelectionMode;
  startedAt: number;
  scrollTop?: number;
  targetViewportMode?: EditorViewportMode;
  targetViewportRatio?: number;
}

const COMMAND_KEY_PREFIX = 'command:';

export function createEditorRestoreCommandKey(commandId: string) {
  return `${COMMAND_KEY_PREFIX}${commandId}`;
}

export function readEditorRestoreCommandIdFromKey(key: string | null) {
  if (!key?.startsWith(COMMAND_KEY_PREFIX)) {
    return null;
  }
  return key.slice(COMMAND_KEY_PREFIX.length);
}
