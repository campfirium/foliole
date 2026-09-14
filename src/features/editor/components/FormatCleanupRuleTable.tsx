import { Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Translate } from '../../../shared/localization/LocalizationProvider';
import { AppIconButton, AppInput } from '../../../shared/ui';
import type { FormatCleanupRule } from '../model/formatCleanupTypes';

const COLUMNS = 'grid-cols-[22px_minmax(72px,1fr)_112px_minmax(72px,1fr)_minmax(72px,1fr)_20px_minmax(72px,1fr)_28px]';
const FIELDS = ['find', 'follow', 'not', 'replace'] as const;
const FIELD_LABEL_KEYS = {
  find: 'desktop.formatCleanup.find',
  follow: 'desktop.formatCleanup.follow',
  not: 'desktop.formatCleanup.not',
  replace: 'desktop.formatCleanup.replace'
} as const;

interface FormatCleanupRuleTableProps {
  custom?: boolean;
  onAdd?: () => void;
  onChange: (index: number, rule: FormatCleanupRule) => void;
  onRemove?: (index: number) => void;
  onTargetField: (index: number, field: typeof FIELDS[number], start: number, end: number) => void;
  rules: FormatCleanupRule[];
  t: Translate;
}

function RuleHeader(props: { custom: boolean; t: Translate }) {
  return (
    <div aria-hidden="true" className={`grid ${COLUMNS} items-center gap-2 px-1 pb-1 text-ui-xs text-foreground/48`}>
      <span /><span>{props.t('desktop.formatCleanup.find')}</span><span>{props.t('desktop.formatCleanup.when')}</span>
      <span>{props.t('desktop.formatCleanup.follow')}</span><span>{props.t('desktop.formatCleanup.not')}</span>
      <span /><span>{props.t('desktop.formatCleanup.replace')}</span><span />
    </div>
  );
}

function RuleField(props: {
  field: typeof FIELDS[number];
  index: number;
  onChange: (value: string) => void;
  onTarget: (start: number, end: number) => void;
  t: Translate;
  value: string;
}) {
  return (
    <AppInput
      aria-label={props.t('desktop.formatCleanup.field', { field: props.t(FIELD_LABEL_KEYS[props.field]), number: props.index + 1 })}
      className="h-8 min-w-0 px-2 font-mono text-ui-md"
      onChange={(event) => props.onChange(event.target.value)}
      onFocus={(event) => props.onTarget(event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0)}
      onSelect={(event) => props.onTarget(event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0)}
      value={props.value}
    />
  );
}

function RuleRow(props: FormatCleanupRuleTableProps & { index: number; rule: FormatCleanupRule }) {
  const update = (change: Partial<FormatCleanupRule>) => props.onChange(props.index, { ...props.rule, ...change });
  return (
    <div className={`grid ${COLUMNS} items-center gap-2 border-t border-settings-divider/45 px-1 py-1.5`}>
      <input aria-label={props.t('desktop.formatCleanup.ruleEnabled', { number: props.index + 1 })} checked={props.rule.enabled} className="size-4 accent-foreground" onChange={(event) => update({ enabled: event.target.checked })} type="checkbox" />
      <RuleField field="find" index={props.index} onChange={(find) => update({ find })} onTarget={(start, end) => props.onTargetField(props.index, 'find', start, end)} t={props.t} value={props.rule.find} />
      <select aria-label={props.t('desktop.formatCleanup.field', { field: props.t('desktop.formatCleanup.when'), number: props.index + 1 })} className="h-8 min-w-0 rounded-md border border-settings-control-border bg-settings-control px-2 text-ui-md" onChange={(event) => update({ scope: event.target.value as FormatCleanupRule['scope'] })} value={props.rule.scope}>
        <option value="any" />
        <option value="line-start">{props.t('desktop.formatCleanup.lineStart')}</option>
      </select>
      {FIELDS.slice(1).map((field) => <RuleField field={field} index={props.index} key={field} onChange={(value) => update({ [field]: value })} onTarget={(start, end) => props.onTargetField(props.index, field, start, end)} t={props.t} value={props.rule[field]} />).reduce<ReactNode[]>((items, field, index) => index === 2 ? [...items, <span className="text-center text-foreground/42" key="arrow">→</span>, field] : [...items, field], [])}
      {props.custom ? <AppIconButton icon={<Minus className="size-3.5" />} label={props.t('desktop.formatCleanup.removeRule')} onClick={() => props.onRemove?.(props.index)} /> : <span />}
    </div>
  );
}

export function FormatCleanupRuleTable(props: FormatCleanupRuleTableProps) {
  return (
    <div>
      <RuleHeader custom={Boolean(props.custom)} t={props.t} />
      {props.rules.map((rule, index) => <RuleRow {...props} index={index} key={rule.id} rule={rule} />)}
      {props.custom ? <AppIconButton className="mt-2" icon={<Plus className="size-3.5" />} label={props.t('desktop.formatCleanup.addRule')} onClick={props.onAdd} /> : null}
    </div>
  );
}
