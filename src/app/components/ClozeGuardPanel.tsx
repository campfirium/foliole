import { Settings2 } from 'lucide-react';

import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppButton, appFloatingSurfaceClassName } from '../../shared/ui';
import { useDismissibleSurface } from '../../shared/ui/useDismissibleSurface';
import { dispatchOpenClozeGuardSettings } from '../clozeGuardSettingsEvent';

const CLOZE_GUARD_CARD_CLASS_NAME = cn(
  appFloatingSurfaceClassName('panel'),
  'fixed z-floating w-[26rem] rounded-lg p-4 text-foreground'
);
const CLOZE_GUARD_BORDERED_ACTION_CLASS_NAME =
  'border-[var(--app-control-border-color)] hover:border-[var(--app-control-border-hover-color)]';

export function ClozeGuardPanel(props: {
  left: number;
  onCancel: () => void;
  onCreateCloze: () => void;
  onCreateHighlight: () => void;
  top: number;
}) {
  const t = useTranslation();
  useDismissibleSurface({ onDismiss: props.onCancel });

  return (
    <div
      className={CLOZE_GUARD_CARD_CLASS_NAME}
      data-annotation-toolbar="true"
      style={{ left: props.left, top: props.top }}
    >
      <div className="grid gap-1.5">
        <div className="text-base font-semibold leading-6">{t('desktop.clozeGuard.title')}</div>
        <p className="text-sm leading-5 text-foreground/68">
          {t('desktop.clozeGuard.description')}
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          aria-label={t('desktop.clozeGuard.openSettings')}
          className="flex size-8 items-center justify-center rounded-md text-foreground/60 transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => {
            dispatchOpenClozeGuardSettings();
            props.onCancel();
          }}
          title={t('desktop.clozeGuard.settingsTitle')}
          type="button"
        >
          <Settings2 aria-hidden="true" size={17} strokeWidth={1.9} />
        </button>
        <div className="flex items-center gap-2">
          <AppButton onClick={props.onCreateHighlight} size="sm" variant="default">
            {t('desktop.clozeGuard.highlight')}
          </AppButton>
          <AppButton
            className={CLOZE_GUARD_BORDERED_ACTION_CLASS_NAME}
            onClick={props.onCreateCloze}
            size="sm"
            variant="ghost"
          >
            {t('desktop.clozeGuard.cloze')}
          </AppButton>
        </div>
      </div>
    </div>
  );
}
