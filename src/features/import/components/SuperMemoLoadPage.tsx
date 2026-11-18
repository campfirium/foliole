import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton } from '../../../shared/ui';

import { SuperMemoBatchAdjustments } from './SuperMemoBatchAdjustments';
import { SuperMemoLoadNotice } from './SuperMemoLoadNotice';
import type { useSuperMemoDraft } from './useSuperMemoDraft';

function ExportGuide({ expanded }: { expanded: boolean }) {
  const t = useTranslation();
  return (
    <details open={expanded} className="rounded-lg border border-settings-divider p-4 text-sm">
      <summary className="cursor-pointer font-semibold">{t('desktop.superMemoDrafts.prepareTitle')}</summary>
      <ol className="mt-3 max-w-prose list-decimal space-y-2 pl-5 text-foreground/75">
        <li>{t('desktop.superMemoDrafts.exportAllElements')}</li>
        <li>{t('desktop.superMemoDrafts.keepCollectionNearby')}</li>
        <li>{t('desktop.superMemoDrafts.chooseXmlAndCollection')}</li>
      </ol>
    </details>
  );
}

export function SuperMemoLoadPage({ model, onLoad, onLoadNew, onViewSource }: {
  model: ReturnType<typeof useSuperMemoDraft>; onLoad(): void; onLoadNew(): void; onViewSource(): void;
}) {
  const t = useTranslation();
  const { busy, source, selection, error, candidates, setError, recoverCollection, retrySource, pairCollection } = model;
  const update = model.draft?.preview.directoryUpdate;
  const sourceStatus = selection?.collectionDirectory ? 'sourcePaired' : 'sourceXmlOnly';
  return (
    <>
      <section className="space-y-3 rounded-lg border border-settings-divider p-4">
        <h4 className="text-sm font-semibold">{t('desktop.superMemoDrafts.sourceTitle')}</h4>
        {selection ? <div className="space-y-1 text-sm">
          <p className="text-xs text-foreground/70">{t('desktop.superMemoDrafts.lastLoadedExport')}</p>
          <p className="break-all font-medium">{selection.name}</p>
          <p className="break-all text-xs text-foreground/70">{selection.filePath}</p>
          <p>{t(`desktop.superMemoDrafts.${sourceStatus}`)}</p>
          {selection.panel?.elementCount !== undefined ? <p>
            {t('desktop.superMemoDrafts.lastSourceCount', { count: selection.panel.elementCount })}
          </p> : null}
          {selection.panel?.result ? <p>
            {t('desktop.superMemoDrafts.lastResult', selection.panel.result)}
          </p> : null}
          {selection.collectionDirectory ? <p className="break-all text-xs text-foreground/70">{selection.collectionDirectory}</p> : null}
        </div> : <p className="text-sm text-foreground/75">{t('desktop.superMemoDrafts.description')}</p>}
        <div className="flex flex-wrap gap-2">
          {selection && !model.draft ? <AppButton disabled={busy} onClick={onViewSource}>
            {t('desktop.superMemoDrafts.preparePreview')}
          </AppButton> : null}
          <AppButton disabled={busy} onClick={onLoad}>
            {t(selection ? 'desktop.superMemoDrafts.reloadSource' : 'desktop.superMemoDrafts.loadSource')}
          </AppButton>
          {source && model.draft && !source.collectionDirectory && !error ? (
            <AppButton disabled={busy} onClick={() => void pairCollection()}>{t('desktop.superMemoDrafts.chooseCollection')}</AppButton>
          ) : null}
          {selection ? <AppButton variant="ghost" disabled={busy} onClick={() => void model.removeSelection()}>
            {t('desktop.superMemoDrafts.removeSelection')}
          </AppButton> : null}
        </div>
      </section>
      <SuperMemoLoadNotice inline {...{ error, busy, candidates }} onClose={() => setError(false)}
        recover={choice => void recoverCollection(choice)} retry={() => void retrySource()} />
      <ExportGuide expanded={!selection} />
      {update ? <p>{t('desktop.superMemoDrafts.existingBatch')}</p> : null}
      {update ? <AppButton className="self-start" disabled={busy} onClick={onLoadNew}>{t('desktop.superMemoDrafts.loadNewExport')}</AppButton> : null}
      {!busy ? <SuperMemoBatchAdjustments preferredBatchId={selection?.panel?.batchId} /> : null}
    </>
  );
}
