import { useState } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME,
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsButton,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection
} from '../../../../shared/ui';
import {
  libraryMergeErrorKind,
  libraryMergeSourceIsArchive,
  libraryMergeSourceName,
  mergeLibrary,
  pickLibraryMergeAttachments,
  pickLibraryMergeSource,
  type LibraryMergeResult,
  type LibraryMergeSource
} from '../../model/libraryMerge';
import { SETTINGS_LIBRARY_MERGE_SEARCH_ROW_ID } from '../../model/settingsSearchRowCatalog';

type MergeStatus = { kind: 'done'; result: LibraryMergeResult } | { kind: 'failed'; message: string } | null;

function useLibraryMerge() {
  const t = useTranslation();
  const [source, setSource] = useState<LibraryMergeSource | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [status, setStatus] = useState<MergeStatus>(null);

  const chooseSource = () => {
    void pickLibraryMergeSource().then((picked) => {
      if (!picked) return;
      setSource(picked);
      setStatus(null);
    });
  };
  const chooseAttachments = () => {
    if (!source) return;
    void pickLibraryMergeAttachments(source.attachmentsDirectory).then((directory) => {
      if (directory) setSource({ ...source, attachmentsDirectory: directory });
    });
  };
  const merge = () => {
    if (!source) return;
    setIsMerging(true);
    setStatus(null);
    const folderTitle = t('settings.backups.merge.folderTitle', {
      date: new Date().toISOString().slice(0, 10),
      name: libraryMergeSourceName(source.sourcePath)
    });
    void mergeLibrary(source, folderTitle)
      .then((result) => setStatus({ kind: 'done', result }))
      .catch((error: unknown) => {
        const message = error instanceof Error && error.message.trim() ? error.message.trim() : '';
        const kind = libraryMergeErrorKind(message);
        setStatus({ kind: 'failed', message: kind === 'other' ? message : t(`settings.backups.merge.error.${kind}`) });
      })
      .finally(() => setIsMerging(false));
  };
  return { chooseAttachments, chooseSource, isMerging, merge, source, status };
}

function statusText(t: ReturnType<typeof useTranslation>, status: MergeStatus) {
  if (!status) return '';
  if (status.kind === 'failed') return t('settings.backups.merge.failed', { message: status.message });
  const { result } = status;
  return t('settings.backups.merge.result', {
    added: String(result.added),
    alternatives: String(result.alternatives),
    copied: String(result.attachmentsCopied),
    deleted: String(result.skippedDeleted),
    missing: String(result.attachmentsMissing),
    reviews: String(result.reviewsAdded),
    unchanged: String(result.unchanged)
  });
}

/** Merges another desktop library or backup, or a phone backup, into the open one. */
export function LibraryMergeSection(props: { isDesktopRuntime: boolean }) {
  const t = useTranslation();
  const merge = useLibraryMerge();
  const message = statusText(t, merge.status);
  const sourceLine = merge.source
    ? t('settings.backups.merge.source', { name: libraryMergeSourceName(merge.source.sourcePath) })
    : t('settings.backups.merge.noSource');
  const isArchive = merge.source ? libraryMergeSourceIsArchive(merge.source.sourcePath) : false;
  return (
    <SettingsSection
      ariaLabel={t('settings.backups.merge.sectionAria')}
      searchRowId={SETTINGS_LIBRARY_MERGE_SEARCH_ROW_ID}
      title={t('settings.backups.merge.title')}
    >
      <SettingsRow
        description={<><span className="block">{t('settings.backups.merge.description')}</span>
          <span className="block">{sourceLine}</span>
          {message ? <span className="block">{message}</span> : null}</>}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <SettingsButton className={SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME} disabled={!props.isDesktopRuntime || merge.isMerging} onClick={merge.chooseSource}>
            {t('settings.backups.merge.choose')}
          </SettingsButton>
        </SettingsControlSlot>
      </SettingsRow>
      {merge.source ? (
        <SettingsRow
          description={isArchive ? t('settings.backups.merge.attachmentsInArchive')
            : merge.source.attachmentsDirectory
              ? t('settings.backups.merge.attachments', { path: merge.source.attachmentsDirectory })
              : t('settings.backups.merge.attachmentsNone')}
          title={t('settings.backups.merge.attachmentsTitle')}
        >
          <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
            {isArchive ? null : (
              <SettingsButton className={SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME} disabled={merge.isMerging} onClick={merge.chooseAttachments}>
                {t('settings.backups.merge.chooseAttachments')}
              </SettingsButton>
            )}
            <SettingsButton className={SETTINGS_ACTION_BUTTON_WIDTH_CLASS_NAME} disabled={merge.isMerging} loading={merge.isMerging} loadingLabel={t('settings.backups.merge.running')} onClick={merge.merge}>
              {t('settings.backups.merge.run')}
            </SettingsButton>
          </SettingsControlSlot>
        </SettingsRow>
      ) : null}
    </SettingsSection>
  );
}
