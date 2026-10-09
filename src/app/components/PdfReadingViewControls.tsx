import { usePdfReadingView } from '../../features/pdf/components/PdfReadingViewContext';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton } from '../../shared/ui';

export function PdfReadingViewControls(props: { onInteraction: () => void }) {
  const runtime = usePdfReadingView();
  const t = useTranslation();
  if (!runtime) return null;
  const act = (action: () => void) => () => {
    props.onInteraction();
    action();
  };
  return (
    <>
      <AppButton
        aria-pressed={runtime.view.mode === 'auto'}
        disabled={!runtime.ready || runtime.busy}
        onClick={act(runtime.chooseAutomatic)}
      >
        {t('desktop.pdf.view.automatic')}
      </AppButton>
      <AppButton
        aria-pressed={runtime.view.mode === 'manual'}
        disabled={!runtime.ready || runtime.busy}
        onClick={act(runtime.chooseManual)}
      >
        {t('desktop.pdf.view.manual')}
      </AppButton>
      {runtime.view.manual ? (
        <AppButton disabled={runtime.busy} onClick={act(runtime.adjust)}>
          {t('desktop.pdf.view.adjust')}
        </AppButton>
      ) : null}
      {runtime.error ? (
        <span role="alert" className="text-xs text-error">
          {t('desktop.pdf.view.failed')}
        </span>
      ) : null}
    </>
  );
}
