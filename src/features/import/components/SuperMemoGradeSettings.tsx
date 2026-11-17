import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import { DEFAULT_SUPER_MEMO_GRADE_MAP, type SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { onWindowPriorityEscape } from '../../../shared/platform/keyboard';
import { AppButton, AppDropdownMenu, AppDropdownMenuCheckItem, AppDropdownMenuContent, AppDropdownMenuTrigger } from '../../../shared/ui';

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
    <div className="grid min-w-0 gap-1 text-center">
      <span aria-hidden="true" className="text-xs tabular-nums text-foreground/65">SM {grade}</span>
      <AppDropdownMenu modal open={open} onOpenChange={setOpen}>
        <AppDropdownMenuTrigger asChild>
          <AppButton size="sm" disabled={disabled} className="w-full px-1" contentClassName="gap-1"
            aria-label={`${t('desktop.superMemoDrafts.sourceGrade', { grade })} · ${current}`}>
            {current}<ChevronDown aria-hidden className="size-3 shrink-0 opacity-60" />
          </AppButton>
        </AppDropdownMenuTrigger>
        <AppDropdownMenuContent align="start">
          {ratings.map(([id, label]) => (
            <AppDropdownMenuCheckItem key={id} role="menuitemradio" checked={id === rating}
              onSelect={() => onChange(id)}>{t(label)}</AppDropdownMenuCheckItem>
          ))}
        </AppDropdownMenuContent>
      </AppDropdownMenu>
    </div>
  );
}

export function SuperMemoGradeSettings({ value, onChange, disabled, hasPairedCollection }: {
  value: SuperMemoGradeMap; onChange(value: SuperMemoGradeMap): void; disabled: boolean;
  hasPairedCollection: boolean;
}) {
  const t = useTranslation();
  return (
    <section className="min-w-0 text-sm" aria-label={t('desktop.superMemoDrafts.gradeMapping')}>
      <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
        <h3 className="font-semibold">{t('desktop.superMemoDrafts.gradeMapping')}</h3>
        <AppButton type="button" size="sm" variant="ghost" disabled={disabled}
          onClick={() => onChange(DEFAULT_SUPER_MEMO_GRADE_MAP)}>
          {t('desktop.superMemoDrafts.resetGrades')}
        </AppButton>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-2">
        {value.map((rating, grade) => (
          <GradeChoice key={grade} grade={grade} rating={rating} disabled={disabled}
            onChange={next => onChange(value.map((current, index) => index === grade ? next : current))} />
        ))}
      </div>
      {hasPairedCollection ? <p className="mt-3 text-xs text-foreground/65">
        {t('desktop.superMemoDrafts.pairedLearningHelp')}
      </p> : null}
    </section>
  );
}
