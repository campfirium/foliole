import { makeSuperMemoPreviewReport } from '../../../../lib/core/import/superMemoPreviewReport';
import type { NativeSuperMemoPreview } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

function sourcePath(id: number | null, rows: Map<number, NativeSuperMemoPreview['rows'][number]>) {
  const parts: string[] = [];
  while (id !== null) {
    const row = rows.get(id);
    if (!row) break;
    parts.unshift(row.title || `#${id}`);
    id = row.parentId;
  }
  return parts.join(' / ');
}

export function SuperMemoDraftTable({ preview, percent }: { preview: NativeSuperMemoPreview; percent: number }) {
  const t = useTranslation();
  const report = makeSuperMemoPreviewReport(preview, percent);
  const rowsById = new Map(preview.rows.map(row => [row.id, row]));
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
      <p>{t(preview.pairedCollection ? 'desktop.superMemoDrafts.pairedLimitations' : 'desktop.superMemoDrafts.xmlLimitations')}</p>
      {report.localImages || report.remoteImages || report.skippedAudio ? <p>{t('desktop.superMemoDrafts.media', {
        local: report.localImages, remote: report.remoteImages, audio: report.skippedAudio
      })}</p> : null}
      {report.details.length > 0 ? <details>
        <summary>{t('desktop.superMemoDrafts.details', { count: report.details.length })}</summary>
        <ul className="space-y-2">{report.details.map(row => (
          <li key={row.id}>
            <strong>{row.title || `#${row.id}`}</strong> · #{row.id}
            {row.parentId !== null ? <span> · {sourcePath(row.parentId, rowsById)}</span> : null}
            {row.issue ? <div>{t(`desktop.superMemoDrafts.issue.${row.issue}`, { history: row.historyCount })}</div> : null}
            {row.historyNeedsReview ? <div>{t('desktop.superMemoDrafts.issue.history', { history: row.historyCount })}</div> : null}
            {row.localImages || row.remoteImages || row.skippedAudio ? <div>{t('desktop.superMemoDrafts.media', {
              local: row.localImages ?? 0, remote: row.remoteImages ?? 0, audio: row.skippedAudio ?? 0
            })}</div> : null}
          </li>
        ))}</ul>
      </details> : null}
    </article>
  );
}
