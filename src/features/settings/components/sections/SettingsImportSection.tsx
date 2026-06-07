import type { ReactNode } from 'react';
import { useState } from 'react';

import { APP_SETTINGS_STORAGE_KEYS } from '../../../../shared/config/appSettings';
import { useTranslation } from '../../../../shared/localization/LocalizationProvider';
import {
  getWhitelistedLocalStorageItem,
  setWhitelistedLocalStorageItem
} from '../../../../shared/platform/storage';
import {
  SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME,
  SettingsControlSlot,
  SettingsRow,
  SettingsSection,
  settingsButtonClassName,
  settingsSwitchClassName,
  settingsSwitchKnobClassName
} from '../../../../shared/ui';
import { settingsSearchRowProps, type SettingsSearchRowMeta } from '../../model/settingsSearch';

import { getLibraryRows, LibraryPathRows } from './settingsImportSectionLibraryRows';
import type { SettingsImportSectionProps } from './settingsImportSectionTypes';

const GLOBAL_CLIP_FALLBACK_KEY = APP_SETTINGS_STORAGE_KEYS.globalClipExistingClipboardFallbackEnabled;

function isGlobalClipFallbackEnabled() {
  return getWhitelistedLocalStorageItem(GLOBAL_CLIP_FALLBACK_KEY) !== 'false';
}

function MirrorActionRow(props: {
  ariaLabel: string;
  actionLabel: string;
  description: ReactNode;
  disabled: boolean;
  error: string | null;
  feedback: string | null;
  onClick: () => void;
  searchRow: SettingsSearchRowMeta;
  title: string;
}) {
  const description = (
    <>
      <span className="block">{props.description}</span>
      {props.feedback ? <span className="mt-1 block text-foreground/70">{props.feedback}</span> : null}
      {props.error ? <span className="mt-1 block text-error" role="alert">{props.error}</span> : null}
    </>
  );

  return (
    <SettingsRow
      {...settingsSearchRowProps(props.searchRow)}
      description={description}
      title={props.title}
    >
      <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
        <button
          aria-label={props.ariaLabel}
          className={settingsButtonClassName()}
          disabled={props.disabled}
          onClick={props.onClick}
          type="button"
        >
          {props.actionLabel}
        </button>
      </SettingsControlSlot>
    </SettingsRow>
  );
}

function GlobalClipSection() {
  const t = useTranslation();
  const [enabled, setEnabled] = useState(isGlobalClipFallbackEnabled);
  const updateEnabled = (nextEnabled: boolean) => {
    setEnabled(nextEnabled);
    setWhitelistedLocalStorageItem(GLOBAL_CLIP_FALLBACK_KEY, nextEnabled ? 'true' : 'false');
  };

  return (
    <SettingsSection ariaLabel={t('settings.globalClip.sectionAria')} title={t('settings.globalClip.title')}>
      <SettingsRow
        {...settingsSearchRowProps({
          categoryId: 'library',
          description: t('settings.globalClip.clipboardFallback.description'),
          id: 'library-global-clip-clipboard-fallback',
          title: t('settings.globalClip.clipboardFallback.title')
        })}
        description={t('settings.globalClip.clipboardFallback.description')}
        title={t('settings.globalClip.clipboardFallback.title')}
      >
        <SettingsControlSlot className={SETTINGS_AUTO_CONTROL_WIDTH_CLASS_NAME}>
          <button
            aria-checked={enabled}
            aria-label={t('settings.globalClip.clipboardFallback.aria')}
            className={settingsSwitchClassName(enabled)}
            onClick={() => updateEnabled(!enabled)}
            role="switch"
            type="button"
          >
            <span aria-hidden="true" className={settingsSwitchKnobClassName(enabled)} />
          </button>
        </SettingsControlSlot>
      </SettingsRow>
    </SettingsSection>
  );
}

function MirrorMaintenanceSection(props: SettingsImportSectionProps) {
  const t = useTranslation();
  const libraryRow = getLibraryRows(t);

  return (
    <SettingsSection ariaLabel={t('settings.library.mirrorMaintenance.sectionAria')} title={t('settings.library.mirrorMaintenance.title')}>
      <MirrorActionRow
        ariaLabel={t('settings.library.mirrorOutput.aria')}
        actionLabel={t('settings.library.mirrorOutput.action')}
        description={t('settings.library.mirrorOutput.description')}
        disabled={!props.isDesktopRuntime || props.isRebuildingMirrorOutput || props.pendingLocation !== null}
        error={props.mirrorOutputRebuildError}
        feedback={props.mirrorOutputRebuildFeedback}
        onClick={props.onRebuildMirrorOutput}
        searchRow={libraryRow.mirrorOutput}
        title={libraryRow.mirrorOutput.title}
      />
      <MirrorActionRow
        ariaLabel={t('settings.library.mirrorLinks.aria')}
        actionLabel={t('settings.library.mirrorLinks.action')}
        description={t('settings.library.mirrorLinks.description')}
        disabled={!props.isDesktopRuntime || props.isRebuildingMirrorLinks || props.pendingLocation !== null}
        error={props.mirrorLinkRebuildError}
        feedback={props.mirrorLinkRebuildFeedback}
        onClick={props.onRebuildMirrorLinks}
        searchRow={libraryRow.mirrorLinks}
        title={libraryRow.mirrorLinks.title}
      />
    </SettingsSection>
  );
}

export function SettingsImportSection(props: SettingsImportSectionProps) {
  const t = useTranslation();

  return (
    <>
      <SettingsSection
        ariaLabel={t('settings.library.sectionAria')}
        title={t('settings.library.title')}
      >
        <LibraryPathRows {...props} />
      </SettingsSection>
      <GlobalClipSection />
      <MirrorMaintenanceSection {...props} />
    </>
  );
}
