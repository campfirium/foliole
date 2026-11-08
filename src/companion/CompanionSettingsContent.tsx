import { BookOpen, Bug, CalendarDays, Database, HardDrive, Palette, RefreshCw, RectangleEllipsis, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { useAttachmentStorageSettings } from '../features/settings/components/sections/useAttachmentStorageSettings';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { supportsCompanionFolderDatabaseBackup } from '../shared/platform/companion/folderBackup/companionFolderBackupRuntimeRepository';
import { getCompanionRuntimeCapability } from '../shared/platform/companionRuntimeCapabilities';

import { companionBackupSummary } from './companionBackupSummary';
import { CompanionHighlightPrefixSetting } from './CompanionHighlightPrefixSetting';
import { CompanionListRow, CompanionListSection } from './CompanionListSurface';
import { CompanionStorageSettingsContent } from './CompanionStorageSettingsContent';
import { useCompanionFolderBackupState } from './useCompanionFolderBackupState';
import type { CompanionSettingsPage } from './useCompanionSyncSettingsPage';

function SettingsListItem(props: {
  accent?: boolean;
  detail: string;
  Icon: LucideIcon;
  onClick(): void;
  testId?: string;
  title: string;
}) {
  return (
    <CompanionListRow
      accent={Boolean(props.accent)}
      ariaLabel={`${props.title} ${props.detail}`}
      Icon={props.Icon}
      onClick={props.onClick}
      subtitle={props.detail}
      {...(props.testId ? { testId: props.testId } : {})}
      title={props.title}
    />
  );
}

function SettingsListSection(props: { children: ReactNode; first?: boolean; title: string }) {
  return <CompanionListSection isFirst={Boolean(props.first)} title={props.title}>{props.children}</CompanionListSection>;
}

function DataSettingsSection(props: {
  onOpenBackup(): void;
  onOpenAttachments(): void;
  showStorage: boolean;
}) {
  const t = useTranslation();
  const backup = useCompanionFolderBackupState(supportsCompanionFolderDatabaseBackup());
  const attachments = useAttachmentStorageSettings();
  return props.showStorage ? <SettingsListSection title={t('companion.settings.section.data')}>
      {supportsCompanionFolderDatabaseBackup() || getCompanionRuntimeCapability().kind === 'browser-preview' ? <SettingsListItem Icon={Database} title={t('companion.settings.storage.databaseBackup')}
        detail={companionBackupSummary(backup.state, backup.automatic, backup.error, t)}
        onClick={props.onOpenBackup} testId="companion-settings-backup" /> : null}
      <SettingsListItem Icon={HardDrive} title={t('settings.attachments.title')}
        detail={attachments.status ? t('companion.settings.storage.attachmentSummary', {
          used: formatBytes(attachments.status.usedBytes), trash: formatBytes(attachments.status.trashBytes)
        }) : ''} onClick={props.onOpenAttachments} testId="companion-settings-attachments" />
      <CompanionStorageSettingsContent />
    </SettingsListSection> : null;
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  return value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function CompanionSettingsList(props: {
  onOpenAppearance(): void;
  onOpenDebug(): void;
  onOpenLearning?(): void;
  onOpenClozeGuard?(): void;
  onOpenReviewStatistics?(): void;
  onOpenBackup(): void;
  onOpenAttachments(): void;
  onOpenSync(): void;
  showStorage: boolean;
}) {
  const t = useTranslation();
  return (
    <section className="pb-4" data-settings-home>
      <div>
        <SettingsListSection first title="">
          <SettingsListItem Icon={Palette} detail={t('companion.settings.appearance.detail')}
            onClick={props.onOpenAppearance} testId="companion-settings-appearance" title={t('companion.settings.appearance.title')} />
        </SettingsListSection>
        <SettingsListSection title={t('companion.settings.section.syncDevice')}>
          <SettingsListItem
            Icon={RefreshCw}
            detail=""
            onClick={props.onOpenSync}
            testId="companion-settings-sync"
            title={t('companion.settings.sync.title')}
          />
        </SettingsListSection>
        {props.onOpenLearning || props.onOpenClozeGuard || props.onOpenReviewStatistics ? <SettingsListSection title={t('settings.group.workspace')}>
          {props.onOpenLearning ? <SettingsListItem Icon={BookOpen} detail="" onClick={props.onOpenLearning}
            title={t('settings.category.review.label')} /> : null}
          {props.onOpenClozeGuard ? <SettingsListItem Icon={RectangleEllipsis} detail="" onClick={props.onOpenClozeGuard}
            title={t('settings.editor.clozeGuard.section')} /> : null}
          <CompanionHighlightPrefixSetting />
          {props.onOpenReviewStatistics ? <SettingsListItem Icon={CalendarDays} detail="" onClick={props.onOpenReviewStatistics}
            title={t('desktop.reviewCalendar.title')} /> : null}
        </SettingsListSection> : null}
        <DataSettingsSection
          onOpenBackup={props.onOpenBackup}
          onOpenAttachments={props.onOpenAttachments}
          showStorage={props.showStorage}
        />
        <SettingsListSection title={t('companion.settings.section.development')}>
          <SettingsListItem
            Icon={Bug}
            detail=""
            onClick={props.onOpenDebug}
            title={t('companion.settings.debug.title')}
          />
        </SettingsListSection>
      </div>
    </section>
  );
}

export function CompanionPlaceholderSettingsContent(props: { detail: string; title: string }) {
  return (
    <section className="py-4">
      <h2 className="text-sm font-semibold leading-6 text-foreground">{props.title}</h2>
      <p className="mt-1 max-w-[28rem] text-sm leading-6 text-companion-text-secondary">{props.detail}</p>
    </section>
  );
}

export function CompanionSettingsDetail(props: {
  children: ReactNode;
  onBack(): void;
  page: CompanionSettingsPage;
  title: string;
}) {
  return <section>{props.children}</section>;
}
