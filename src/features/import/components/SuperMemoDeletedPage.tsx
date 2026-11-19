import { useEffect, useState } from 'react';

import type { SuperMemoDeletedEntry } from '../../../../lib/platform/nativeSuperMemoImportContract';
import { useTranslation } from '../../../shared/localization/LocalizationProvider';
import { getRuntimeSuperMemoSourceSelection } from '../../../shared/platform/import/superMemoImportRuntimeRepository';

export function SuperMemoDeletedPage() {
  const t = useTranslation();
  const [entries, setEntries] = useState<SuperMemoDeletedEntry[] | null>();
  useEffect(() => {
    let active = true;
    void getRuntimeSuperMemoSourceSelection(true)
      .then(selection => { if (active) setEntries(selection?.deletedEntries ?? []); })
      .catch(() => { if (active) setEntries(null); });
    return () => { active = false; };
  }, []);
  if (entries === undefined) return <p role="status">{t('desktop.superMemoDrafts.structureBodyLoading')}</p>;
  if (entries === null) return <p role="alert">{t('desktop.superMemoDrafts.deletedUnavailable')}</p>;
  if (!entries.length) return <p>{t('desktop.superMemoDrafts.deletedEmpty')}</p>;
  return (
    <ul className="divide-y divide-settings-divider">
      {entries.map(({ sourceId, title, status }) => (
        <li key={sourceId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-2 text-sm">
          <span className="break-words">{title} <span className="text-foreground/65">#{sourceId}</span></span>
          <span className="text-foreground/65">{t(status === 'trash'
            ? 'desktop.superMemoDrafts.deletedInTrash' : 'desktop.superMemoDrafts.deletedPermanently')}</span>
        </li>
      ))}
    </ul>
  );
}
