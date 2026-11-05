import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { clearCompanionAppData } from '../shared/platform/companionAppData';
import { supportsCompanionAppDataClear } from '../shared/platform/companionAppDataRuntimeRepository';
import { getCompanionRuntimeCapability } from '../shared/platform/companionRuntimeCapabilities';
import { AppButton, AppSpinner, SettingsControlSlot, SettingsRow, SettingsSection } from '../shared/ui';
import {
  AppDialog,
  AppDialogActions,
  AppDialogBody,
  AppDialogDescription,
  AppDialogPortal,
  AppDialogTitle
} from '../shared/ui/Dialog';
import { SettingsTouchSheet, SettingsTouchSheetOverlay } from '../shared/ui/SettingsTouchSheet';

import { removeCompanionCustomCssCache } from './companionCustomCssStorage';

function reloadCompanionApp() {
  window.location.reload();
}

function ClearAppDataDialog(props: {
  isClearing: boolean;
  unavailable: boolean;
  isOpen: boolean;
  onClear: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslation();
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.isOpen}>
      <AppDialogPortal>
        <SettingsTouchSheetOverlay />
        <SettingsTouchSheet>
          <div data-settings-sheet-header><AppDialogTitle>{t('companion.settings.storage.clearDialog.title')}</AppDialogTitle></div>
          <AppDialogBody><AppDialogDescription>
            {t('companion.settings.storage.clearDialog.description')}
          </AppDialogDescription></AppDialogBody>
          <AppDialogActions>
            <AppButton
              disabled={props.isClearing}
              onClick={() => props.onOpenChange(false)}
              type="button"
            >
              {t('common.cancel')}
            </AppButton>
            <AppButton
              aria-label={t('companion.settings.storage.clear')}
              aria-busy={props.isClearing || undefined}
              variant="danger"
              disabled={props.isClearing || props.unavailable}
              data-testid="companion-storage-clear-confirm"
              onClick={props.onClear}
              type="button"
            >
              {props.isClearing ? <AppSpinner className="pointer-events-none shrink-0" decorative size="sm" /> : null}
              <span>{t(props.isClearing ? 'companion.settings.storage.clearing' : 'companion.settings.storage.clear')}</span>
            </AppButton>
          </AppDialogActions>
        </SettingsTouchSheet>
      </AppDialogPortal>
    </AppDialog>
  );
}

export function CompanionStorageSettingsContent() {
  const t = useTranslation();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canClearAppData = supportsCompanionAppDataClear();
  const preview = getCompanionRuntimeCapability().kind === 'browser-preview';

  async function handleClearAppData() {
    setIsClearing(true);
    setError(null);
    try {
      await clearCompanionAppData();
      removeCompanionCustomCssCache();
      reloadCompanionApp();
    } catch (clearError) {
      setIsClearing(false);
      setError(clearError instanceof Error ? clearError.message : t('companion.settings.storage.error'));
    }
  }

  return (
    <section>
      {canClearAppData || preview ? <SettingsSection>
        <SettingsRow title={t('companion.settings.storage.appData')}>
          <SettingsControlSlot>
            <AppButton
              aria-label={t('companion.settings.storage.clear')}
              aria-busy={isClearing || undefined}
              disabled={isClearing || (!canClearAppData && !preview)}
              data-testid="companion-storage-clear"
              onClick={() => setIsConfirmOpen(true)}
              variant="danger"
            >
              {isClearing ? <AppSpinner className="pointer-events-none shrink-0" decorative size="sm" /> : null}
              <span>{t(isClearing ? 'companion.settings.storage.clearing' : 'companion.settings.storage.clear')}</span>
            </AppButton>
          </SettingsControlSlot>
        </SettingsRow>
        {error ? <p className="mt-3 text-sm leading-6 text-error">{error}</p> : null}
      </SettingsSection> : null}
      {canClearAppData || preview ? <ClearAppDataDialog
        unavailable={!canClearAppData}
        isClearing={isClearing}
        isOpen={isConfirmOpen}
        onClear={() => void handleClearAppData()}
        onOpenChange={setIsConfirmOpen}
      /> : null}
    </section>
  );
}
