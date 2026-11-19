import { useMemo } from 'react';

import { prepareSuperMemoDueDistribution } from '../../../../lib/core/import/superMemoDueDistribution';
import { calendarDateKey } from '../../../../lib/core/review/reviewCalendarDates';
import type { NativeSuperMemoPreview } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

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
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
    <p className="shrink-0 text-sm text-foreground/70">{t('desktop.superMemoDrafts.scheduleChartIntro')}</p>
    <SuperMemoPreviewOptionFields compact percent={percent} onChange={setPercent}
      disabled={busy} />
    <ScheduleChart preview={preview} percent={percent} />
  </div>;
}
