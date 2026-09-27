import { useTranslation } from '../../shared/localization/LocalizationProvider';

export function SearchAliasFilters(props: {
  onSelect: (spelling: string | null) => void;
  selectedSpelling: string | null;
  spellings: Array<{ key: string; label: string }>;
}) {
  const t = useTranslation();
  if (!props.spellings.length) return null;
  const options = [{ key: '', label: t('desktop.search.aliases.all') }, ...props.spellings];
  return (
    <div aria-label={t('desktop.search.aliases.aria')} className="flex gap-1.5 overflow-x-auto px-3 pb-2.5 pt-0.5" role="group">
      {options.map((option) => {
        const selected = (props.selectedSpelling ?? '') === option.key;
        return (
          <button
            aria-pressed={selected}
            className={`shrink-0 rounded-md border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${selected
              ? 'border-border/70 bg-foreground/5 font-semibold text-foreground'
              : 'border-border/50 text-foreground/60 hover:bg-foreground/5 hover:text-foreground'}`}
            key={option.key}
            onClick={() => props.onSelect(option.key || null)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
