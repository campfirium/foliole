import type { NativeSuperMemoDirectoryUpdate } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';

export function SuperMemoDirectoryUpdate({ update }: { update: NativeSuperMemoDirectoryUpdate }) {
  const t = useTranslation();
  if (update.pairedSourceRequired) return <p>{t('desktop.superMemoDrafts.updateNeedsCollection')}</p>;
  if (!update.changes.length) return <p>{t('desktop.superMemoDrafts.noDirectoryChanges')}</p>;
  const root = t('desktop.superMemoDrafts.directoryRoot');
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold">{t('desktop.superMemoDrafts.directoryChanges')}</h2>
      <ul className="divide-y divide-foreground/10 text-sm">
        {update.changes.map(change => (
          <li key={change.sourceId} className="grid gap-1 py-2">
            <span>{change.title}</span>
            <span className="text-foreground/65">
              {change.status === 'move'
                ? t('desktop.superMemoDrafts.directoryMove', { from: change.from ?? root, to: change.to ?? root })
                : t(change.status === 'protected' ? 'desktop.superMemoDrafts.directoryProtected' : 'desktop.superMemoDrafts.directoryUnavailable')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
