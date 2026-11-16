import type { NativeSuperMemoWithdrawal } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

export function SuperMemoWithdrawals({ candidates, selected, disabled, onChange }: {
  candidates: NativeSuperMemoWithdrawal[]; selected: number[]; disabled: boolean; onChange(ids: number[]): void;
}) {
  const t = useTranslation();
  if (!candidates.length) return null;
  return <fieldset className="grid gap-2" disabled={disabled}>
    <legend className="text-sm font-semibold">{t('desktop.superMemoDrafts.withdrawals')}</legend>
    {candidates.some(candidate => !candidate.protectedBy) ? <p className="text-sm">
      {t('desktop.superMemoDrafts.withdrawalPrompt')}
    </p> : null}
    <ul className="divide-y divide-foreground/10 text-sm">
      {candidates.map(candidate => (
        <li key={candidate.sourceId} className="grid gap-1 py-2">
          {candidate.protectedBy ? <span>{candidate.title}</span> : <label className="flex items-center gap-2">
            <input type="checkbox" checked={selected.includes(candidate.sourceId)}
              onChange={event => onChange(event.currentTarget.checked
                ? [...selected, candidate.sourceId] : selected.filter(id => id !== candidate.sourceId))} />
            {candidate.title}
          </label>}
          <span className="text-foreground/65">
            {t(`desktop.superMemoDrafts.withdrawReason.${candidate.issue}`)}
            {candidate.protectedBy ? ' · ' + t(`desktop.superMemoDrafts.withdrawalProtected.${candidate.protectedBy}`) : ''}
          </span>
        </li>
      ))}
    </ul>
  </fieldset>;
}
