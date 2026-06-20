import { useMemo, useState } from 'react';

import {
  getDemoSettingsPreviewSections,
  resolveDemoSettingsPreviewNoteKind,
  type DemoSettingsPreviewControlKind
} from '../model/demoSettingsPreviewCatalog';
import {
  getInitialSettingsCategory,
  getSettingsCategoryOption,
  type SettingsCategoryId
} from '../model/settingsPanelOptions';

import { DemoSettingsExternalSearchSection } from './DemoSettingsExternalSearchSection';
import { DemoSettingsPreviewDescription } from './DemoSettingsPreviewDescription';
import { DemoSettingsPreviewSidebar } from './DemoSettingsPreviewSidebar';

import { cn } from '@/shared/lib/utils';
import { useTranslation } from '@/shared/localization/LocalizationProvider';
import {
  AppDialog,
  AppDialogContent,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName,
  settingsDialogSurfaceClassName,
  settingsFieldClassName,
  settingsRangeClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName,
  settingsValueBoxClassName
} from '@/shared/ui';

const DESKTOP_DOWNLOAD_URL = 'https://github.com/campfirium/foliole/releases';

export interface DemoSettingsPreviewOverlayProps {
  onClose: () => void;
  requestedCategory: SettingsCategoryId | null;
}

export function DemoSettingsPreviewOverlay({ onClose, requestedCategory }: DemoSettingsPreviewOverlayProps) {
  const t = useTranslation();
  const [activeCategory, setActiveCategory] = useState<SettingsCategoryId>(
    requestedCategory ?? getInitialSettingsCategory()
  );

  return (
    <AppDialog modal open onOpenChange={(open) => !open && onClose()}>
      <AppDialogPortal>
        <AppDialogOverlay aria-label={t('settings.overlay.aria')} onClick={onClose} role="presentation" />
        <AppDialogContent
          aria-label={t('settings.dialog.aria')}
          aria-describedby={undefined}
          className={settingsDialogSurfaceClassName('grid h-[min(800px,calc(100dvh-36px))] w-[min(1240px,calc(100vw-36px))] max-w-none grid-cols-[260px_minmax(0,1fr)] overflow-hidden')}
          data-settings-root-dialog="true"
        >
          <DemoSettingsPreviewBody
            activeCategory={activeCategory}
            setActiveCategory={setActiveCategory}
          />
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

function DemoSettingsPreviewBody(props: {
  activeCategory: SettingsCategoryId;
  setActiveCategory: (category: SettingsCategoryId) => void;
}) {
  const t = useTranslation();
  const { activeCategory, setActiveCategory } = props;
  const activeCategoryOption = getSettingsCategoryOption(activeCategory, t);
  const sections = useMemo(() => getDemoSettingsPreviewSections(activeCategory), [activeCategory]);

  return (
    <>
      <DemoSettingsPreviewSidebar
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
      />
      <div className="flex min-h-0 flex-col bg-settings-group">
        <div className="flex min-h-[64px] items-center justify-between gap-4 border-b border-settings-divider/55 px-7">
          <span className="text-ui-md text-foreground/64">{t('settings.demoPreview.readOnlyBadge')}</span>
          <DesktopDownloadLink />
        </div>
        <div className="app-scrollbar min-h-0 flex-1 overflow-auto px-7 py-7">
          <DemoSettingsPreviewHeader
            description={activeCategoryOption?.description ?? ''}
            title={activeCategoryOption?.label ?? t('settings.title')}
          />
          <DemoSettingsPreviewSections activeCategory={activeCategory} sections={sections} />
        </div>
      </div>
    </>
  );
}

function DemoSettingsPreviewSections({ activeCategory, sections }: {
  activeCategory: SettingsCategoryId;
  sections: ReturnType<typeof getDemoSettingsPreviewSections>;
}) {
  const t = useTranslation();
  if (activeCategory === 'external-search') {
    return <DemoSettingsExternalSearchSection />;
  }
  if (sections.length === 0) {
    return (
      <SettingsSection ariaLabel={t('settings.demoPreview.empty')}>
        <SettingsRow
          description={t('settings.demoPreview.emptyDescription')}
          readonly
          title={t('settings.demoPreview.empty')}
        />
      </SettingsSection>
    );
  }
  return (
    <>
      {sections.map((section) => (
        <SettingsSection
          ariaLabel={t(section.titleKey)}
          key={section.id}
          title={t(section.titleKey)}
          {...(section.descriptionKey ? { description: t(section.descriptionKey) } : {})}
        >
          {section.items.map((item) => (
            <SettingsRow
              description={(
                <DemoSettingsPreviewDescription
                  descriptionKey={item.descriptionKey}
                  noteKind={resolveDemoSettingsPreviewNoteKind(section, item)}
                />
              )}
              key={item.id}
              readonly
              title={t(item.titleKey)}
            >
              <SettingsControlSlot>
                <PreviewControl kind={item.controlKind} />
              </SettingsControlSlot>
            </SettingsRow>
          ))}
        </SettingsSection>
      ))}
    </>
  );
}

function DesktopDownloadLink() {
  const t = useTranslation();
  return (
    <a
      className={settingsButtonClassName()}
      href={DESKTOP_DOWNLOAD_URL}
      rel="noreferrer"
      target="_blank"
    >
      {t('settings.demoPreview.downloadDesktop')}
    </a>
  );
}

function DemoSettingsPreviewHeader({ description, title }: { description: string; title: string }) {
  const t = useTranslation();
  return (
    <div className="mb-7 px-5 pb-6">
      <div className="mb-5 rounded-md border border-settings-control-border bg-settings-control/40 px-4 py-3">
        <p className="text-ui-md font-semibold text-foreground">{t('settings.demoPreview.banner.title')}</p>
        <p className="mt-1 text-ui-md leading-6 text-foreground/66">{t('settings.demoPreview.banner.description')}</p>
      </div>
      <AppDialogTitle>{title}</AppDialogTitle>
      <p className="mt-1 max-w-[760px] text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function PreviewControl({ kind }: { kind: DemoSettingsPreviewControlKind }) {
  const t = useTranslation();
  switch (kind) {
    case 'switch':
      return (
        <button
          aria-label={t('settings.demoPreview.control.previewOnly')}
          className={settingsSwitchClassName(false)}
          disabled
          type="button"
        >
          <span className={settingsSwitchKnobClassName(false)} />
        </button>
      );
    case 'slider':
      return (
        <input
          aria-label={t('settings.demoPreview.control.previewOnly')}
          className={cn(settingsRangeClassName('w-36'), 'opacity-45')}
          disabled
          max={100}
          min={0}
          readOnly
          type="range"
          value={60}
        />
      );
    case 'input':
      return (
        <input
          aria-label={t('settings.demoPreview.control.previewOnly')}
          className={settingsFieldClassName('w-40')}
          disabled
          readOnly
          value={t('settings.demoPreview.control.previewOnly')}
        />
      );
    case 'select':
    case 'segmented':
      return <span className={settingsValueBoxClassName('w-36 text-center')}>{t('settings.demoPreview.control.previewOnly')}</span>;
    case 'button':
      return <button className={settingsButtonClassName('w-36')} disabled type="button">{t('settings.demoPreview.control.previewOnly')}</button>;
    case 'status':
      return <span className={settingsValueBoxClassName('w-36 text-center')}>{t('settings.demoPreview.control.desktopOnly')}</span>;
    default:
      return null;
  }
}
