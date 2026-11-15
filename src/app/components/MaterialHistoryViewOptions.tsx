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
      <fieldset className="space-y-1">
        <legend className="text-xs text-foreground/65">{t('desktop.history.displayOrder')}</legend>
        <div className="flex flex-wrap gap-1">
          {(['preview', 'breadcrumb'] as const).map(first => (
            <ViewChoice checked={view.first === first} key={first} name={`${id}-order`}
              label={t(first === 'preview' ? 'desktop.history.previewFirst' : 'desktop.history.breadcrumbFirst')}
              onSelect={() => onChange({ ...view, first })} />
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="text-xs text-foreground/65">{t('desktop.history.previewLines')}</legend>
        <div className="flex gap-1">
          {([1, 2, 3] as const).map(lines => (
            <ViewChoice checked={view.lines === lines} key={lines} label={String(lines)} name={`${id}-lines`}
              onSelect={() => onChange({ ...view, lines })} />
          ))}
        </div>
      </fieldset>
    </PanelViewOptions>
  );
}

function ViewChoice({ checked, name, label, onSelect }: {
  checked: boolean;
  name: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <label className="relative inline-flex min-w-7 cursor-pointer items-center justify-center">
      <input checked={checked} className="peer sr-only" name={name} onChange={onSelect} type="radio" />
      <span className="w-full rounded-md px-2 py-1 text-center text-ui-base text-foreground/75 hover:bg-[var(--app-floating-item-hover-bg)] peer-checked:bg-[var(--app-floating-item-hover-bg)] peer-checked:font-medium peer-checked:text-foreground peer-focus-visible:outline peer-focus-visible:outline-ring">
        {label}
      </span>
    </label>
  );
}
