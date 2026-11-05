import { ChevronRight } from 'lucide-react';

import { SettingsRow } from './SettingsRow';

/** One disclosure row: label, current value, then the navigation affordance. */
export function SettingsValueRow({ title, value, disabled = false, onClick }: {
  title: string; value: string; disabled?: boolean; onClick(): void;
}) {
  return <SettingsRow data-settings-value-row>
    <button aria-label={`${title} ${value}`} disabled={disabled} onClick={onClick} type="button"
      className="flex min-h-settings-row w-full items-center gap-3 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">
      <span className="shrink-0 text-ui-lg font-normal text-foreground">{title}</span>
      <span className="min-w-0 flex-1 truncate text-right text-ui-md text-muted-foreground" title={value}>{value}</span>
      <ChevronRight aria-hidden="true" className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
    </button>
  </SettingsRow>;
}
