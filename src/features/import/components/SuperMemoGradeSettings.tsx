import { useId } from 'react';

import { DEFAULT_SUPER_MEMO_GRADE_MAP, type SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton } from '../../../shared/ui';

const ratings = [
  [1, 'desktop.reviewActions.grade.again'],
  [2, 'desktop.reviewActions.grade.hard'],
  [3, 'desktop.reviewActions.grade.good'],
  [4, 'desktop.reviewActions.grade.easy']
] as const;

export function SuperMemoGradeSettings({ value, onChange, disabled, hasPairedCollection }: {
  value: SuperMemoGradeMap; onChange(value: SuperMemoGradeMap): void; disabled: boolean;
  hasPairedCollection: boolean;
}) {
  const t = useTranslation();
  const group = useId();
  return (
    <fieldset disabled={disabled} className="min-w-0 rounded-lg border border-foreground/15 p-4 text-sm"
      aria-label={t('desktop.superMemoDrafts.gradeMapping')}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-medium">{t('desktop.superMemoDrafts.gradeMapping')}</h3>
        <AppButton type="button" variant="ghost" onClick={() => onChange(DEFAULT_SUPER_MEMO_GRADE_MAP)}>
          {t('desktop.superMemoDrafts.resetGrades')}
        </AppButton>
      </div>
      {hasPairedCollection ? <p className="mb-2 text-xs text-foreground/65">
        {t('desktop.superMemoDrafts.pairedLearningHelp')}
      </p> : null}
      <table className="w-full border-collapse text-center tabular-nums">
        <thead className="bg-foreground/5"><tr><th scope="col">SuperMemo</th>
          {ratings.map(([id, label]) => <th className="px-1 py-1 font-medium" scope="col" key={id}>{t(label)}</th>)}
        </tr></thead>
        <tbody>{value.map((rating, grade) => (
          <tr className="border-b border-foreground/10" key={grade}>
            <th scope="row" className="py-1 font-normal">{grade}</th>
            {ratings.map(([id, label]) => <td key={id} className="px-1 py-1">
              <label className="flex cursor-pointer justify-center rounded py-1 hover:bg-foreground/5">
                <input type="radio" name={`${group}-${grade}`} checked={rating === id}
                  className="accent-[var(--role-accent)]"
                  aria-label={`${t('desktop.superMemoDrafts.sourceGrade', { grade })} · ${t(label)}`}
                  onChange={() => onChange(value.map((current, index) => index === grade ? id : current))} />
              </label>
            </td>)}
          </tr>
        ))}</tbody>
      </table>
    </fieldset>
  );
}
