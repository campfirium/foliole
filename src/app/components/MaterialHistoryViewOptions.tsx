import { Check } from 'lucide-react';
import { useId } from 'react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';

import type { MaterialHistoryView } from './materialHistoryViewPreference';
import { PanelViewOptions } from './PanelViewOptions';

export function MaterialHistoryViewOptions({ view, onChange }: {
  view: MaterialHistoryView;
  onChange: (view: MaterialHistoryView) => void;
}) {
  const t = useTranslation();
  const id = useId();
  return (
    <PanelViewOptions label={t('desktop.history.viewOptions')}>
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-foreground/75">{t('desktop.history.displayOrder')}</legend>
        <div className={`${choiceGroupClassName} grid-cols-2`}>
          {(['preview', 'breadcrumb'] as const).map(first => (
            <ViewChoice checked={view.first === first} key={first} name={`${id}-order`}
              label={t(first === 'preview' ? 'desktop.history.previewFirst' : 'desktop.history.breadcrumbFirst')}
              onSelect={() => onChange({ ...view, first })} />
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-foreground/75">{t('desktop.history.previewLines')}</legend>
        <div className={`${choiceGroupClassName} grid-cols-3`}>
          {([1, 2, 3] as const).map(lines => (
            <ViewChoice checked={view.lines === lines} key={lines} label={String(lines)} name={`${id}-lines`}
              onSelect={() => onChange({ ...view, lines })} />
          ))}
        </div>
      </fieldset>
    </PanelViewOptions>
  );
}

const choiceGroupClassName =
  'grid w-full gap-0.5 rounded-lg border border-[var(--app-floating-divider-color)] bg-[var(--app-surface-control-bg)] p-0.5';

function ViewChoice({ checked, name, label, onSelect }: {
  checked: boolean;
  name: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <label className="relative min-w-0 cursor-pointer">
      <input checked={checked} className="peer sr-only" name={name} onChange={onSelect} type="radio" />
      <span className="flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 text-ui-base text-foreground/75 transition-colors hover:bg-[var(--app-control-bg-hover-color)] peer-checked:border-[var(--app-control-border-color)] peer-checked:bg-[var(--app-floating-item-active-bg)] peer-checked:font-medium peer-checked:text-foreground peer-focus-visible:outline peer-focus-visible:outline-ring">
        <Check aria-hidden="true" className={`size-3.5 shrink-0 ${checked ? '' : 'invisible'}`} />
        <span>{label}</span>
      </span>
    </label>
  );
}
