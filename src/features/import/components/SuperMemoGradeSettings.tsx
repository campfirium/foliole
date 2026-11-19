import { ChevronDown, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { DEFAULT_SUPER_MEMO_GRADE_MAP, type SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { onWindowPriorityEscape } from '../../../shared/platform/keyboard';
import { AppButton, AppIconButton, AppDropdownMenu, AppDropdownMenuCheckItem, AppDropdownMenuContent, AppDropdownMenuTrigger } from '../../../shared/ui';

const ratings = [
  [1, 'desktop.reviewActions.grade.again'],
  [2, 'desktop.reviewActions.grade.hard'],
  [3, 'desktop.reviewActions.grade.good'],
  [4, 'desktop.reviewActions.grade.easy']
] as const;

function GradeChoice({ grade, rating, onChange, disabled }: {
  grade: number; rating: number; onChange(rating: SuperMemoGradeMap[number]): void; disabled: boolean;
}) {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    return onWindowPriorityEscape(() => { setOpen(false); });
  }, [open]);
  const label = ratings.find(([id]) => id === rating)?.[1];
  const current = label ? t(label) : '';
  return (
    <AppDropdownMenu modal open={open} onOpenChange={setOpen}>
      <AppDropdownMenuTrigger asChild>
        <AppButton size="sm" disabled={disabled} className="w-full px-0 text-sm"
          contentClassName="relative w-full justify-center px-2"
          aria-label={`${t('desktop.superMemoDrafts.sourceGrade', { grade })} · ${current}`}>
          <span className="min-w-0 truncate">{current}</span>
          <ChevronDown aria-hidden="true" className="absolute right-1.5 size-3 opacity-60" />
        </AppButton>
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent align="start">
        {ratings.map(([id, label]) => (
          <AppDropdownMenuCheckItem key={id} role="menuitemradio" checked={id === rating}
            onSelect={() => onChange(id)}>{t(label)}</AppDropdownMenuCheckItem>
        ))}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

export function SuperMemoGradeSettings({ value, onChange, disabled }: {
  value: SuperMemoGradeMap; onChange(value: SuperMemoGradeMap): void; disabled: boolean;
}) {
  const t = useTranslation();
  return (
    <section className="grid min-w-0 gap-2.5" aria-label={t('desktop.superMemoDrafts.gradeMapping')}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-base font-semibold">{t('desktop.superMemoDrafts.gradeMapping')}</h4>
        <AppIconButton type="button" className="size-7" disabled={disabled}
          icon={<RotateCcw aria-hidden="true" className="size-4" />}
          label={t('desktop.superMemoDrafts.resetGrades')}
          onClick={() => onChange(DEFAULT_SUPER_MEMO_GRADE_MAP)} />
      </div>
      <p className="text-sm leading-snug text-foreground/75">
        {t('desktop.superMemoDrafts.gradeHistoryHelp')}
      </p>
      <table className="w-full table-fixed text-sm">
        <tbody>
          <tr>
            <th scope="row" className="w-[21%] py-1.5 pr-2 text-left font-medium text-foreground/70">
              {t('desktop.superMemoDrafts.superMemoRating')}
            </th>
            {value.map((_, grade) => <td key={grade} className="text-center font-semibold tabular-nums">{grade}</td>)}
          </tr>
          <tr>
            <th scope="row" className="py-1.5 pr-1 text-left font-medium text-foreground/70">
              {t('desktop.superMemoDrafts.folioleRating')}
            </th>
            {value.map((rating, grade) => <td key={grade} className="px-1 py-1.5 last:pr-0">
              <GradeChoice grade={grade} rating={rating} disabled={disabled}
                onChange={next => onChange(value.map((current, index) => index === grade ? next : current))} />
            </td>)}
          </tr>
        </tbody>
      </table>
    </section>
  );
}
