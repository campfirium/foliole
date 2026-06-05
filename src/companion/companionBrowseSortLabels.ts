import type { FolderListSortKey } from '../features/nodes/model/folderListOrdering';
import type { useTranslation } from '../shared/localization/LocalizationProvider';
import type { TranslationKey } from '../shared/localization/translations';

export const COMPANION_SORT_LABEL_KEYS: Record<FolderListSortKey, TranslationKey> = {
  dateImported: 'companion.browse.sort.dateImported',
  dateLastOpened: 'companion.browse.sort.lastOpened',
  dateSaved: 'companion.browse.sort.dateModified',
  manual: 'companion.browse.sort.manual',
  name: 'companion.browse.sort.name'
};

export function translateCompanionSortOrderLabel(label: string, t: ReturnType<typeof useTranslation>) {
  if (label === 'A -> Z') return t('companion.browse.sortOrder.az');
  if (label === 'Z -> A') return t('companion.browse.sortOrder.za');
  if (label === 'Manual order') return t('companion.browse.sortOrder.manual');
  if (label === 'Older -> Recent') return t('companion.browse.sortOrder.older');
  return t('companion.browse.sortOrder.recent');
}
