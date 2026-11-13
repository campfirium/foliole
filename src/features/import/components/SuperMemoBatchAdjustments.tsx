import { useEffect, useState } from 'react';

import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { adjustRuntimeSuperMemoImport, listRuntimeSuperMemoImports, previewRuntimeSuperMemoAdjustment } from '../../../shared/platform/import/superMemoImportRuntimeRepository';
import { AppButton } from '../../../shared/ui';

import { SuperMemoPreviewOptionFields } from './SuperMemoPreviewOptions';

type Batch = Awaited<ReturnType<typeof listRuntimeSuperMemoImports>>[number];

function useAdjustmentPreview(selected: Batch | undefined, percent: number, setError: (value: boolean) => void) {
  const [preview, setPreview] = useState<{ updated: number; protectedItems: number }>();
  useEffect(() => {
    setPreview(undefined);
    if (!selected || selected.percent === percent) return;
    let active = true;
    void previewRuntimeSuperMemoAdjustment(selected.batchId, percent).then(value => {
      if (active) setPreview(value);
    }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [selected, percent, setError]);
  return preview;
}

export function SuperMemoBatchAdjustments() {
  const t = useTranslation();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<Batch>();
  const [percent, setPercent] = useState(0);
  const [result, setResult] = useState<{ updated: number; protectedItems: number }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const preview = useAdjustmentPreview(selected, percent, setError);

  useEffect(() => {
    void listRuntimeSuperMemoImports().then(setBatches, () => setError(true));
  }, []);

  async function apply(batch: Batch) {
    setBusy(true);
    setError(false);
    try {
      const adjusted = await adjustRuntimeSuperMemoImport(batch.batchId, percent);
      setResult(adjusted);
      setSelected({ ...batch, percent: adjusted.percent });
      setBatches(previous => previous.map(entry => entry.batchId === batch.batchId
        ? { ...entry, percent: adjusted.percent } : entry));
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return <>
    {batches.length ? <label className="grid gap-1 text-sm">
      {t('desktop.superMemoDrafts.batch')}
      <select value={selected?.batchId ?? ''} disabled={busy} onChange={event => {
        const batch = batches.find(entry => entry.batchId === event.currentTarget.value);
        setSelected(batch);
        setPercent(batch?.percent ?? 0);
        setResult(undefined);
      }}>
        <option value="">{t('desktop.superMemoDrafts.chooseBatch')}</option>
        {batches.map(batch => <option key={batch.batchId} value={batch.batchId}>
          {t('desktop.superMemoDrafts.batchOption', { id: batch.batchId.slice(0, 8), count: batch.imported })}
        </option>)}
      </select>
    </label> : null}
    {selected ? <>
      <SuperMemoPreviewOptionFields percent={percent} onChange={setPercent} />
      {preview ? <p>{t('desktop.superMemoDrafts.adjustPreview', preview)}</p> : null}
      <AppButton disabled={busy || !preview} onClick={() => void apply(selected)}>
        {t('desktop.superMemoDrafts.apply')}
      </AppButton>
    </> : null}
    {error ? <p role="alert">{t('desktop.superMemoDrafts.adjustFailed')}</p> : null}
    {result ? <p role="status">{t('desktop.superMemoDrafts.adjustResult', result)}</p> : null}
  </>;
}
