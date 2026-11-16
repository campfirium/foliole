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
              {change.status === 'add' ? t('desktop.superMemoDrafts.directoryAdd', { to: change.to ?? root }) : null}
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
  const added = result.directoryUpdate?.changes.filter(change => change.status === 'add').length ?? 0;
  const citations = result.directoryUpdate?.citationChanges.filter(change => change.status === 'update').length ?? 0;
  return <p role="status">{result.directoryUpdate ? t('desktop.superMemoDrafts.directoryUpdated', {
    count: result.directoryUpdate.changes.filter(change => change.status === 'move').length
  }) + (added ? ' · ' + t('desktop.superMemoDrafts.directoryAdded', { count: added }) : '')
    + (citations ? ' · ' + t('desktop.superMemoDrafts.citationsUpdated', { count: citations }) : '') : t('desktop.superMemoDrafts.importResult', {
    imported: result.imported, skipped: result.skipped, unresolvedImages: result.unresolvedImages
  })}</p>;
}
