import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

import { SuperMemoDraftTable } from './SuperMemoDraftTable';
import { SuperMemoGradeSettings } from './SuperMemoGradeSettings';
import { SuperMemoPreviewOptionFields } from './SuperMemoPreviewOptions';
import { SuperMemoSourceSettings } from './SuperMemoSourceSettings';
import type { useSuperMemoDraft } from './useSuperMemoDraft';

export function SuperMemoParameters({ step, preview, percent, setPercent, gradeMap, changeGrades, sourceFormat, changeSourceFormat, busy }: {
  step: 'schedule' | 'grades' | 'source';
  preview: NonNullable<ReturnType<typeof useSuperMemoDraft>['draft']>['preview'];
  percent: number; setPercent(value: number): void; gradeMap: SuperMemoGradeMap;
  changeGrades(value: SuperMemoGradeMap): Promise<void>; sourceFormat: SuperMemoSourceFormat;
  changeSourceFormat(value: SuperMemoSourceFormat): void; busy: boolean;
}) {
  const t = useTranslation();
  if (step === 'grades') return <SuperMemoGradeSettings disabled={busy} value={gradeMap}
    onChange={next => void changeGrades(next)} hasPairedCollection={preview.pairedCollection === true} />;
  if (step === 'source') return <SuperMemoSourceSettings compact value={sourceFormat} onChange={changeSourceFormat} disabled={busy} />;
  return (
    <div className="mx-auto grid w-full max-w-6xl items-start gap-5">
      <section className="grid min-w-0 gap-3">
        <h3 className="text-sm font-semibold">{t('desktop.superMemoDrafts.scheduleTitle')}</h3>
        <SuperMemoPreviewOptionFields compact percent={percent} onChange={setPercent} />
      </section>
      <section className="grid min-w-0 gap-4 rounded-lg border border-[var(--role-content-line)] bg-[var(--role-content-tint-bg)] p-4">
        <h3 className="text-sm font-semibold">{t('desktop.superMemoDrafts.scheduleImpact')}</h3>
        <SuperMemoDraftTable preview={preview} percent={percent} />
        <p className="text-xs leading-relaxed text-foreground/70">
          {t(preview.pairedCollection ? 'desktop.superMemoDrafts.pairedLimitations' : 'desktop.superMemoDrafts.xmlLimitations')}
        </p>
        <details className="space-y-2 text-xs leading-relaxed text-foreground/70">
          <summary className="cursor-pointer">{t('desktop.superMemoDrafts.scheduleDetails')}</summary>
          <p>{t('desktop.superMemoDrafts.reapplyNote')}</p>
        </details>
      </section>
    </div>
  );
}
