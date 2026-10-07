import type { TopicTextAlternative } from '../../../lib/core/sync/topicTextState';
import { useTranslation } from '../localization/LocalizationProvider';

import { AppButton } from './Button';
import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuTrigger } from './DropdownMenu';

export function TextAlternativeSelector(props: {
  alternatives: TopicTextAlternative[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslation();
  if (!props.alternatives.length) return null;
  const selected = props.alternatives.find((entry) => entry.id === props.selectedId);
  return (
    <div className="flex items-center gap-2">
      <AppDropdownMenu>
        <AppDropdownMenuTrigger asChild>
          <AppButton variant="ghost">
            {t('desktop.sourceUpdate.alternative.selector', { count: props.alternatives.length })}
          </AppButton>
        </AppDropdownMenuTrigger>
        <AppDropdownMenuContent align="end">
          {props.alternatives.map((entry) => (
            <AppDropdownMenuItem key={entry.id} onSelect={() => props.onSelect(entry.id)}
              aria-current={entry.id === props.selectedId ? 'true' : undefined}>
              {t('desktop.sourceUpdate.alternative.option', {
                host: entry.source_host_name, date: new Date(entry.created_at).toLocaleString()
              })}
            </AppDropdownMenuItem>
          ))}
        </AppDropdownMenuContent>
      </AppDropdownMenu>
      {selected ? <span className="text-ui-xs text-foreground/45">
        {t('desktop.sourceUpdate.alternative.expires', { date: new Date(selected.expires_at).toLocaleDateString() })}
      </span> : null}
    </div>
  );
}
