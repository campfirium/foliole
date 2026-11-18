import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import { DEFAULT_SUPER_MEMO_GRADE_MAP, type SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { NativeSuperMemoPreview } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { onWindowPriorityEscape } from '../../../shared/platform/keyboard';
import { AppButton, AppDropdownMenu, AppDropdownMenuCheckItem, AppDropdownMenuContent, AppDropdownMenuTrigger } from '../../../shared/ui';

import { SuperMemoDraftTable } from './SuperMemoDraftTable';

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
    <div className="grid min-w-0 gap-2">
      <span aria-hidden="true" className="text-xs tabular-nums text-foreground/70">
        {t('desktop.superMemoDrafts.sourceGrade', { grade })}
      </span>
      <AppDropdownMenu modal open={open} onOpenChange={setOpen}>
        <AppDropdownMenuTrigger asChild>
          <AppButton size="sm" disabled={disabled} className="w-full" contentClassName="w-full justify-between gap-2"
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

export function SuperMemoGradesPage({ value, onChange, disabled, preview, percent }: {
  value: SuperMemoGradeMap; onChange(value: SuperMemoGradeMap): void; disabled: boolean;
  preview: NativeSuperMemoPreview | undefined; percent: number;
}) {
  const t = useTranslation();
  return (
    <div className="grid min-w-0 gap-4 text-sm">
      <section className="grid min-w-0 gap-3" aria-label={t('desktop.superMemoDrafts.gradeMapping')}>
        <div className="flex justify-end">
          <AppButton type="button" size="sm" variant="ghost" disabled={disabled}
            onClick={() => onChange(DEFAULT_SUPER_MEMO_GRADE_MAP)}>
            {t('desktop.superMemoDrafts.resetGrades')}
          </AppButton>
        </div>
        <p className="max-w-prose text-xs leading-relaxed text-foreground/70">
          {t('desktop.superMemoDrafts.gradeHistoryHelp')}
        </p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-3">
          {value.map((rating, grade) => (
            <GradeChoice key={grade} grade={grade} rating={rating} disabled={disabled}
              onChange={next => onChange(value.map((current, index) => index === grade ? next : current))} />
          ))}
        </div>
        {preview?.pairedCollection ? <p className="max-w-prose text-xs leading-relaxed text-foreground/70">
          {t('desktop.superMemoDrafts.pairedLearningHelp')}
        </p> : null}
      </section>
      {preview?.directoryUpdate ? <p className="text-xs text-foreground/70">
        {t('desktop.superMemoDrafts.existingBatch')}
      </p> : preview ? <section className="grid min-w-0 gap-4 border-t border-settings-divider pt-4"
        aria-label={t('desktop.superMemoDrafts.scheduleImpact')}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{t('desktop.superMemoDrafts.scheduleImpact')}</h3>
          <p className="text-xs tabular-nums text-foreground/70">{t('desktop.superMemoDrafts.blend')} · {percent}%</p>
        </div>
        <SuperMemoDraftTable preview={preview} percent={percent} />
      </section> : null}
    </div>
  );
}
