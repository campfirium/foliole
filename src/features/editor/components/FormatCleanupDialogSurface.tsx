import { useRef } from 'react';

import type { Translate } from '../../../shared/localization/LocalizationProvider';
import {
  AppButton,
  AppDialog,
  AppDialogActions,
  AppDialogBody,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  SettingsSwitch
} from '../../../shared/ui';
import type { FormatCleanupRule, FormatCleanupSettings } from '../model/formatCleanupTypes';

import { FormatCleanupRuleTable } from './FormatCleanupRuleTable';

type RuleField = 'find' | 'follow' | 'not' | 'replace';
type TargetField = { custom: boolean; end: number; field: RuleField; index: number; start: number };

interface FormatCleanupDialogSurfaceProps {
  canClean: boolean;
  onChange: (settings: FormatCleanupSettings) => void;
  onClean: () => void;
  onOpenChange: (open: boolean) => void;
  onPreview: () => void;
  onReset: () => void;
  open: boolean;
  preview: string | null;
  settings: FormatCleanupSettings;
  t: Translate;
}

function updateRules(
  props: FormatCleanupDialogSurfaceProps,
  custom: boolean,
  updater: (rules: FormatCleanupRule[]) => FormatCleanupRule[]
) {
  const key = custom ? 'customRules' : 'builtInRules';
  props.onChange({ ...props.settings, [key]: updater(props.settings[key]), customized: true });
}

function WhitespaceRules(props: FormatCleanupDialogSurfaceProps) {
  const update = (change: Partial<FormatCleanupSettings>) => props.onChange({ ...props.settings, ...change, customized: true });
  return (
    <section className="border-t border-settings-divider/70 pt-4">
      <h2 className="text-ui-md font-medium text-foreground/72">{props.t('desktop.formatCleanup.whitespace')}</h2>
      <div className="mt-2 overflow-hidden rounded-md bg-settings-group text-ui-md">
        <div className="flex min-h-12 items-center justify-between px-4 py-2.5">
          <span>{props.t('desktop.formatCleanup.removeIndentation')}</span>
          <SettingsSwitch aria-label={props.t('desktop.formatCleanup.removeIndentation')} checked={props.settings.removeIndentation} onCheckedChange={(removeIndentation) => update({ removeIndentation })} />
        </div>
        <div className="mx-4 border-t border-settings-divider/70" />
        <div className="flex min-h-12 items-center justify-between px-4 py-2.5">
          <span>{props.t('desktop.formatCleanup.collapseBlankLines')}</span>
          <SettingsSwitch aria-label={props.t('desktop.formatCleanup.collapseBlankLines')} checked={props.settings.collapseBlankLines} onCheckedChange={(collapseBlankLines) => update({ collapseBlankLines })} />
        </div>
      </div>
    </section>
  );
}

function SpecialValueButtons(props: { onInsert: (value: string) => void; t: Translate }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-ui-xs text-foreground/58">
      <span>{props.t('desktop.formatCleanup.insert')}</span>
      {([
        ['␣', 'desktop.formatCleanup.space'], ['⇥', 'desktop.formatCleanup.tab'], ['↵', 'desktop.formatCleanup.lineBreak']
      ] as const).map(([value, key]) => (
        <AppButton key={value} onClick={() => props.onInsert(value)} size="sm" variant="default">
          <span className="font-mono font-medium">{value}</span>{props.t(key)}
        </AppButton>
      ))}
    </div>
  );
}

function CustomRules(props: FormatCleanupDialogSurfaceProps & { onTarget: (target: TargetField) => void }) {
  return (
    <section className="border-t border-settings-divider/70 pt-4">
      <div className="flex items-baseline gap-2">
        <h2 className="text-ui-md font-medium text-foreground/72">{props.t('desktop.formatCleanup.customRules')}</h2>
        <span className="text-ui-xs text-foreground/48">({props.t('desktop.formatCleanup.regexSupported')})</span>
      </div>
      <div className="mt-2">
        <FormatCleanupRuleTable
          custom
          onAdd={() => updateRules(props, true, (rules) => [...rules, { enabled: true, find: '', follow: '', id: crypto.randomUUID(), not: '', replace: '', scope: 'any' }])}
          onChange={(index, rule) => updateRules(props, true, (rules) => rules.map((item, ruleIndex) => ruleIndex === index ? rule : item))}
          onRemove={(index) => updateRules(props, true, (rules) => rules.filter((_rule, ruleIndex) => ruleIndex !== index))}
          onTargetField={(index, field, start, end) => props.onTarget({ custom: true, end, field, index, start })}
          rules={props.settings.customRules}
          t={props.t}
        />
      </div>
    </section>
  );
}

function Preview(props: Pick<FormatCleanupDialogSurfaceProps, 'preview' | 't'>) {
  if (props.preview === null) return null;
  return (
    <section className="border-t border-settings-divider/70 pt-4">
      <h2 className="text-ui-md font-medium text-foreground/72">{props.t('desktop.formatCleanup.previewTitle')}</h2>
      <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-md border border-settings-control-border bg-settings-control p-3 font-mono text-ui-md leading-6">{props.preview}</pre>
    </section>
  );
}

export function FormatCleanupDialogSurface(props: FormatCleanupDialogSurfaceProps) {
  const targetRef = useRef<TargetField | null>(null);
  const insertValue = (value: string) => {
    const target = targetRef.current;
    if (!target) return;
    updateRules(props, target.custom, (rules) => rules.map((rule, index) => {
      if (index !== target.index) return rule;
      const fieldValue = rule[target.field];
      return { ...rule, [target.field]: `${fieldValue.slice(0, target.start)}${value}${fieldValue.slice(target.end)}` };
    }));
    targetRef.current = { ...target, end: target.start + value.length, start: target.start + value.length };
  };
  return (
    <AppDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="h-[min(48rem,calc(100dvh-2rem))] w-[min(62rem,calc(100vw-2rem))] max-w-none" layout="task">
          <AppDialogTitle>{props.t('desktop.formatCleanup.title')}</AppDialogTitle>
          <AppDialogBody className="flex-1 overflow-auto">
            <AppDialogDescription className="mb-4">{props.t('desktop.formatCleanup.description')}</AppDialogDescription>
            <FormatCleanupRuleTable onChange={(index, rule) => updateRules(props, false, (rules) => rules.map((item, ruleIndex) => ruleIndex === index ? rule : item))} onTargetField={(index, field, start, end) => { targetRef.current = { custom: false, end, field, index, start }; }} rules={props.settings.builtInRules} t={props.t} />
            <div className="mt-4"><WhitespaceRules {...props} /></div>
            <div className="mt-4"><CustomRules {...props} onTarget={(target) => { targetRef.current = target; }} /></div>
            <SpecialValueButtons onInsert={insertValue} t={props.t} />
            <p className="mt-2 text-ui-xs text-foreground/48">{props.t('desktop.formatCleanup.inputHelp')}</p>
            <div className="mt-4"><Preview preview={props.preview} t={props.t} /></div>
          </AppDialogBody>
          <AppDialogActions>
            <AppButton onClick={props.onReset}>{props.t('desktop.formatCleanup.reset')}</AppButton>
            <AppButton disabled={!props.canClean} onClick={props.onPreview}>{props.t('desktop.formatCleanup.preview')}</AppButton>
            <AppButton disabled={!props.canClean} onClick={props.onClean} variant="emphasis">{props.t('desktop.formatCleanup.clean')}</AppButton>
          </AppDialogActions>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}
