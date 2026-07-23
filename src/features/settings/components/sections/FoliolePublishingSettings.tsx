import { useId } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppButton, AppErrorState, SettingsControlSlot, SettingsSection, SettingsSegmentedControl, settingsFieldClassName } from '../../../../shared/ui';

import { FoliolePublishingSetupRows } from './FoliolePublishingSetupRows';
import { useFoliolePublishingSettings, type FoliolePublishingSettingsState } from './useFoliolePublishingSettings';

function HostingOverview() {
  const t = useTranslation();
  return (
    <div className="border-t border-settings-divider/70 px-settings-panel-x pt-7">
      <h4 className="text-ui-lg font-semibold text-foreground">{t('settings.publishing.foliole.hosting.title')}</h4>
      <div className="ml-6 mt-5 border-t border-settings-divider/70 py-6">
        <h5 className="text-ui-lg font-semibold text-foreground">Cloudflare Pages</h5>
        <p className="mt-1 max-w-[840px] text-ui-md leading-6 text-foreground/64">{t('settings.publishing.foliole.cloudflare.description')}</p>
        <p className="mt-1 max-w-[840px] text-ui-md font-bold leading-6 text-foreground">
          {t('settings.publishing.foliole.cloudflare.securityNotice')}
        </p>
      </div>
    </div>
  );
}

function StaticPagesActions({ state }: { state: FoliolePublishingSettingsState }) {
  const t = useTranslation();
  return (
    <SettingsControlSlot className="gap-2">
      <AppButton disabled={state.disabled && state.status !== 'viewingLocal'} loading={state.status === 'viewingLocal'} loadingLabel={t('settings.publishing.foliole.localPages.openingLocal')} onClick={state.viewLocal}>
        {t('settings.publishing.foliole.localPages.viewLocal')}
      </AppButton>
      <AppButton disabled={!state.canViewWeb && state.status !== 'viewingWeb'} loading={state.status === 'viewingWeb'} loadingLabel={t('settings.publishing.foliole.localPages.openingWeb')} onClick={state.viewWeb}>
        {t('settings.publishing.foliole.localPages.viewWeb')}
      </AppButton>
    </SettingsControlSlot>
  );
}

function SiteTitleOverview({ state }: { state: FoliolePublishingSettingsState }) {
  const t = useTranslation();
  const errorId = useId();
  return (
    <div className="ml-6 mt-5 border-t border-settings-divider/70 py-6">
      <div className="flex min-w-0 flex-wrap items-start gap-6">
        <div className="min-w-0 basis-settings-flow-copy-min grow-[2] shrink">
          <h5 className="text-ui-lg font-semibold text-foreground">{t('settings.publishing.foliole.siteTitle.title')}</h5>
          <p className="mt-1 max-w-[840px] text-ui-md leading-6 text-foreground/64">{t('settings.publishing.foliole.siteTitle.description')}</p>
        </div>
        <div className="inline-flex min-w-0 basis-settings-flow-control-min grow shrink items-center gap-2 self-center" data-settings-control-slot>
          <div className="min-w-0 flex-1">
            <input
              aria-describedby={state.siteTitleError ? errorId : undefined}
              aria-invalid={state.siteTitleError ? true : undefined}
              aria-label={t('settings.publishing.foliole.siteTitle.aria')}
              className={settingsFieldClassName()}
              disabled={state.disabled}
              onBlur={state.saveSiteTitle}
              onChange={(event) => state.updateSiteTitle(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') state.saveSiteTitle(); }}
              ref={state.siteTitleInputRef}
              value={state.form.siteTitle}
            />
            {state.siteTitleError ? <p className="mt-1 text-sm leading-5 text-error" id={errorId} role="alert">{state.siteTitleError}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeOptionLabel({ label, version }: { label: string; version: number | null }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span>{label}</span>
      {version === null ? null : <span className="text-ui-xs font-normal text-foreground/45">v{version}</span>}
    </span>
  );
}

function ThemeOverview({ state }: { state: FoliolePublishingSettingsState }) {
  const t = useTranslation();
  const theme = state.theme;
  const customVersion = !theme
    ? null
    : theme.custom_theme?.based_on_official_version ?? (theme.custom_theme ? null : theme.official_theme_version);
  const selectTheme = (value: string) => {
    if (value === 'custom') state.openCustomTheme();
    else if (theme?.active_theme !== 'foliole') state.useFolioleTheme();
  };
  return (
    <div className="ml-6 mt-5 border-t border-settings-divider/70 py-6">
      <div className="flex items-start justify-between gap-6 max-[1080px]:flex-col max-[1080px]:items-start">
        <div className="min-w-0 flex-1">
          <h5 className="text-ui-lg font-semibold text-foreground">{t('settings.publishing.foliole.theme.title')}</h5>
          <p className="mt-1 max-w-[840px] text-ui-md leading-6 text-foreground/64">{t('settings.publishing.foliole.theme.description')}</p>
        </div>
        <SettingsControlSlot>
          <SettingsSegmentedControl
            ariaLabel={t('settings.publishing.foliole.theme.aria')}
            disabled={state.disabled || !theme}
            onChange={selectTheme}
            options={[
              { label: <ThemeOptionLabel label={t('settings.publishing.foliole.theme.default')} version={theme?.official_theme_version ?? null} />, value: 'foliole' },
              { label: <ThemeOptionLabel label={t('settings.publishing.foliole.theme.custom')} version={customVersion} />, value: 'custom' }
            ]}
            value={theme?.active_theme ?? 'foliole'}
          />
          <AppButton disabled={state.disabled && state.status !== 'updatingLocal'} loading={state.status === 'updatingLocal'} loadingLabel={t('settings.publishing.foliole.theme.updatingLocal')} onClick={state.updateLocal}>{t('settings.publishing.foliole.theme.updateLocal')}</AppButton>
          <AppButton disabled={!state.canUpdateWeb && state.status !== 'updatingWeb'} loading={state.status === 'updatingWeb'} loadingLabel={t('settings.publishing.foliole.theme.updatingWeb')} onClick={state.updateWeb} variant="emphasis">{t('settings.publishing.foliole.theme.updateWeb')}</AppButton>
        </SettingsControlSlot>
      </div>
    </div>
  );
}

function LocalStaticPagesOverview({ state }: { state: FoliolePublishingSettingsState }) {
  const t = useTranslation();
  return (
    <div className="px-settings-panel-x py-settings-panel-y" data-local-static-pages>
      <div className="flex items-start justify-between gap-6 max-[1080px]:flex-col max-[1080px]:items-start">
        <div className="min-w-0 flex-1">
          <h4 className="text-ui-lg font-semibold text-foreground">{t('settings.publishing.foliole.localPages.title')}</h4>
          <p className="mt-1 max-w-[840px] text-ui-md leading-6 text-foreground/64">{t('settings.publishing.foliole.localPages.description')}</p>
        </div>
        <StaticPagesActions state={state} />
      </div>
      <SiteTitleOverview state={state} />
      <ThemeOverview state={state} />
    </div>
  );
}

export function FoliolePublishingSettings(props: { expanded: boolean; onExpandedChange: (expanded: boolean) => void }) {
  const t = useTranslation();
  const state = useFoliolePublishingSettings();
  return (
    <SettingsSection
      ariaLabel={t('settings.publishing.foliole.sectionAria')}
      description={t('settings.publishing.foliole.description')}
      expanded={props.expanded}
      onExpandedChange={props.onExpandedChange}
      title={t('settings.publishing.foliole.title')}
    >
      {state.error ? <AppErrorState description={t('settings.publishing.foliole.error.tryAgain')} surface="panel" title={state.error} /> : null}
      <LocalStaticPagesOverview state={state} />
      <HostingOverview />
      <FoliolePublishingSetupRows state={state} />
    </SettingsSection>
  );
}
