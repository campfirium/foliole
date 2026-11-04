import { useState } from 'react';

import { SettingsAttachmentStorageSection } from '../features/settings/components/sections/SettingsAttachmentStorageSection';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { clearCompanionAppData } from '../shared/platform/companionAppData';
import { supportsCompanionAppDataClear } from '../shared/platform/companionAppDataRuntimeRepository';
import { getCompanionRuntimeCapability } from '../shared/platform/companionRuntimeCapabilities';
import { AppButton, AppSpinner, SettingsControlSlot, SettingsRow, SettingsSection } from '../shared/ui';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../shared/ui/Dialog';

import { removeCompanionCustomCssCache } from './companionCustomCssStorage';
import { CompanionFolderDatabaseBackupSection } from './CompanionFolderDatabaseBackupSection';

function reloadCompanionApp() {
  window.location.reload();
}

function ClearAppDataDialog(props: {
  isClearing: boolean;
  isOpen: boolean;
  onClear: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslation();
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.isOpen}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[calc(100vw-3rem)] max-w-[420px] px-5 py-5">
          <AppDialogTitle>{t('companion.settings.storage.clearDialog.title')}</AppDialogTitle>
          <AppDialogDescription className="mt-2">
            {t('companion.settings.storage.clearDialog.description')}
          </AppDialogDescription>
          <div className="mt-5 flex flex-col gap-3">
            <button
              aria-busy={props.isClearing || undefined}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-error/60 px-4 py-3 text-sm font-semibold text-error transition hover:bg-error/5 disabled:cursor-not-allowed ${props.isClearing ? 'disabled:opacity-100' : 'disabled:opacity-45'}`}
              disabled={props.isClearing}
              data-testid="companion-storage-clear-confirm"
              onClick={props.onClear}
              type="button"
            >
              {props.isClearing ? <AppSpinner className="pointer-events-none shrink-0" decorative size="sm" /> : null}
              <span>{t(props.isClearing ? 'companion.settings.storage.clearing' : 'companion.settings.storage.clear')}</span>
            </button>
            <button
              className="w-full rounded-2xl border border-companion-divider px-4 py-3 text-sm font-medium text-foreground transition active:bg-companion-subtle/80 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={props.isClearing}
              onClick={() => props.onOpenChange(false)}
              type="button"
            >
              {t('common.cancel')}
            </button>
          </div>
        </AppDialogContent>
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
      {preview ? <p className="mb-5 text-sm leading-6 text-companion-text-secondary">{t('companion.settings.storage.previewUnavailable')}</p> : null}
      <CompanionFolderDatabaseBackupSection />
      <SettingsAttachmentStorageSection unavailable={preview} />
      {canClearAppData || preview ? <SettingsSection title={t('companion.settings.storage.appData')}>
        <SettingsRow description={t('companion.settings.storage.description')}>
          <SettingsControlSlot>
            <AppButton
              aria-busy={isClearing || undefined}
              disabled={isClearing || !canClearAppData}
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
      {canClearAppData ? <ClearAppDataDialog
        isClearing={isClearing}
        isOpen={isConfirmOpen}
        onClear={() => void handleClearAppData()}
        onOpenChange={setIsConfirmOpen}
      /> : null}
    </section>
  );
}
