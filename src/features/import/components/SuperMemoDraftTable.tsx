import { makeSuperMemoPreviewReport } from '../../../../lib/core/import/superMemoPreviewReport';
import type { NativeSuperMemoPreview } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

export function SuperMemoDraftTable({ preview, percent }: { preview: NativeSuperMemoPreview; percent: number }) {
  const t = useTranslation();
  const report = makeSuperMemoPreviewReport(preview, percent);
  return (
    <article className="min-h-0 space-y-3 overflow-auto text-sm">
      <p>{t('desktop.superMemoDrafts.outcomes', report.counts)}</p>
      {report.groups.length > 0 ? (
        <table className="w-full text-left tabular-nums">
          <thead><tr>
            <th>{t('desktop.superMemoDrafts.intervalGroup')}</th>
            <th>{t('desktop.superMemoDrafts.cards')}</th>
            <th>{t('desktop.superMemoDrafts.sourceMedian')}</th>
            <th>{t('desktop.superMemoDrafts.plannedMedian')}</th>
          </tr></thead>
          <tbody>{report.groups.map(group => (
            <tr key={group.label}><td>{group.label}</td><td>{group.count}</td>
              <td>{group.source}</td><td>{group.planned}</td></tr>
          ))}</tbody>
        </table>
      ) : null}
      <p>{t('desktop.superMemoDrafts.loadChange', {
        original: report.sourceDue, planned: report.totalDue, added: report.addedDue,
        deferred: report.deferred, unknown: report.unknownDates, noHistory: report.noHistory
      })}</p>
      {report.pendingNewItems > 0 ? <p>{t('desktop.superMemoDrafts.pendingNewItems', { count: report.pendingNewItems })}</p> : null}
      {report.localImages || report.remoteImages || report.skippedAudio ? <p>{t('desktop.superMemoDrafts.media', {
        local: report.localImages, remote: report.remoteImages, audio: report.skippedAudio
      })}</p> : null}
    </article>
  );
}
