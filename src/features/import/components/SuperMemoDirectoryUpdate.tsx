import type { NativeSuperMemoDirectoryUpdate } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import type { runRuntimeSuperMemoImport } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

export function CitationChanges({ changes }: { changes: NativeSuperMemoDirectoryUpdate['citationChanges'] }) {
  const t = useTranslation();
  return <section className="grid gap-2">
    <h2 className="text-sm font-semibold">{t('desktop.superMemoDrafts.citationChanges')}</h2>
    <ul className="divide-y divide-foreground/10 text-sm">
      {changes.map(change => <li key={change.sourceId} className="grid gap-1 py-2">
        <span>{change.title}</span>
        <span className="text-foreground/65">{t(change.status === 'update'
          ? 'desktop.superMemoDrafts.citationUpdate' : 'desktop.superMemoDrafts.citationProtected')}</span>
      </li>)}
    </ul>
  </section>;
}

export function SourceMatch({ match }: { match: NonNullable<NativeSuperMemoDirectoryUpdate['sourceMatch']> }) {
  const t = useTranslation();
  return <section className="grid gap-2">
    <h2 className="text-sm font-semibold">{t('desktop.superMemoDrafts.exportMatch')}</h2>
    <p className="text-sm">{match.status === 'verified'
      ? t('desktop.superMemoDrafts.exportMatched', { matched: match.matched, additions: match.additions })
      : t(`desktop.superMemoDrafts.exportStatus.${match.status}`)}</p>
    {match.conflicts.length ? <ul className="divide-y divide-foreground/10 text-sm">
      {match.conflicts.map(conflict => <li key={conflict.sourceId} className="py-2">
        <span>{conflict.title || `#${conflict.sourceId}`}</span>
        <span className="ml-2 text-foreground/65">{t(`desktop.superMemoDrafts.exportConflict.${conflict.reason}`)}</span>
      </li>)}
    </ul> : null}
  </section>;
}

export function FirstReviewChanges({ changes, showHeading = true }: {
  changes: NativeSuperMemoDirectoryUpdate['firstReviewChanges']; showHeading?: boolean;
}) {
  const t = useTranslation();
  if (!changes.length) return null;
  return <section className="grid gap-2">
    {showHeading ? <h2 className="text-sm font-semibold">{t('desktop.superMemoDrafts.firstReviewChanges')}</h2> : null}
    <ul className="divide-y divide-foreground/10 text-sm">
      {changes.map(change => <li key={change.sourceId} className="grid gap-1 py-2">
        <span>{change.title}</span>
        <span className="text-foreground/65">
          {change.status === 'update' ? t('desktop.superMemoDrafts.directoryMove', { from: change.from ?? '', to: change.to ?? '' }) : null}
          {change.status === 'basis' ? t('desktop.superMemoDrafts.firstReviewBasis', { date: change.from ?? '' }) : null}
          {change.status === 'protected' ? t('desktop.superMemoDrafts.firstReviewProtected', { date: change.from ?? '' }) : null}
          {change.status === 'unavailable' ? t('desktop.superMemoDrafts.firstReviewUnavailable') : null}
        </span>
      </li>)}
    </ul>
  </section>;
}

export function TextChanges({ changes }: { changes: NativeSuperMemoDirectoryUpdate['textChanges'] }) {
  const t = useTranslation();
  if (!changes.length) return null;
  return <section className="grid gap-2">
    <h2 className="text-sm font-semibold">{t('desktop.superMemoDrafts.textChanges')}</h2>
    <p className="text-sm text-foreground/75">{t('desktop.superMemoDrafts.textChangesExplanation')}</p>
    <ul className="divide-y divide-foreground/10 text-sm">
      {changes.map(change => <li key={`${change.sourceId}-${change.field}`} className="py-2">
        <span>{change.title} · {t(`desktop.superMemoDrafts.textField.${change.field}`)}</span>
        <span className="ml-2 text-foreground/65">{t(change.status === 'update'
          ? 'desktop.superMemoDrafts.textUpdate' : `desktop.superMemoDrafts.textProtected.${change.reason}`)}</span>
      </li>)}
    </ul>
  </section>;
}

export function DirectoryChanges({ changes }: { changes: NativeSuperMemoDirectoryUpdate['changes'] }) {
  const t = useTranslation();
  if (!changes.length) return null;
  const root = t('desktop.superMemoDrafts.directoryRoot');
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold">{t('desktop.superMemoDrafts.directoryChanges')}</h2>
      <ul className="divide-y divide-foreground/10 text-sm">
        {changes.map(change => (
          <li key={change.sourceId} className="grid gap-1 py-2">
            <span>{change.title}</span>
            <span className="text-foreground/65">
              {change.status === 'move' ? t('desktop.superMemoDrafts.directoryMove', { from: change.from ?? root, to: change.to ?? root }) : null}
              {change.status === 'add' ? t(change.missingParent ? 'desktop.superMemoDrafts.directoryAdd' :
                'desktop.superMemoDrafts.directoryAddMaterial', { to: change.toInbox ? t('desktop.superMemoDrafts.directoryInbox') : change.to ?? root }) : null}
              {change.status === 'add-unavailable' ? t('desktop.superMemoDrafts.directoryAddUnavailable') : null}
              {change.status === 'protected' ? t('desktop.superMemoDrafts.directoryProtected') : null}
              {change.status === 'anchor-unverified' ? t('desktop.superMemoDrafts.directoryAnchorUnverified', { to: change.to ?? root }) : null}
              {change.restoreAnchor ? <span className={change.status === 'move' ? 'ml-2' : undefined}>{t('desktop.superMemoDrafts.directoryAnchorRestore')}</span> : null}
              {change.reanchor ? <span className="ml-2">{t('desktop.superMemoDrafts.directoryAnchorMove')}</span> : null}
              {change.status === 'unavailable' ? t('desktop.superMemoDrafts.directoryUnavailable') : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SuperMemoResult({ result }: { result: Awaited<ReturnType<typeof runRuntimeSuperMemoImport>> }) {
  const t = useTranslation();
  const additions = result.directoryUpdate?.changes.filter(change => change.status === 'add') ?? [];
  const addedParents = additions.filter(change => change.missingParent).length;
  const addedMaterials = additions.length - addedParents;
  const citations = result.directoryUpdate?.citationChanges.filter(change => change.status === 'update').length ?? 0;
  const text = result.directoryUpdate?.textChanges.filter(change => change.status === 'update').length ?? 0;
  const dates = result.directoryUpdate?.firstReviewChanges.filter(change => change.status === 'update' || change.status === 'basis').length ?? 0;
  const anchors = result.directoryUpdate?.changes.filter(change => change.restoreAnchor).length ?? 0;
  const withdrawn = result.directoryUpdate?.withdrawnSourceIds.length ?? 0;
  if (!result.directoryUpdate) return <p role="status">{t('desktop.superMemoDrafts.importResult', {
    imported: result.imported, skipped: result.skipped, unresolvedImages: result.unresolvedImages
  })}</p>;
  const moved = result.directoryUpdate.changes.filter(change => change.status === 'move').length;
  const summary = [
    moved && t('desktop.superMemoDrafts.directoryUpdated', { count: moved }),
    citations && t('desktop.superMemoDrafts.citationsUpdated', { count: citations }),
    text && t('desktop.superMemoDrafts.textUpdated', { count: text }),
    addedParents && t('desktop.superMemoDrafts.directoryAdded', { count: addedParents }),
    addedMaterials && t('desktop.superMemoDrafts.directoryAddedMaterials', { count: addedMaterials }),
    anchors && t('desktop.superMemoDrafts.directoryAnchorsRestored', { count: anchors }),
    dates && t('desktop.superMemoDrafts.firstReviewUpdated', { count: dates }),
    withdrawn && t('desktop.superMemoDrafts.withdrawn', { count: withdrawn }),
    result.directoryUpdate.sourceMatch?.linkOnConfirm && t('desktop.superMemoDrafts.exportLinked')
  ].filter(Boolean).join(' · ');
  return summary ? <p role="status">{summary}</p> : null;
}
