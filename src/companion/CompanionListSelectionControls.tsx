import type { ReactNode } from 'react';

import { useTranslation } from '../shared/localization/LocalizationProvider';
import { AppButton } from '../shared/ui';

import { CompanionBottomBar } from './CompanionBottomBar';
import { companionTopBarClassName } from './companionCssCompatibility';

type ListSelectionAction = {
  label: string;
  onSelect(): void;
  disabled?: boolean;
  destructive?: boolean;
};

export function CompanionListSelectionControls(props: {
  count: number;
  total: number;
  busy: boolean;
  onCancel(): void;
  onSelectAll(): void;
  onClear(): void;
  actions: ListSelectionAction[];
  notice?: ReactNode;
}) {
  const t = useTranslation();
  const allSelected = props.total > 0 && props.count === props.total;
  const controlClass = 'min-h-11 min-w-0 whitespace-normal px-1 [overflow-wrap:anywhere]';
  return <>
    <header className={`${companionTopBarClassName} -mt-[var(--companion-page-content-gap)] border-b border-companion-divider`}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-1">
        <AppButton className={`${controlClass} justify-self-start`} variant="ghost" disabled={props.busy} onClick={props.onCancel}>
          {t('shared.confirm.cancel')}
        </AppButton>
        <span role="status" className="text-center text-sm font-medium tabular-nums [overflow-wrap:anywhere]">
          {t('companion.batch.count', { count: props.count, total: props.total })}
        </span>
        <AppButton className={`${controlClass} justify-self-end`} variant="ghost" disabled={props.busy || !props.total}
          onClick={allSelected ? props.onClear : props.onSelectAll}>
          {t(allSelected ? 'companion.batch.clear' : 'companion.batch.selectAll')}
        </AppButton>
      </div>
      {props.notice}
    </header>
    <CompanionBottomBar testId="companion-selection-action-bar">
      {props.actions.map(action => <AppButton key={action.label} className={`${controlClass} flex-1`}
        variant={action.destructive ? 'danger' : 'emphasis'}
        disabled={props.busy || props.count === 0 || Boolean(action.disabled)} onClick={action.onSelect}>
        {action.label}
      </AppButton>)}
    </CompanionBottomBar>
  </>;
}
