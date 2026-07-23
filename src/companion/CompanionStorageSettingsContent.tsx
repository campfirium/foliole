import { useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { clearCompanionAppData } from '../shared/platform/companionAppData';
import { AppSpinner } from '../shared/ui';
import {
  AppDialog,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle
} from '../shared/ui/Dialog';

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
              className={`relative inline-flex w-full items-center justify-center rounded-2xl border border-error/60 px-4 py-3 text-sm font-semibold text-error transition hover:bg-error/5 disabled:cursor-not-allowed ${props.isClearing ? 'disabled:opacity-100' : 'disabled:opacity-45'}`}
              disabled={props.isClearing}
              onClick={props.onClear}
              type="button"
            >
              {props.isClearing ? <AppSpinner className="pointer-events-none absolute left-4" decorative size="sm" /> : null}
              <span className={props.isClearing ? 'translate-x-2' : undefined}>{t('companion.settings.storage.clear')}</span>
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

  async function handleClearAppData() {
    setIsClearing(true);
    setError(null);
    try {
      await clearCompanionAppData();
      reloadCompanionApp();
    } catch (clearError) {
      setIsClearing(false);
      setError(clearError instanceof Error ? clearError.message : t('companion.settings.storage.error'));
    }
  }

  return (
    <section className="px-5 py-5">
      <div className="rounded-2xl border border-companion-divider bg-companion-content px-5 py-5">
        <h3 className="text-base font-semibold text-foreground">{t('companion.settings.storage.appData')}</h3>
        <p className="mt-2 text-sm leading-6 text-companion-text-secondary">
          {t('companion.settings.storage.description')}
        </p>
        <button
          aria-busy={isClearing || undefined}
          className={`relative mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-error/60 px-4 py-3 text-sm font-semibold text-error transition hover:bg-error/5 disabled:cursor-not-allowed ${isClearing ? 'disabled:opacity-100' : 'disabled:opacity-45'}`}
          disabled={isClearing}
          onClick={() => setIsConfirmOpen(true)}
          type="button"
        >
          {isClearing ? <AppSpinner className="pointer-events-none absolute left-4" decorative size="sm" /> : null}
          <span className={isClearing ? 'translate-x-2' : undefined}>{t('companion.settings.storage.clear')}</span>
        </button>
        {error ? <p className="mt-3 text-sm leading-6 text-error">{error}</p> : null}
      </div>
      <ClearAppDataDialog
        isClearing={isClearing}
        isOpen={isConfirmOpen}
        onClear={() => void handleClearAppData()}
        onOpenChange={setIsConfirmOpen}
      />
    </section>
  );
}
