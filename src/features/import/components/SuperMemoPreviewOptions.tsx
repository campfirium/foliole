import { useTranslation } from '../../../shared/localization/LocalizationProvider';

export function SuperMemoPreviewOptionFields({ percent, onChange, compact = false }: {
  percent: number;
  compact?: boolean;
  onChange(percent: number): void;
}) {
  const t = useTranslation();
  return (
    <label className="grid shrink-0 gap-1 text-sm">
      <span className={compact ? 'flex justify-between gap-3' : undefined}>
        {t('desktop.superMemoDrafts.blend')} <output className={compact ? 'font-semibold tabular-nums' : undefined}>{percent}%</output>
      </span>
      <input className="m-0 w-full accent-[var(--role-accent)]" type="range" min={0} max={100} value={percent}
        onChange={event => onChange(event.currentTarget.valueAsNumber)} />
      <span className="flex justify-between text-xs text-foreground/70"><span>0% · SuperMemo</span><span>100% · Foliole</span></span>
      <span className="text-xs text-foreground/65">{t('desktop.superMemoDrafts.blendHelp')}</span>
    </label>
  );
}
