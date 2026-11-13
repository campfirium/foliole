import { DEFAULT_SUPER_MEMO_GRADE_MAP, type SuperMemoGrade, type SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { AppButton } from '../../../shared/ui';

const ratings = [
  [1, 'desktop.reviewActions.grade.again'],
  [2, 'desktop.reviewActions.grade.hard'],
  [3, 'desktop.reviewActions.grade.good'],
  [4, 'desktop.reviewActions.grade.easy']
] as const;

export function SuperMemoGradeSettings({ value, onChange, disabled }: {
  value: SuperMemoGradeMap; onChange(value: SuperMemoGradeMap): void; disabled: boolean;
}) {
  const t = useTranslation();
  return (
    <details className="shrink-0 text-sm">
      <summary>{t('desktop.superMemoDrafts.gradeMapping')}</summary>
      <fieldset disabled={disabled} className="flex flex-wrap items-end gap-2 py-2">
        {value.map((rating, grade) => (
          <label key={grade} className="grid gap-1">
            {t('desktop.superMemoDrafts.sourceGrade', { grade })}
            <select aria-label={t('desktop.superMemoDrafts.sourceGrade', { grade })} className="rounded border bg-background px-2 py-1" value={rating}
              onChange={event => onChange(value.map((current, index) =>
                index === grade ? Number(event.target.value) as SuperMemoGrade : current))}>
              {ratings.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
            </select>
          </label>
        ))}
        <AppButton type="button" disabled={disabled} variant="ghost"
          onClick={() => onChange(DEFAULT_SUPER_MEMO_GRADE_MAP)}>
          {t('desktop.superMemoDrafts.resetGrades')}
        </AppButton>
      </fieldset>
    </details>
  );
}
