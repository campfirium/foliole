import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Translate } from '../../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppIconButton,
  AppInput,
  AppSwitch
} from '../../../shared/ui';
import type { FormatCleanupRule } from '../model/formatCleanupTypes';

const COLUMNS = 'grid-cols-[36px_minmax(92px,0.85fr)_104px_minmax(76px,0.72fr)_minmax(76px,0.72fr)_18px_minmax(88px,0.85fr)_32px]';
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

function RuleHeader(props: { t: Translate }) {
  return (
    <div aria-hidden="true" className={`grid ${COLUMNS} items-center gap-3 px-2 pb-2 text-ui-xs font-medium uppercase tracking-[0.08em] text-foreground/42`}>
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
      autoComplete="off"
      className="h-8 min-w-0 bg-transparent px-2 font-mono text-ui-md"
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
    <div className={`grid ${COLUMNS} items-center gap-3 px-2 py-1.5`}>
      <AppSwitch aria-label={props.t('desktop.formatCleanup.ruleEnabled', { number: props.index + 1 })} checked={props.rule.enabled} compact onCheckedChange={(enabled) => update({ enabled })} />
      <RuleField field="find" index={props.index} onChange={(find) => update({ find })} onTarget={(start, end) => props.onTargetField(props.index, 'find', start, end)} t={props.t} value={props.rule.find} />
      <select aria-label={props.t('desktop.formatCleanup.field', { field: props.t('desktop.formatCleanup.when'), number: props.index + 1 })} className="h-8 min-w-0 rounded-md border border-settings-control-border bg-transparent px-2 text-ui-md text-foreground" onChange={(event) => update({ scope: event.target.value as FormatCleanupRule['scope'] })} value={props.rule.scope}>
        <option value="any" />
        <option value="line-start">{props.t('desktop.formatCleanup.lineStart')}</option>
      </select>
      {FIELDS.slice(1).map((field) => <RuleField field={field} index={props.index} key={field} onChange={(value) => update({ [field]: value })} onTarget={(start, end) => props.onTargetField(props.index, field, start, end)} t={props.t} value={props.rule[field]} />).reduce<ReactNode[]>((items, field, index) => index === 2 ? [...items, <span className="text-center text-foreground/42" key="arrow">→</span>, field] : [...items, field], [])}
      {props.custom ? <AppIconButton icon={<Trash2 className="size-3.5" />} label={props.t('desktop.formatCleanup.removeRule')} onClick={() => props.onRemove?.(props.index)} /> : <span />}
    </div>
  );
}

export function FormatCleanupRuleTable(props: FormatCleanupRuleTableProps) {
  return (
    <div className="w-full min-w-0">
      <RuleHeader t={props.t} />
      {props.rules.map((rule, index) => <RuleRow {...props} index={index} key={rule.id} rule={rule} />)}
      {props.custom ? (
        <AppButton className="ml-11 mt-1 px-2" onClick={props.onAdd} size="sm" variant="ghost">
            <Plus aria-hidden="true" className="size-3.5" />
            {props.t('desktop.formatCleanup.addRule')}
        </AppButton>
      ) : null}
    </div>
  );
}
