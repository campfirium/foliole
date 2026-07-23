import { useId } from 'react';

import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import { AppButton, AppErrorState, SettingsControlSlot, SettingsSection, settingsFieldClassName } from '../../../../shared/ui';

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
      <AppButton disabled={state.disabled} onClick={state.viewLocal}>
        {t(state.status === 'viewingLocal' ? 'settings.publishing.foliole.localPages.openingLocal' : 'settings.publishing.foliole.localPages.viewLocal')}
      </AppButton>
      <AppButton disabled={!state.canViewWeb} onClick={state.viewWeb}>
        {t(state.status === 'viewingWeb' ? 'settings.publishing.foliole.localPages.openingWeb' : 'settings.publishing.foliole.localPages.viewWeb')}
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

function ThemeOverview({ state }: { state: FoliolePublishingSettingsState }) {
  const t = useTranslation();
  return (
    <div className="ml-6 mt-5 border-t border-settings-divider/70 py-6">
      <div className="flex items-start justify-between gap-6 max-[1080px]:flex-col max-[1080px]:items-start">
        <div className="min-w-0 flex-1">
          <h5 className="text-ui-lg font-semibold text-foreground">{t('settings.publishing.foliole.theme.title')}</h5>
          <p className="mt-1 max-w-[840px] text-ui-md leading-6 text-foreground/64">{t('settings.publishing.foliole.theme.description')}</p>
        </div>
        <SettingsControlSlot className="gap-5 max-[1080px]:flex-wrap">
          <div className="flex gap-2">
            <AppButton disabled={state.disabled} onClick={state.openTheme}>{t(state.status === 'openingTheme' ? 'settings.publishing.foliole.theme.opening' : 'settings.publishing.foliole.theme.open')}</AppButton>
            <AppButton disabled={state.disabled} onClick={state.resetTheme}>{t(state.status === 'resettingTheme' ? 'settings.publishing.foliole.theme.resetting' : 'settings.publishing.foliole.theme.reset')}</AppButton>
          </div>
          <div className="flex gap-2">
            <AppButton disabled={state.disabled} onClick={state.updateLocal}>{t(state.status === 'updatingLocal' ? 'settings.publishing.foliole.theme.updatingLocal' : 'settings.publishing.foliole.theme.updateLocal')}</AppButton>
            <AppButton disabled={!state.canUpdateWeb} onClick={state.updateWeb} variant="emphasis">{t(state.status === 'updatingWeb' ? 'settings.publishing.foliole.theme.updatingWeb' : 'settings.publishing.foliole.theme.updateWeb')}</AppButton>
          </div>
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
