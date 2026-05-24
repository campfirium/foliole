import { useState } from 'react';

import { clearCompanionAppData } from '../shared/platform/companionAppData';
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
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.isOpen}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[calc(100vw-3rem)] max-w-[420px] px-5 py-5">
          <AppDialogTitle>Clear App Data?</AppDialogTitle>
          <AppDialogDescription className="mt-2">
            This will disconnect the current connection and clear Foliole app data on this device. Data on your desktop and other devices will not be deleted.
          </AppDialogDescription>
          <div className="mt-5 flex flex-col gap-3">
            <button
              className="w-full rounded-2xl border border-error/60 px-4 py-3 text-sm font-semibold text-error transition hover:bg-error/5 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={props.isClearing}
              onClick={props.onClear}
              type="button"
            >
              {props.isClearing ? 'Clearing...' : 'Clear App Data'}
            </button>
            <button
              className="w-full rounded-2xl border border-companion-divider px-4 py-3 text-sm font-medium text-foreground transition active:bg-companion-subtle/80 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={props.isClearing}
              onClick={() => props.onOpenChange(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

export function CompanionStorageSettingsContent() {
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
      setError(clearError instanceof Error ? clearError.message : 'Failed to clear app data.');
    }
  }

  return (
    <section className="px-5 py-5">
      <div className="rounded-2xl border border-companion-divider bg-companion-content px-5 py-5">
        <h3 className="text-base font-semibold text-foreground">App data</h3>
        <p className="mt-2 text-sm leading-6 text-companion-text-secondary">
          Clear Foliole data on this device and disconnect the current connection. Desktop and other devices are not deleted.
        </p>
        <button
          className="mt-5 w-full rounded-2xl border border-error/60 px-4 py-3 text-sm font-semibold text-error transition hover:bg-error/5 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={isClearing}
          onClick={() => setIsConfirmOpen(true)}
          type="button"
        >
          {isClearing ? 'Clearing...' : 'Clear App Data'}
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
