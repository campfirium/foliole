import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { onWindowEscape, onWindowKeydown } from '../../shared/platform/keyboard';
import {
  AppButton, AppDropdownMenu, AppDropdownMenuCheckItem, AppDropdownMenuContent,
  AppDropdownMenuTrigger, appFloatingSurfaceClassName
} from '../../shared/ui';
import type { useReviewTopicDelayPanel } from '../hooks/useReviewTopicDelayPanel';

import { ReviewTopicPostponeForm } from './ReviewTopicPostponeForm';

type ReviewTopicDelayPanelProps = ReturnType<typeof useReviewTopicDelayPanel>;

function isDigitKey(value: string) {
  return /^[0-9]$/.test(value);
}

function useReviewTopicDelayPanelKeys(
  props: ReviewTopicDelayPanelProps, menuOpen: boolean, closeMenu: () => void
) {
  const isOpenRef = useRef(props.isOpen);
  isOpenRef.current = props.isOpen;
  useEffect(() => {
    if (!props.isOpen) return;
    const handleEscape = () => {
      if (!isOpenRef.current) {
        return false;
      }
      if (menuOpen) closeMenu();
      else props.close();
      return undefined;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!menuOpen && props.unit === 'weeks' && isDigitKey(event.key)) {
        event.preventDefault();
        void props.submit(Number(event.key));
      }
    };
    const unlistenEscape = onWindowEscape(handleEscape);
    const unlistenKeydown = onWindowKeydown(handleKeyDown);
    return () => {
      unlistenEscape();
      unlistenKeydown();
    };
  }, [closeMenu, menuOpen, props]);
}

function PostponeUnitMenu({ unit, changeUnit, open, onOpenChange }: Pick<ReviewTopicDelayPanelProps, 'unit' | 'changeUnit'> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslation();
  const skipTriggerFocus = useRef(false);
  return (
    <AppDropdownMenu open={open} onOpenChange={onOpenChange}>
      <AppDropdownMenuTrigger asChild>
        <AppButton className="gap-1 pl-2 pr-0 text-xs text-foreground/65" size="sm" type="button" variant="ghost">
          {t(`desktop.reviewDelay.mode.${unit}`)}
          <ChevronDown aria-hidden="true" size={13} />
        </AppButton>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="end" className="min-w-28"
        onCloseAutoFocus={event => {
          if (skipTriggerFocus.current) event.preventDefault();
          skipTriggerFocus.current = false;
        }}>
        {(['weeks', 'days'] as const).map(option => (
          <AppDropdownMenuCheckItem key={option} checked={unit === option} role="menuitemradio"
            onClick={event => { skipTriggerFocus.current = event.detail > 0; }}
            onSelect={() => {
              if (option === unit) return;
              if (option === 'days') skipTriggerFocus.current = true;
              changeUnit(option);
            }}>
            {t(`desktop.reviewDelay.mode.${option}`)}
          </AppDropdownMenuCheckItem>
        ))}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

export function ReviewTopicDelayPanel(props: ReviewTopicDelayPanelProps) {
  const t = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  useReviewTopicDelayPanelKeys(props, menuOpen, () => setMenuOpen(false));
  if (!props.isOpen) return null;
  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center px-4" role="presentation">
      <section
        aria-label={t('desktop.reviewDelay.dialog')}
        className={appFloatingSurfaceClassName('popover', 'grid w-full max-w-md gap-4 px-5 py-4 text-foreground/72')}
        role="dialog"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/50">
            <span className="size-2 rounded-full bg-foreground/32" aria-hidden="true" />
            {t('desktop.reviewDelay.title')}
          </div>
          <PostponeUnitMenu unit={props.unit} changeUnit={props.changeUnit} open={menuOpen} onOpenChange={setMenuOpen} />
        </div>

        <ReviewTopicPostponeForm key={props.unit} {...props} />
      </section>
      {props.errorMessage ? <p className="sr-only">{props.errorMessage}</p> : null}
    </div>
  );
}
