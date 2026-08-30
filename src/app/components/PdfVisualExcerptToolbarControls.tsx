import { SquareDashedMousePointer } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppIconButton, AppTooltip, AppTooltipContent, AppTooltipContentLayout, AppTooltipTrigger } from '../../shared/ui';

import { resolvePdfVisualExcerptModifier } from './pdfVisualExcerptInteractionMode';
import { usePdfVisualExcerptRuntime } from './PdfVisualExcerptRuntime';

export function PdfVisualExcerptToolbarControls(props: { onToolbarInteraction: () => void }) {
  const t = useTranslation();
  const runtime = usePdfVisualExcerptRuntime();
  const quick = runtime.interactionMode === 'quick';
  const title = t(quick ? 'desktop.pdf.imageExcerpt.quick.title' : 'desktop.pdf.imageExcerpt.ordinary.title');
  const description = quick
    ? t('desktop.pdf.imageExcerpt.quick.hint')
    : t('desktop.pdf.imageExcerpt.ordinary.hint', { modifier: resolvePdfVisualExcerptModifier() });
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <AppIconButton
          aria-pressed={quick}
          className="size-8 aria-pressed:bg-foreground/[0.035] aria-pressed:text-foreground/70"
          icon={<SquareDashedMousePointer aria-hidden="true" size={15} strokeWidth={2.1} />}
          label={t('desktop.pdf.imageExcerpt.mode')}
          onClick={() => {
            props.onToolbarInteraction();
            runtime.toggleInteractionMode();
          }}
          onFocus={props.onToolbarInteraction}
          onMouseEnter={props.onToolbarInteraction}
        />
      </AppTooltipTrigger>
      <AppTooltipContent>
        <AppTooltipContentLayout description={description} title={title} />
      </AppTooltipContent>
    </AppTooltip>
  );
}
