import { PanelTop } from 'lucide-react';

import { usePdfTopBarsPreference } from '../../features/pdf/components/PdfTopBarsDocument';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

import { PdfToolbarIconButton } from './PdfToolbarTooltip';

export function PdfTopBarsToggle(props: { onInteraction: () => void }) {
  const preference = usePdfTopBarsPreference();
  const t = useTranslation();
  if (!preference) return null;
  const label = t('desktop.pdf.topBars.autoHide');
  return (
    <>
      <PdfToolbarIconButton
        label={label}
        aria-pressed={preference.enabled}
        disabled={!preference.ready || preference.busy}
        className="aria-pressed:bg-foreground/[0.035] aria-pressed:text-foreground"
        icon={<PanelTop aria-hidden="true" size={15} strokeWidth={2.1} />}
        onClick={() => {
          props.onInteraction();
          void preference.toggle();
        }}
      />
      {preference.error ? (
        <span role="alert" className="text-xs text-error">
          {t('desktop.pdf.topBars.failed')}
        </span>
      ) : null}
    </>
  );
}
