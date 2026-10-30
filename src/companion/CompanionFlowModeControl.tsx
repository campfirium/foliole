import { EllipsisVertical } from 'lucide-react';
import { createContext, useContext, useState } from 'react';

import type { ReviewSessionMode } from '../features/review/model/reviewSessionMode';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import { reviewSessionModeOptions } from '../shared/ui/reviewSessionModeOptions';

import { CompanionBottomSheet } from './CompanionBottomSheet';

export type CompanionFlowModeControls = {
  mode: ReviewSessionMode;
  onChange(mode: ReviewSessionMode): void;
  disabled: boolean;
};
export const CompanionFlowModeContext = createContext<CompanionFlowModeControls | null>(null);

export function CompanionFlowModeControl(props: { onSelect(): void }) {
  const controls = useContext(CompanionFlowModeContext);
  const t = useTranslation();
  if (!controls) return null;
  return <div role="group" aria-label={t('desktop.reviewSession.mode.change')} className="flex border-b border-companion-divider py-3">
    {reviewSessionModeOptions.map(({ id, Icon, labelKey }) => (
      <button key={id} type="button" aria-pressed={controls.mode === id} disabled={controls.disabled}
        className={`inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-companion-accent disabled:opacity-50 ${controls.mode === id
          ? 'font-medium text-companion-accent'
          : 'text-foreground active:bg-companion-subtle/80'}`}
        onClick={() => { controls.onChange(id); props.onSelect(); }}>
        <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${controls.mode === id ? '' : 'text-companion-text-secondary'}`} strokeWidth={1.75} />
        <span>{t(labelKey)}</span>
      </button>
    ))}
  </div>;
}

export function CompanionFlowModeMenu(props: CompanionFlowModeControls) {
  const [open, setOpen] = useState(false);
  const t = useTranslation();
  return <CompanionFlowModeContext.Provider value={props}>
    <button type="button" aria-label={t('companion.reading.actions')} onClick={() => setOpen(true)}
      className="inline-flex h-11 w-10 items-center justify-center text-companion-text-secondary">
      <EllipsisVertical aria-hidden="true" className="h-5 w-5" />
    </button>
    <CompanionBottomSheet open={open} onOpenChange={setOpen} title={t('desktop.reviewSession.mode.change')}>
      <CompanionFlowModeControl onSelect={() => setOpen(false)} />
    </CompanionBottomSheet>
  </CompanionFlowModeContext.Provider>;
}
