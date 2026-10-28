import { ChangeSet, Text } from '@codemirror/state';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { releaseLocalEditBase, retainLocalEditBase } from '../../../../../lib/core/sync/nodeVersionLocalEditHold';
import { getEditorTextHistorySource } from '../../../../features/editor/model/editorNativeOperationHistory';
import type { EditorOperationHistoryState, EditorTextHistoryInput } from '../../../../features/editor/model/editorOperationHistory';
import { readIosCompanionDatabase } from '../runtime/iosCompanionActiveDatabase';
import { getIosCompanionDatabaseOwner } from '../runtime/iosCompanionDatabaseBootstrap';

import { readCompanionSessionHistory, stageCompanionSessionHistory } from './companionEditHistorySession';

const holdKey = (documentId: string, version: string, body: boolean) =>
  `${body ? 'editor_history_body' : 'editor_history'}:${documentId}:${version}`;

export function retainCompanionEditHistoryBase(db: DbPort, documentId: string, nodeId: string, versionId: string) {
  return retainLocalEditBase(db, { holdId: holdKey(documentId, versionId, true), nodeId, versionId });
}

export async function readCompanionEditHistoryFromDb(db: DbPort) {
  return readCompanionSessionHistory(db);
}

export function loadCompanionEditHistory() {
  return readIosCompanionDatabase(readCompanionEditHistoryFromDb);
}

function retainedVersions(history: EditorOperationHistoryState) {
  const versions = new Map<string, { nodeId: string; versionId: string }>();
  for (const session of Object.values(history.sessionsByNodeId)) {
    for (const entry of [...(session?.undoStack ?? []), ...(session?.redoStack ?? [])]) {
      if (entry.type === 'text.edit') {
        if (entry.target) for (const version of [entry.target.beforeVersionId, entry.target.afterVersionId]) {
          versions.set(holdKey(entry.nodeId, version, false), { nodeId: entry.target.nodeId, versionId: version });
        }
      } else for (const annotation of entry.annotations) {
        for (const version of [annotation.beforeVersionId, annotation.afterVersionId]) {
          if (version) versions.set(holdKey(entry.nodeId, version, true), { nodeId: annotation.nodeId, versionId: version });
        }
      }
    }
  }
  return versions;
}

export async function writeCompanionEditHistory(db: DbPort,
  before: EditorOperationHistoryState, after: EditorOperationHistoryState) {
  const previous = retainedVersions(before);
  const next = retainedVersions(after);
  for (const [holdId, { nodeId, versionId }] of next) {
    if (!previous.has(holdId)) await retainLocalEditBase(db, { holdId, nodeId, versionId });
  }
  for (const [holdId, { nodeId }] of previous) {
    if (!next.has(holdId)) await releaseLocalEditBase(db, holdId, nodeId);
  }
  stageCompanionSessionHistory(db, after);
}

export function syntheticTextHistory(documentId: string, before: string, after: string): EditorTextHistoryInput {
  const changes = ChangeSet.of({ from: 0, to: before.length, insert: after }, before.length);
  const selection = { mainIndex: 0, ranges: [{ anchor: 0, head: 0 }] };
  return { nodeId: documentId, type: 'text.input', title: 'Edit Text', timestamp: Date.now(), userEvent: 'input.replace',
    beforeSelection: selection, afterSelection: selection, changes, beforeDoc: Text.of(before.split('\n')) };
}

export function companionTextHistorySource(editorNodeId: string | null, field: 'content' | 'reveal') {
  if (!editorNodeId) return null;
  const nodeId = field === 'reveal' ? editorNodeId.slice(0, -'::answer'.length) : editorNodeId;
  const history = getIosCompanionDatabaseOwner().getEditingHistory();
  const source = getEditorTextHistorySource(history, nodeId, { nodeId, field })!;
  return { ...source, boundary: history.sessionsByNodeId[nodeId]?.externalTextBoundary ?? null };
}
