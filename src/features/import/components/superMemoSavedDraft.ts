import { applySuperMemoFolderDisplay, defaultSuperMemoFolder } from '../../../../lib/core/import/superMemoImportStructure';
import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, type SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import type { RememberedSuperMemoSource, SuperMemoMigrationForm, SuperMemoMigrationSnapshot, SuperMemoSourceLink, SuperMemoSourceSelection } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { previewRuntimeSuperMemoImport, saveRuntimeSuperMemoSourceLink } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

import type { DraftState } from './useSuperMemoDraft';

export const mappedSourceFormat: SuperMemoSourceFormat = { ...DEFAULT_SUPER_MEMO_SOURCE_FORMAT, referenceMap: {} };

type DraftSetters = Pick<DraftState, 'setRemembered' | 'setPercent' | 'setSourceFormat' | 'setGradeMap' |
  'setTarget' | 'setSource' | 'setDraft'>;

export function restoreSuperMemoDraft(state: DraftSetters, selection: RememberedSuperMemoSource, initialGrades: SuperMemoGradeMap) {
  const { elements, preview } = selection.snapshot;
  const { percent, sourceFormat, gradeMap, comparison, folderChoices = [] } = selection.savedForm;
  const overrides = new Map(folderChoices.map(choice => [choice.id, choice.folder]));
  const parents = new Set(elements.filter(element => element.children?.length).map(element => element.id));
  const rows = preview.directoryUpdate ? preview.rows : preview.rows.map(row =>
    applySuperMemoFolderDisplay(row, overrides.get(row.id) ??
      defaultSuperMemoFolder(row, parents.has(row.id), row.structure?.sourceHasBody)));

  state.setRemembered(selection);
  state.setPercent(percent);
  state.setSourceFormat(preview.directoryUpdate || sourceFormat.referenceMap ? sourceFormat : mappedSourceFormat);
  state.setGradeMap(gradeMap ?? initialGrades);
  state.setTarget(comparison
    ? { targetBatchId: comparison.batchId, originalFilePath: comparison.originalFilePath }
    : undefined);
  state.setSource({ ...selection, xml: '' });
  state.setDraft({ preview: { ...preview, rows }, elements: elements.map(element => ({
    ...element, bodyOrQuestionHtml: [], answerHtml: []
  })), folderChoices });
}

export async function rememberDraftSource(source: SuperMemoSourceSelection, form: SuperMemoMigrationForm, formOnly: boolean, panel?: SuperMemoSourceLink['panel'], snapshot?: SuperMemoMigrationSnapshot, xmlHash?: string) {
  const link = { filePath: source.filePath, collectionDirectory: source.collectionDirectory ?? null,
    ...form, ...(panel ? { panel } : {}) };
  try {
    await saveRuntimeSuperMemoSourceLink(link, formOnly, snapshot, xmlHash);
  } catch (error) {
    throw new Error('supermemo_link_save_failed', { cause: error });
  }
}

export function migrationSnapshot({ elements, preview }: Awaited<ReturnType<typeof previewRuntimeSuperMemoImport>>): SuperMemoMigrationSnapshot {
  const structuralElements = elements.map(({ id, parentId, children, sourceType, title, ordinal, skippedAudioComponents, learning }) =>
    ({ id, parentId, children, sourceType, title, ordinal, skippedAudioComponents, learning }));
  const rows = preview.rows.map(row => {
    const structuralRow = { ...row };
    delete structuralRow.sourceExample;
    return structuralRow;
  });
  return { elements: structuralElements, preview: { ...preview, rows } };
}
