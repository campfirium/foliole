import type { SuperMemoGradeMap } from '../../../../lib/core/import/superMemoSchedulePreview';
import type { SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

import { SuperMemoDraftTable } from './SuperMemoDraftTable';
import { SuperMemoGradeSettings } from './SuperMemoGradeSettings';
import { SuperMemoPreviewOptionFields } from './SuperMemoPreviewOptions';
import { SuperMemoSourceSettings } from './SuperMemoSourceSettings';
import type { useSuperMemoDraft } from './useSuperMemoDraft';

export function SuperMemoParameters({ preview, percent, setPercent, gradeMap, changeGrades, sourceFormat, changeSourceFormat, busy }: {
  preview: NonNullable<ReturnType<typeof useSuperMemoDraft>['draft']>['preview'];
  percent: number; setPercent(value: number): void; gradeMap: SuperMemoGradeMap;
  changeGrades(value: SuperMemoGradeMap): Promise<void>; sourceFormat: SuperMemoSourceFormat;
  changeSourceFormat(value: SuperMemoSourceFormat): void; busy: boolean;
}) {
  const t = useTranslation();
  return (<div className="grid gap-4">
    <div className="grid items-start gap-4 min-[850px]:grid-cols-[3fr_2fr]">
      <section className="grid gap-3 rounded-lg border border-foreground/15 p-4">
        <h3 className="text-sm font-medium">{t('desktop.superMemoDrafts.scheduleTitle')}</h3>
        <SuperMemoPreviewOptionFields percent={percent} onChange={setPercent} />
        <SuperMemoDraftTable preview={preview} percent={percent} />
        <p className="text-xs text-foreground/65">
          {t(preview.pairedCollection ? 'desktop.superMemoDrafts.pairedLimitations' : 'desktop.superMemoDrafts.xmlLimitations')}
        </p>
        <details className="space-y-2 text-xs text-foreground/65">
          <summary className="cursor-pointer">{t('desktop.superMemoDrafts.scheduleDetails')}</summary>
          <p>{t('desktop.superMemoDrafts.reapplyNote')}</p>
        </details>
      </section>
      <SuperMemoGradeSettings disabled={busy} value={gradeMap} onChange={next => void changeGrades(next)}
        hasPairedCollection={preview.pairedCollection === true} />
    </div>
    <SuperMemoSourceSettings value={sourceFormat} onChange={changeSourceFormat} disabled={busy} />
  </div>);
}
