import { useEffect, useRef } from 'react';

import { getTopicPostponeDelayOption, TOPIC_POSTPONE_DELAY_OPTIONS } from '../../../lib/core/review/topicPostponeDelay';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { onWindowEscape, onWindowKeydown } from '../../shared/platform/keyboard';
import { AppButton } from '../../shared/ui';
import type { useReviewTopicDelayPanel } from '../hooks/useReviewTopicDelayPanel';

type ReviewTopicDelayPanelProps = ReturnType<typeof useReviewTopicDelayPanel>;

function isDigitKey(value: string) {
  return /^[0-9]$/.test(value);
}

function useReviewTopicDelayPanelKeys(props: ReviewTopicDelayPanelProps) {
  const isOpenRef = useRef(props.isOpen);
  isOpenRef.current = props.isOpen;
  useEffect(() => {
    if (!props.isOpen) return;
    const handleEscape = () => {
      if (!isOpenRef.current) {
        return false;
      }
      props.close();
      return undefined;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isDigitKey(event.key)) {
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
  }, [props]);
}

function DelayTickLabels() {
  return (
    <div className="mt-2 flex justify-between text-[11px] font-medium text-muted-foreground/75">
      {TOPIC_POSTPONE_DELAY_OPTIONS.filter((option) => option.level === 0 || option.level === 9).map((option) => (
        <span key={option.level}>{option.shortLabel}</span>
      ))}
    </div>
  );
}

function ReviewTopicDelaySlider(props: Pick<ReviewTopicDelayPanelProps, 'selectedLevel' | 'setSelectedLevel'>) {
  const t = useTranslation();
  const progress = `${(props.selectedLevel / 9) * 100}%`;
  return (
    <div className="w-full">
      <div className="relative h-5">
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/16" />
        <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/32" style={{ width: progress }} />
        <div
          aria-hidden="true"
          className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/28 bg-bg-elevated shadow-control"
          style={{ left: progress }}
        />
        <input
          aria-label={t('desktop.reviewDelay.slider')}
          className="absolute inset-0 h-5 w-full cursor-pointer opacity-0"
          max={9}
          min={0}
          onChange={(event) => props.setSelectedLevel(Number(event.currentTarget.value))}
          step={1}
          type="range"
          value={props.selectedLevel}
        />
      </div>
      <DelayTickLabels />
    </div>
  );
}

export function ReviewTopicDelayPanel(props: ReviewTopicDelayPanelProps) {
  const t = useTranslation();
  const selectedOption = getTopicPostponeDelayOption(props.selectedLevel);
  useReviewTopicDelayPanelKeys(props);
  if (!props.isOpen) return null;
  return (
    <div className="fixed inset-0 z-command-palette flex items-center justify-center px-4" role="presentation">
      <section
        aria-label={t('desktop.reviewDelay.dialog')}
        className="grid w-full max-w-md gap-4 rounded-lg border border-[var(--app-floating-border-color)] bg-[color-mix(in_oklab,var(--app-floating-surface-bg)_82%,rgb(var(--color-background)))] px-5 py-4 text-foreground/72 shadow-popover"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/50">
            <span className="size-2 rounded-full bg-foreground/32" aria-hidden="true" />
            {t('desktop.reviewDelay.title')}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end gap-5">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-semibold leading-none tabular-nums text-foreground/72">{props.selectedLevel}</span>
            <span className="text-sm font-semibold text-foreground/65">{selectedOption.label.replace(String(props.selectedLevel), '').trim()}</span>
            <span className="pl-1 text-lg text-foreground/48" aria-hidden="true">-&gt;</span>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/50">{t('desktop.reviewDelay.nextDue')}</div>
            <div className="mt-1 text-sm font-semibold text-foreground/72">{props.dueDateLabel}</div>
          </div>
        </div>

        <ReviewTopicDelaySlider selectedLevel={props.selectedLevel} setSelectedLevel={props.setSelectedLevel} />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-foreground/62">
            <kbd className="rounded-md border border-border px-2 py-0.5 text-xs font-semibold">0-9</kbd>
            <span>{t('desktop.reviewDelay.keyboardHint')}</span>
          </div>
          <div className="flex items-center gap-2">
            <AppButton className="text-foreground/62 hover:text-foreground/78" onClick={props.close} size="sm" variant="ghost">{t('desktop.reviewDelay.cancel')}</AppButton>
            <AppButton className="text-foreground/72 hover:text-foreground/86" disabled={props.isSubmitting} onClick={() => void props.submit(props.selectedLevel)} size="sm" variant="primary">
              {t('desktop.reviewDelay.confirm')}
            </AppButton>
          </div>
        </div>
      </section>
      {props.errorMessage ? <p className="sr-only">{props.errorMessage}</p> : null}
    </div>
  );
}
