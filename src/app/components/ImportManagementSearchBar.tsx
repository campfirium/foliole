import { Search } from 'lucide-react';

import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppInput, AppToolbar, ToolbarActionGroup } from '../../shared/ui';

export function ImportManagementSearchBar({
  ariaLabel,
  countLabel,
  fieldLabel,
  onChange,
  placeholder,
  value
}: {
  ariaLabel?: string;
  countLabel: string;
  fieldLabel?: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  const t = useTranslation();
  const resolvedAriaLabel = ariaLabel ?? t('desktop.importSearch.aria');
  const resolvedFieldLabel = fieldLabel ?? t('desktop.importSearch.field');
  return (
    <AppToolbar
      ariaLabel={resolvedAriaLabel}
      className="min-h-10 justify-between gap-3 rounded-lg border border-border bg-bg-panel px-3 py-2"
    >
      <ToolbarActionGroup ariaLabel={resolvedFieldLabel} className="min-w-0 flex-1 gap-2 border-0">
        <Search aria-hidden="true" className="shrink-0 text-foreground/45" size={14} strokeWidth={1.8} />
        <AppInput
          aria-label={placeholder}
          className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      </ToolbarActionGroup>
      <p className="shrink-0 text-xs text-foreground/56">{countLabel}</p>
    </AppToolbar>
  );
}
