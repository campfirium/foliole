import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, SettingsControlSlot, SettingsRow, SettingsSection } from '../../../shared/ui';

import { SuperMemoBatchAdjustments } from './SuperMemoBatchAdjustments';
import { SuperMemoLoadNotice } from './SuperMemoLoadNotice';
import type { useSuperMemoDraft } from './useSuperMemoDraft';

const sourceRowLayout = 'items-center !px-0 before:!inset-x-0 max-[1080px]:flex-row max-[1080px]:items-center';
const sourceControlLayout = 'max-[1080px]:w-auto max-[1080px]:flex-none';

export function SuperMemoLoadPage({ model, onLoad, onLoadNew }: {
  model: ReturnType<typeof useSuperMemoDraft>; onLoad(): void; onLoadNew(): void;
}) {
  const t = useTranslation();
  const { busy, selection, error, candidates, setError, recoverCollection, retrySource, pairCollection } = model;
  const update = model.draft?.preview.directoryUpdate;
  const collectionDirectory = selection?.collectionDirectory;
  const collectionName = collectionDirectory?.split(/[/\\]/u).at(-1) || collectionDirectory;
  return (
    <>
      <SettingsSection className="mb-0 !pt-0 before:!hidden">
        <SettingsRow className={sourceRowLayout} title={t('desktop.superMemoDrafts.xmlExportFile')}
          description={<>
            {selection ? <span className="block break-words" title={selection.filePath}>{selection.name.replace(/\.xml$/iu, '') || selection.name}</span> : null}
            {selection?.panel?.elementCount !== undefined ? <span className="block">
              {t('desktop.superMemoDrafts.lastSourceCount', { count: selection.panel.elementCount })}
            </span> : null}
            {selection?.panel?.result ? <span className="block">
              {t('desktop.superMemoDrafts.lastResult', selection.panel.result)}
            </span> : null}
            {t(selection?.hasDraft === false ? 'desktop.superMemoDrafts.createSavedDraft' : 'desktop.superMemoDrafts.exportAllElements')}
          </>}>
          <SettingsControlSlot className={sourceControlLayout}>
            <AppButton disabled={busy} onClick={onLoad}>
              {t(selection ? 'desktop.superMemoDrafts.reloadSource' : 'desktop.superMemoDrafts.loadSource')}
            </AppButton>
          </SettingsControlSlot>
        </SettingsRow>
        <SettingsRow className={sourceRowLayout} title={t('desktop.superMemoDrafts.originalCollectionFolder')}
          description={collectionName ? <span className="break-words" title={collectionDirectory}>{collectionName}</span>
            : t(selection ? 'desktop.superMemoDrafts.sourceXmlOnly' : 'desktop.superMemoDrafts.keepCollectionNearby')}>
          {!error ? <SettingsControlSlot className={sourceControlLayout}>
            <AppButton disabled={busy || !model.draft}
              onClick={() => void pairCollection()}>
              {t(collectionDirectory ? 'desktop.superMemoDrafts.replaceCollection' : 'desktop.superMemoDrafts.chooseCollection')}
            </AppButton>
          </SettingsControlSlot> : null}
        </SettingsRow>
        {selection ? <div className="flex flex-wrap gap-2 py-2">
          <AppButton variant="ghost" disabled={busy} onClick={() => void model.removeSelection()}>
            {t('desktop.superMemoDrafts.removeSelection')}
          </AppButton>
        </div> : null}
      </SettingsSection>
      <SuperMemoLoadNotice inline error={error === 'xmlUpdated' ? false : error} {...{ busy, candidates }} onClose={() => setError(false)}
        recover={choice => void recoverCollection(choice)} retry={() => void retrySource()} />
      {update ? <p>{t('desktop.superMemoDrafts.existingBatch')}</p> : null}
      {update ? <AppButton className="self-start" disabled={busy} onClick={onLoadNew}>{t('desktop.superMemoDrafts.loadNewExport')}</AppButton> : null}
      {!busy ? <SuperMemoBatchAdjustments preferredBatchId={selection?.panel?.batchId} /> : null}
    </>
  );
}
