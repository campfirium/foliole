import { useMemo } from 'react';

import { prepareSuperMemoDueDistribution } from '../../../../lib/core/import/superMemoDueDistribution';
import { calendarDateKey } from '../../../../lib/core/review/reviewCalendarDates';
import type { NativeSuperMemoPreview } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

import { FirstReviewChanges } from './SuperMemoDirectoryUpdate';
import { SuperMemoDueChart } from './SuperMemoDueChart';
import { SuperMemoPreviewOptionFields } from './SuperMemoPreviewOptions';

function ScheduleChart({ preview, percent }: { preview: NativeSuperMemoPreview; percent: number }) {
  const referenceDay = calendarDateKey(new Date());
  const data = useMemo(() => prepareSuperMemoDueDistribution({
    rows: preview.rows, referenceDay
  }), [preview.rows, referenceDay]);
  return <SuperMemoDueChart data={data} percent={percent} />;
}

export function SuperMemoSchedulePage({ preview, percent, setPercent, busy }: {
  preview: NativeSuperMemoPreview;
  percent: number;
  setPercent(value: number): void;
  busy: boolean;
}) {
  const t = useTranslation();
  return <div className={preview.directoryUpdate
    ? 'grid min-w-0 gap-4'
    : 'flex min-h-0 min-w-0 flex-1 flex-col gap-4'}>
    {preview.directoryUpdate ? <>
      <p className="text-sm">{t('desktop.superMemoDrafts.scheduleUpdateHelp')}</p>
      <FirstReviewChanges changes={preview.directoryUpdate.firstReviewChanges} showHeading={false} />
      <p className="text-xs text-foreground/70">{t('desktop.superMemoDrafts.scheduleBatchHelp')}</p>
    </> : <>
      <p className="shrink-0 text-sm text-foreground/70">{t('desktop.superMemoDrafts.scheduleChartIntro')}</p>
      <SuperMemoPreviewOptionFields compact percent={percent} onChange={setPercent} disabled={busy} />
      <ScheduleChart preview={preview} percent={percent} />
    </>}
  </div>;
}
