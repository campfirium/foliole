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

export function SuperMemoLoadPage({ model, onLoad, onLoadNew }: {
  model: ReturnType<typeof useSuperMemoDraft>; onLoad(): void; onLoadNew(): void;
}) {
  const t = useTranslation();
  const { busy, source, error, candidates, setError, recoverCollection, retrySource, pairCollection } = model;
  const update = model.draft?.preview.directoryUpdate;
  const sourceStatus = source?.collectionDirectory ? 'sourcePaired' : 'sourceXmlOnly';
  return (
    <>
      <section className="space-y-3 rounded-lg border border-settings-divider p-4">
        <h4 className="text-sm font-semibold">{t('desktop.superMemoDrafts.sourceTitle')}</h4>
        {source ? <div className="space-y-1 text-sm">
          <p className="text-xs text-foreground/70">{t('desktop.superMemoDrafts.lastLoadedExport')}</p>
          <p className="break-all font-medium">{source.name}</p>
          <p className="break-all text-xs text-foreground/70">{source.filePath}</p>
          <p>{t(`desktop.superMemoDrafts.${sourceStatus}`)}</p>
          {source.collectionDirectory ? <p className="break-all text-xs text-foreground/70">{source.collectionDirectory}</p> : null}
        </div> : <p className="text-sm text-foreground/75">{t('desktop.superMemoDrafts.description')}</p>}
        <div className="flex flex-wrap gap-2">
          <AppButton disabled={busy} onClick={onLoad}>
            {t(source ? 'desktop.superMemoDrafts.reloadSource' : 'desktop.superMemoDrafts.loadSource')}
          </AppButton>
          {source && !source.collectionDirectory && !error ? (
            <AppButton disabled={busy} onClick={() => void pairCollection()}>{t('desktop.superMemoDrafts.chooseCollection')}</AppButton>
          ) : null}
        </div>
      </section>
      <SuperMemoLoadNotice inline {...{ error, busy, candidates }} onClose={() => setError(false)}
        recover={choice => void recoverCollection(choice)} retry={() => void retrySource()} />
      <ExportGuide expanded={!source} />
      {update ? <p>{t('desktop.superMemoDrafts.existingBatch')}</p> : null}
      {update ? <AppButton className="self-start" disabled={busy} onClick={onLoadNew}>{t('desktop.superMemoDrafts.loadNewExport')}</AppButton> : null}
      {!busy ? <SuperMemoBatchAdjustments /> : null}
    </>
  );
}
