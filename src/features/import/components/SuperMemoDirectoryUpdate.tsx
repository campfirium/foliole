import type { SuperMemoSourceFormat } from '../../../../lib/core/import/superMemoSourceFormatting';
import type { NativeSuperMemoDirectoryUpdate } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import type { runRuntimeSuperMemoImport } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

import { SuperMemoSourceSettings } from './SuperMemoSourceSettings';

export function SuperMemoDirectoryUpdate({ update, sourceFormat, disabled, onSourceFormatChange }: {
  update: NativeSuperMemoDirectoryUpdate; sourceFormat: SuperMemoSourceFormat; disabled: boolean;
  onSourceFormatChange(next: SuperMemoSourceFormat): void;
}) {
  const t = useTranslation();
  if (update.pairedSourceRequired) return <p>{t('desktop.superMemoDrafts.updateNeedsCollection')}</p>;
  return <div className="grid gap-3">
    <SuperMemoSourceSettings value={sourceFormat} onChange={onSourceFormatChange} disabled={disabled} />
    <DirectoryChanges changes={update.changes} />
    <TextChanges changes={update.textChanges} />
    <FirstReviewChanges changes={update.firstReviewChanges} />
    {update.citationChanges.length ? <section className="grid gap-2">
      <h2 className="text-sm font-semibold">{t('desktop.superMemoDrafts.citationChanges')}</h2>
      <ul className="divide-y divide-foreground/10 text-sm">
        {update.citationChanges.map(change => <li key={change.sourceId} className="py-2">
          <span>{change.title}</span>
          <span className="ml-2 text-foreground/65">{t(change.status === 'update'
            ? 'desktop.superMemoDrafts.citationUpdate' : 'desktop.superMemoDrafts.citationProtected')}</span>
        </li>)}
      </ul>
    </section> : null}
  </div>;
}

function FirstReviewChanges({ changes }: { changes: NativeSuperMemoDirectoryUpdate['firstReviewChanges'] }) {
  const t = useTranslation();
  if (!changes.length) return null;
  return <section className="grid gap-2">
    <h2 className="text-sm font-semibold">{t('desktop.superMemoDrafts.firstReviewChanges')}</h2>
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

function TextChanges({ changes }: { changes: NativeSuperMemoDirectoryUpdate['textChanges'] }) {
  const t = useTranslation();
  if (!changes.length) return null;
  return <section className="grid gap-2">
    <h2 className="text-sm font-semibold">{t('desktop.superMemoDrafts.textChanges')}</h2>
    <ul className="divide-y divide-foreground/10 text-sm">
      {changes.map(change => <li key={`${change.sourceId}-${change.field}`} className="py-2">
        <span>{change.title} · {t(`desktop.superMemoDrafts.textField.${change.field}`)}</span>
        <span className="ml-2 text-foreground/65">{t(change.status === 'update'
          ? 'desktop.superMemoDrafts.textUpdate' : `desktop.superMemoDrafts.textProtected.${change.reason}`)}</span>
      </li>)}
    </ul>
  </section>;
}

function DirectoryChanges({ changes }: { changes: NativeSuperMemoDirectoryUpdate['changes'] }) {
  const t = useTranslation();
  if (!changes.length) return <p>{t('desktop.superMemoDrafts.noDirectoryChanges')}</p>;
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
  const withdrawn = result.directoryUpdate?.withdrawnSourceIds.length ?? 0;
  return <p role="status">{result.directoryUpdate ? t('desktop.superMemoDrafts.directoryUpdated', {
    count: result.directoryUpdate.changes.filter(change => change.status === 'move').length
  }) + (addedParents ? ' · ' + t('desktop.superMemoDrafts.directoryAdded', { count: addedParents }) : '')
    + (addedMaterials ? ' · ' + t('desktop.superMemoDrafts.directoryAddedMaterials', { count: addedMaterials }) : '')
    + (citations ? ' · ' + t('desktop.superMemoDrafts.citationsUpdated', { count: citations }) : '')
    + (text ? ' · ' + t('desktop.superMemoDrafts.textUpdated', { count: text }) : '')
    + (dates ? ' · ' + t('desktop.superMemoDrafts.firstReviewUpdated', { count: dates }) : '')
    + (withdrawn ? ' · ' + t('desktop.superMemoDrafts.withdrawn', { count: withdrawn }) : '') : t('desktop.superMemoDrafts.importResult', {
    imported: result.imported, skipped: result.skipped, unresolvedImages: result.unresolvedImages
  })}</p>;
}
