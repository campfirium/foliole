import { Check, Image, Maximize, X } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppIconButton, appFloatingSurfaceClassName } from '../../shared/ui';

import { usePdfVisualExcerptRuntime } from './PdfVisualExcerptRuntime';

export function PdfVisualExcerptToolbarControls(props: { onToolbarInteraction: () => void }) {
  const runtime = usePdfVisualExcerptRuntime();
  const t = useTranslation();
  const act = (handler: () => void | Promise<void>) => () => { props.onToolbarInteraction(); void handler(); };
  return (
    <div className="relative flex items-center gap-1">
      <AppIconButton
        className={runtime.active ? 'size-8 bg-accent/15 text-accent' : 'size-8'}
        icon={<Image aria-hidden="true" size={15} strokeWidth={2.1} />}
        label={t('desktop.pdf.imageExcerpt.mode')}
        onClick={act(runtime.toggle)}
      />
      {runtime.active ? <>
        <AppIconButton className="size-8" icon={<Maximize aria-hidden="true" size={15} strokeWidth={2.1} />}
          label={t('desktop.pdf.imageExcerpt.fullPage')} onClick={act(runtime.selectFullPage)} />
        <AppIconButton className="size-8" disabled={!runtime.draft || runtime.creating}
          icon={<Check aria-hidden="true" size={15} strokeWidth={2.1} />}
          label={t('desktop.pdf.imageExcerpt.create')} onClick={act(runtime.confirm)} />
        <AppIconButton className="size-8" icon={<X aria-hidden="true" size={15} strokeWidth={2.1} />}
          label={t('desktop.pdf.imageExcerpt.cancel')} onClick={act(runtime.cancel)} />
      </> : null}
      {runtime.error ? <p className={appFloatingSurfaceClassName('popover', 'absolute left-0 top-9 w-64 border-danger/30 p-2 text-xs text-danger')} role="alert">{runtime.error}</p> : null}
    </div>
  );
}
