import { Image } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../shared/ui';

export function PdfVisualExcerptToolbarControls(props: { onToolbarInteraction: () => void }) {
  const t = useTranslation();
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <span aria-label={t('desktop.pdf.imageExcerpt.mode')} className="flex size-8 items-center justify-center text-foreground/65"
          onFocus={props.onToolbarInteraction} onMouseEnter={props.onToolbarInteraction} role="img" tabIndex={0}>
          <Image aria-hidden="true" size={15} strokeWidth={2.1} />
        </span>
      </AppTooltipTrigger>
      <AppTooltipContent>{t('desktop.pdf.imageExcerpt.hint')}</AppTooltipContent>
    </AppTooltip>
  );
}
