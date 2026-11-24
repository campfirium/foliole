import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton, SettingsControlSlot, SettingsRow, SettingsSection } from '../../../shared/ui';

import { SuperMemoLoadNotice } from './SuperMemoLoadNotice';
import { superMemoNoticeKind } from './superMemoNotice';
import type { useSuperMemoDraft } from './useSuperMemoDraft';

const sourceRowLayout = 'items-center !px-0 before:!inset-x-0 max-[1080px]:flex-row max-[1080px]:items-center';
const sourceControlLayout = 'max-[1080px]:w-auto max-[1080px]:flex-none';

export function SuperMemoLoadPage({ model, onLoad, onLoadNew }: {
  model: ReturnType<typeof useSuperMemoDraft>; onLoad(): void; onLoadNew(): void;
}) {
  const t = useTranslation();
  const { busy, loadingXml, retryAsUpdate, selection, error, candidates, setError, recoverCollection, retrySource, pairCollection } = model;
  const collectionDirectory = selection?.collectionDirectory;
  return (
    <>
      <SettingsSection className="mb-0 !pt-0 before:!hidden">
        <SettingsRow className={sourceRowLayout} title={t('desktop.superMemoDrafts.xmlExportFile')}
          description={selection ? <span className="block break-all">{selection.filePath}</span>
            : t('desktop.superMemoDrafts.exportAllElements')}>
          <SettingsControlSlot className={sourceControlLayout}>
            <div className="flex flex-wrap justify-end gap-2">
              {selection ? <AppButton disabled={busy} loading={loadingXml && retryAsUpdate} onClick={onLoadNew}>
                {t('desktop.superMemoDrafts.loadNewExport')}
              </AppButton> : null}
              <AppButton disabled={busy} loading={loadingXml && !retryAsUpdate} onClick={onLoad}>
                {t(selection ? 'desktop.superMemoDrafts.changeSource' : 'desktop.superMemoDrafts.loadSource')}
              </AppButton>
            </div>
          </SettingsControlSlot>
        </SettingsRow>
        <SettingsRow className={sourceRowLayout} title={t('desktop.superMemoDrafts.originalCollectionFolder')}
          description={collectionDirectory ? <span className="block break-all">{collectionDirectory}</span>
            : t(selection ? 'desktop.superMemoDrafts.sourceXmlOnly' : 'desktop.superMemoDrafts.keepCollectionNearby')}>
          {!error ? <SettingsControlSlot className={sourceControlLayout}>
            <AppButton disabled={busy || !model.draft}
              onClick={() => void pairCollection()}>
              {t(collectionDirectory ? 'desktop.superMemoDrafts.replaceCollection' : 'desktop.superMemoDrafts.chooseCollection')}
            </AppButton>
          </SettingsControlSlot> : null}
        </SettingsRow>
      </SettingsSection>
      <SuperMemoLoadNotice inline reload={retryAsUpdate} error={superMemoNoticeKind(error) === 'xmlUpdated' ? false : error} {...{ busy, candidates }} onClose={() => setError(false)}
        recover={choice => void recoverCollection(choice)} retry={() => void retrySource()} />
    </>
  );
}
