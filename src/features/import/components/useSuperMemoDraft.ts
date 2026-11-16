import { useState } from 'react';

import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { DEFAULT_SUPER_MEMO_SOURCE_FORMAT, type SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import { previewRuntimeSuperMemoImport, runRuntimeSuperMemoImport, saveSuperMemoGradeMap,
  selectRuntimeSuperMemoSource } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

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
  const [draft, setDraft] = useState<Awaited<ReturnType<typeof previewRuntimeSuperMemoImport>>>();
  const [gradeMap, setGradeMap] = useState(initialGrades);
  const [sourceFormat, setSourceFormat] = useState<SuperMemoSourceFormat>({ ...DEFAULT_SUPER_MEMO_SOURCE_FORMAT, placement: 'topic-info' });
  const [percent, setPercent] = useState(0);
  const [source, setSource] = useState<NonNullable<Awaited<ReturnType<typeof selectRuntimeSuperMemoSource>>>>();
  const [result, setResult] = useState<Awaited<ReturnType<typeof runRuntimeSuperMemoImport>>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<boolean | 'xml-only'>(false);

  async function loadSource() {
    setBusy(true);
    setError(false);
    try {
      const selected = await selectRuntimeSuperMemoSource();
      if (!selected) return;
      const loaded = await loadDraftWithSavedFormat(selected, gradeMap, sourceFormat);
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

  async function changeGrades(next: SuperMemoGradeMap) {
    setBusy(true);
    setError(false);
    try {
      const nextPreview = source && !result ? await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, next, sourceFormat) : undefined;
      await saveSuperMemoGradeMap(next);
      setGradeMap(next);
      if (nextPreview) setDraft(nextPreview);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const changeSourceFormat = (next: SuperMemoSourceFormat) => refreshSourceFormat(async () => {
    if (source && !result) setDraft(await previewRuntimeSuperMemoImport(source.xml, source.collectionDirectory, gradeMap, next));
    setSourceFormat(next);
  }, setBusy, setError);

  async function importSource(withdrawSourceIds: number[]) {
    if (!source || !draft?.preview.previewSignature) return;
    setBusy(true);
    setError(false);
    try {
      setResult(await runRuntimeSuperMemoImport(source.filePath, percent, gradeMap, draft.preview.previewSignature, sourceFormat,
        draft.preview.directoryUpdate?.signature, withdrawSourceIds));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return { draft, percent, setPercent, source, busy, error, setError, result, gradeMap, changeGrades, sourceFormat, changeSourceFormat, loadSource, importSource };
}
