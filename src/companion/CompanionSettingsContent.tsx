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
  title: string;
}) {
  return (
    <CompanionListRow
      accent={Boolean(props.accent)}
      ariaLabel={`${props.title} ${props.detail}`}
      Icon={props.Icon}
      onClick={props.onClick}
      subtitle={props.detail}
      title={props.title}
    />
  );
}

function SettingsListSection(props: { children: ReactNode; title: string }) {
  return <CompanionListSection title={props.title}>{props.children}</CompanionListSection>;
}

export function CompanionSettingsList(props: {
  onOpenAppearance(): void;
  onOpenDebug(): void;
  onOpenDevice(): void;
  onOpenStorage(): void;
  onOpenSync(): void;
}) {
  const t = useTranslation();
  return (
    <section className="px-1 pb-4 pt-3">
      <CompanionScreenHeader
        metric={t('companion.settings.header.count', { count: 5 })}
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
            title={t('companion.settings.sync.title')}
          />
          <SettingsListItem
            Icon={Smartphone}
            detail={t('companion.settings.device.detail')}
            onClick={props.onOpenDevice}
            title={t('companion.settings.device.title')}
          />
        </SettingsListSection>
        <SettingsListSection title={t('companion.settings.section.dataAppearance')}>
          <SettingsListItem
            Icon={Database}
            detail={t('companion.settings.storage.detail')}
            onClick={props.onOpenStorage}
            title={t('companion.settings.storage.title')}
          />
          <SettingsListItem
            Icon={Palette}
            detail={t('companion.settings.appearance.detail')}
            onClick={props.onOpenAppearance}
            title={t('companion.settings.appearance.title')}
          />
        </SettingsListSection>
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
    <section className="px-1 py-4">
      <h2 className="text-base font-semibold text-foreground">{props.title}</h2>
      <p className="mt-3 text-sm leading-6 text-companion-text-secondary">{props.detail}</p>
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
