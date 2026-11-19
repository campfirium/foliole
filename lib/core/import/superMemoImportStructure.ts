import type { NativeSuperMemoPreviewRow as Row, SuperMemoFolderChoice } from '../../platform/nativeSuperMemoImportContract.js';
import { canCreateChildNodeKind } from '../nodes/folderTopicItemCommands.js';

import { convertSuperMemoContent } from './superMemoContent.js';
import type { SuperMemoXmlDraftElement } from './superMemoXmlDraft.js';

export function isSuperMemoCollectionRoot(element: SuperMemoXmlDraftElement) {
  return element.parentId === null && element.ordinal === '0' && !element.title && element.children.length > 0 &&
    element.sourceType === 'Topic';
}

function hasSourceBody(element: SuperMemoXmlDraftElement) {
  return [...element.bodyOrQuestionHtml, ...element.answerHtml].some(part => {
    const body = convertSuperMemoContent([part]);
    return body.content || body.localImages || body.remoteImages || body.audio;
  }) || element.skippedAudioComponents > 0;
}

export function isSuperMemoFolderCandidate(row: Row, hasChildren: boolean, hasBody: boolean | undefined) {
  return row.sourceType === 'Topic' && hasChildren && hasBody === false &&
    (row.sourceState == null || row.sourceState === 'dismissed');
}

export function defaultSuperMemoFolder(row: Row, hasChildren: boolean, hasBody: boolean | undefined) {
  return row.sourceType === 'Concept' || isSuperMemoFolderCandidate(row, hasChildren, hasBody);
}

export function applySuperMemoFolderDisplay(row: Row, folder: boolean | undefined): Row {
  if (folder === undefined || !row.structure?.editable) return row;
  return { ...row, outcome: folder ? 'folder' : 'topic',
    structure: { ...row.structure, folderBody: folder && Boolean(row.structure.sourceHasBody) } };
}

export function applySuperMemoStructure(rows: Row[], elements: SuperMemoXmlDraftElement[], choices: SuperMemoFolderChoice[], saved = false) {
  const overrides = new Map(choices.map(choice => [choice.id, choice.folder]));
  const resolved = new Map<number, Row>();
  const wrapper = elements.find(isSuperMemoCollectionRoot)?.id;
  const sources = new Map(elements.map(element => [element.id, element]));
  for (const row of rows) {
    const source = sources.get(row.id)!;
    const hasBody = row.structure?.sourceHasBody ??
      ((row.sourceType === 'Concept' || row.sourceType === 'Topic') && hasSourceBody(source));
    const concept = row.sourceType === 'Concept';
    const editable = concept || (row.sourceType === 'Topic' && !hasBody && row.id !== wrapper);
    const folder = editable && (overrides.get(row.id) ?? defaultSuperMemoFolder(row, source.children.length > 0, hasBody));
    const outcome = folder ? 'folder' : concept || row.sourceType === 'Topic' ? 'topic' : row.outcome;
    const parentId = resolveDestination(row, outcome, resolved, wrapper);
    resolved.set(row.id, {
      ...row, outcome, issue: row.sourceType === 'Topic' ? null : row.issue,
      structure: { parentId, editable, folderBody: folder && hasBody, sourceHasBody: hasBody }
    });
  }
  for (const id of overrides.keys()) {
    if (!saved && !resolved.get(id)?.structure?.editable) throw new Error('invalid_supermemo_folder_choice');
  }
  return [...resolved.values()];
}

function resolveDestination(row: Row, outcome: Row['outcome'], resolved: ReadonlyMap<number, Row>, wrapper?: number) {
  for (let id = row.parentId; id !== null;) {
    if (id === wrapper) return null;
    const candidate = resolved.get(id)!;
    if (candidate.outcome !== 'skipped' && outcome !== 'skipped' && canCreateChildNodeKind(candidate.outcome, outcome)) return id;
    id = candidate.parentId;
  }
  return null;
}
