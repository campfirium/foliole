import { ChevronDown, Crop, ScanLine } from 'lucide-react';
import type { ReactNode } from 'react';

import { usePdfReadingView } from '../../features/pdf/components/PdfReadingViewContext';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import {
  AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger,
  AppIconButton, AppTooltip, AppTooltipContent, AppTooltipTrigger
} from '../../shared/ui';

export function PdfReadingViewControls(props: {
  onInteraction: () => void;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const runtime = usePdfReadingView();
  const t = useTranslation();
  if (!runtime) return null;
  const disabled = !runtime.ready || runtime.busy;
  const act = (action: () => void) => () => {
    props.onInteraction();
    action();
  };
  return (
    <>
      <ViewIcon label={t('desktop.pdf.view.automatic')} active={runtime.view.mode === 'auto'}
        hint={t('desktop.pdf.view.automaticHint')} disabled={disabled} onClick={act(runtime.chooseAutomatic)}
        icon={<ScanLine aria-hidden="true" size={15} strokeWidth={2.1} />} />
      <div className="flex items-center">
        <ViewIcon label={t('desktop.pdf.view.manual')} active={runtime.view.mode === 'manual'}
          hint={t('desktop.pdf.view.manualHint')} disabled={disabled} onClick={act(runtime.chooseManual)}
          icon={<Crop aria-hidden="true" size={15} strokeWidth={2.1} />} />
        <AppDropdownMenu onOpenChange={(open) => props.onMenuOpenChange?.(open)}>
          <AppDropdownMenuTrigger asChild>
            <AppIconButton label={t('desktop.pdf.view.manualOptions')} disabled={disabled}
              className="w-4" onClick={props.onInteraction}
              icon={<ChevronDown aria-hidden="true" size={11} strokeWidth={2.1} />} />
          </AppDropdownMenuTrigger>
          <AppDropdownMenuContent align="end">
            <AppDropdownMenuItem onSelect={act(runtime.adjust)}>
              {t('desktop.pdf.view.adjust')}
            </AppDropdownMenuItem>
          </AppDropdownMenuContent>
        </AppDropdownMenu>
      </div>
      {runtime.error ? <span role="alert" className="text-xs text-error">
        {t('desktop.pdf.view.failed')}
      </span> : null}
    </>
  );
}

function ViewIcon(props: {
  label: string;
  hint: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <AppIconButton label={props.label} aria-pressed={props.active} disabled={props.disabled}
          className="aria-pressed:bg-foreground/[0.035] aria-pressed:text-foreground"
          icon={props.icon} onClick={props.onClick} />
      </AppTooltipTrigger>
      <AppTooltipContent>{props.label}<br />{props.hint}</AppTooltipContent>
    </AppTooltip>
  );
}
