import { useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, type SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import { previewRuntimeSuperMemoImport, runRuntimeSuperMemoImport, saveSuperMemoGradeMap,
  selectRuntimeSuperMemoSource, type SuperMemoUpdateTarget } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

async function refreshSourceFormat(apply: () => Promise<void>, setBusy: (value: boolean) => void,
  setError: (value: boolean) => void) {
  setBusy(true);
  setError(false);
  try {
    await apply();
  } catch {
    setError(true);
  } finally {
    setBusy(false);
  }
}

async function loadDraftWithSavedFormat(selected: NonNullable<Awaited<ReturnType<typeof selectRuntimeSuperMemoSource>>>,
  gradeMap: SuperMemoGradeMap, sourceFormat: SuperMemoSourceFormat) {
  const first = await previewRuntimeSuperMemoImport(selected.xml, selected.collectionDirectory, gradeMap, sourceFormat);
  const savedFormat = first.preview.directoryUpdate?.sourceFormat;
  const loaded = savedFormat && (savedFormat.placement !== sourceFormat.placement || savedFormat.template !== sourceFormat.template)
    ? await previewRuntimeSuperMemoImport(selected.xml, selected.collectionDirectory, gradeMap, savedFormat) : first;
  return { draft: loaded, sourceFormat: savedFormat ?? sourceFormat };
}

export function useSuperMemoDraft(initialGrades: SuperMemoGradeMap) {
  const [target, setTarget] = useState<SuperMemoUpdateTarget>();
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof previewRuntimeSuperMemoImport>>>();
  const [gradeMap, setGradeMap] = useState(initialGrades);
  const [sourceFormat, setSourceFormat] = useState<SuperMemoSourceFormat>({ ...DEFAULT_SUPER_MEMO_SOURCE_FORMAT, placement: 'topic-info' });
  const [percent, setPercent] = useState(0);
  const [source, setSource] = useState<NonNullable<Awaited<ReturnType<typeof selectRuntimeSuperMemoSource>>>>();
  const [result, setResult] = useState<Awaited<ReturnType<typeof runRuntimeSuperMemoImport>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<boolean | 'xml-only'>(false);

  async function loadSource(asUpdate = false) {
    setBusy(true);
    setError(false);
    try {
      const selected = await selectRuntimeSuperMemoSource();
      if (!selected) return;
      const update = draft?.preview.directoryUpdate;
      const nextTarget = asUpdate && update && draft
        ? target ?? { targetBatchId: update.batchId, ...(!update.sourceMatch ? { originalElements: draft.elements } : {}) } : undefined;
      const loaded = nextTarget
        ? { draft: await previewRuntimeSuperMemoImport(selected.xml, selected.collectionDirectory, gradeMap, sourceFormat, nextTarget), sourceFormat }
        : await loadDraftWithSavedFormat(selected, gradeMap, sourceFormat);
      setTarget(nextTarget);
      setSourceFormat(loaded.sourceFormat);
      setDraft(loaded.draft);
      setSource(selected);
      if (!selected.collectionDirectory) setError('xml-only');
      setPercent(0);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const changeGrades = (next: SuperMemoGradeMap) => refreshSourceFormat(async () => {
    const nextPreview = source && !result
      ? await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, next, sourceFormat, target) : undefined;
    await saveSuperMemoGradeMap(next);
    setGradeMap(next);
    if (nextPreview) setDraft(nextPreview);
  }, setBusy, setError);

  const changeSourceFormat = (next: SuperMemoSourceFormat) => refreshSourceFormat(async () => {
    if (source && !result) setDraft(await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, gradeMap, next, target));
    setSourceFormat(next);
  }, setBusy, setError);

  async function importSource(withdrawSourceIds: number[]) {
    if (!source || !draft?.preview.previewSignature) return;
    setBusy(true);
    setError(false);
    try {
      setResult(await runRuntimeSuperMemoImport(source.filePath, percent, gradeMap, draft.preview.previewSignature, sourceFormat,
        draft.preview.directoryUpdate?.signature, withdrawSourceIds, target));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return { draft, percent, setPercent, source, busy, error, setError, result, gradeMap, changeGrades, sourceFormat, changeSourceFormat, loadSource, importSource };
}
