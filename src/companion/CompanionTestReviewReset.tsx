import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { resetCompanionTestItemReviews, supportsCompanionTestReviewReset } from '../shared/platform/companionTestReviewReset';
import { AppButton } from '../shared/ui';
import { AppDialog, AppDialogContent, AppDialogDescription, AppDialogOverlay,
  AppDialogPortal, AppDialogTitle } from '../shared/ui/Dialog';

import { useCompanionNavigationSaveForReload } from './CompanionNavigationProvider';
import { CompanionPlaceholderSettingsContent } from './CompanionSettingsContent';

function reloadApp() { window.location.reload(); }

export function CompanionTestReviewReset({ onComplete = reloadApp }: { onComplete?: () => void }) {
  const t = useTranslation();
  const [supported, setSupported] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const running = useRef(false);
  const saveForReload = useCompanionNavigationSaveForReload();
  useEffect(() => {
    let cancelled = false;
    void supportsCompanionTestReviewReset().then(value => {
      if (!cancelled) setSupported(value);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  async function reset() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await resetCompanionTestItemReviews();
      await saveForReload({ flowSessionMode: 'review-first', activeAction: 'review' });
      setConfirm(false);
      setBusy(false);
      running.current = false;
      onComplete();
    } catch {
      setFailed(true);
      setBusy(false);
      running.current = false;
    }
  }
  if (!supported) return <CompanionPlaceholderSettingsContent detail={t('companion.settings.debug.detail')}
    title={t('companion.settings.debug.placeholderTitle')} />;
  return <section className="px-5 py-5">
    <p className="mb-4 text-sm leading-6 text-companion-text-secondary">{t('companion.settings.debug.resetReviews.description')}</p>
    <AppButton onClick={() => setConfirm(true)}>{t('companion.settings.debug.resetReviews.action')}</AppButton>
    <ResetDialog open={confirm} busy={busy} failed={failed} onOpenChange={open => { if (!busy) setConfirm(open); }}
      onConfirm={() => void reset()} />
  </section>;
}

function ResetDialog(props: { open: boolean; busy: boolean; failed: boolean;
  onOpenChange(open: boolean): void; onConfirm(): void }) {
  const t = useTranslation();
  return <AppDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[calc(100vw-2rem)] max-w-md p-5">
          <AppDialogTitle>{t('companion.settings.debug.resetReviews.title')}</AppDialogTitle>
          <AppDialogDescription className="mt-2">{t('companion.settings.debug.resetReviews.confirm')}</AppDialogDescription>
          {props.failed ? <p role="alert" className="mt-3 text-sm text-error">{t('companion.settings.debug.resetReviews.error')}</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <AppButton disabled={props.busy} onClick={() => props.onOpenChange(false)}>{t('common.cancel')}</AppButton>
            <AppButton loading={props.busy} loadingLabel={t('companion.settings.debug.resetReviews.busy')}
              onClick={props.onConfirm} variant="danger">{t('companion.settings.debug.resetReviews.action')}</AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>;
}
