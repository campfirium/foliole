import { useTranslation } from '../../../shared/localization/LocalizationProvider';

export function SuperMemoPreviewOptionFields({ percent, onChange }: {
  percent: number;
  onChange(percent: number): void;
}) {
  const t = useTranslation();
  return (
    <label className="grid shrink-0 gap-1 text-sm">
      <span>{t('desktop.superMemoDrafts.blend')} <output>{percent}%</output></span>
      <input className="accent-[var(--role-accent)]" type="range" min={0} max={100} value={percent}
        onChange={event => onChange(event.currentTarget.valueAsNumber)} />
      <span className="flex justify-between text-xs text-foreground/70"><span>0% · SuperMemo</span><span>100% · Foliole</span></span>
    </label>
  );
}
