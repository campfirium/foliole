import { Bug, Database, Palette, RefreshCw, Smartphone, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';

import { CompanionListRow, CompanionListSection } from './CompanionListSurface';
import { CompanionScreenHeader } from './CompanionScreenHeader';
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

function SettingsListSection(props: { children: ReactNode; title: string }) {
  return <CompanionListSection title={props.title}>{props.children}</CompanionListSection>;
}

function DataAppearanceSettingsSection(props: {
  onOpenAppearance(): void;
  onOpenStorage(): void;
  showStorage: boolean;
}) {
  const t = useTranslation();
  return (
    <SettingsListSection title={t('companion.settings.section.dataAppearance')}>
      {props.showStorage ? (
        <SettingsListItem
          Icon={Database}
          detail={t('companion.settings.storage.detail')}
          onClick={props.onOpenStorage}
          title={t('companion.settings.storage.title')}
        />
      ) : null}
      <SettingsListItem
        Icon={Palette}
        detail={t('companion.settings.appearance.detail')}
        onClick={props.onOpenAppearance}
        testId="companion-settings-appearance"
        title={t('companion.settings.appearance.title')}
      />
    </SettingsListSection>
  );
}

export function CompanionSettingsList(props: {
  onOpenAppearance(): void;
  onOpenDebug(): void;
  onOpenDevice(): void;
  onOpenStorage(): void;
  onOpenSync(): void;
  showStorage: boolean;
}) {
  const t = useTranslation();
  const sectionCount = props.showStorage ? 5 : 4;
  return (
    <section className="px-1 pb-4 pt-3">
      <CompanionScreenHeader
        metric={t('companion.settings.header.count', { count: sectionCount })}
        subtitle={t('companion.settings.header.subtitle')}
        title={t('companion.settings.title')}
      />
      <div className="space-y-5">
        <SettingsListSection title={t('companion.settings.section.syncDevice')}>
          <SettingsListItem
            Icon={RefreshCw}
            accent
            detail={t('companion.settings.sync.detail')}
            onClick={props.onOpenSync}
            testId="companion-settings-sync"
            title={t('companion.settings.sync.title')}
          />
          <SettingsListItem
            Icon={Smartphone}
            detail={t('companion.settings.device.detail')}
            onClick={props.onOpenDevice}
            title={t('companion.settings.device.title')}
          />
        </SettingsListSection>
        <DataAppearanceSettingsSection
          onOpenAppearance={props.onOpenAppearance}
          onOpenStorage={props.onOpenStorage}
          showStorage={props.showStorage}
        />
        <SettingsListSection title={t('companion.settings.section.development')}>
          <SettingsListItem
            Icon={Bug}
            detail={t('companion.settings.debug.detail')}
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
    <section className="border-t border-companion-divider px-1 py-6">
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
  return <section className="py-4">{props.children}</section>;
}
