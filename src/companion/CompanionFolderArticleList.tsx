import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import { useTranslation } from '../shared/localization/LocalizationProvider';
import type { CompanionFolderListEntry } from '../shared/platform/companionBrowseLists';

import { CompanionDirectoryList } from './CompanionDirectoryListSurface';
import { useCompanionExternalDirectory } from './useCompanionExternalDirectory';

export function CompanionFolderArticleList(props: {
  items: CompanionFolderListEntry[];
  onSelectNode(nodeId: string): void;
  snapshot: WorkspaceSnapshot | null;
}) {
  const t = useTranslation();
  const directory = useCompanionExternalDirectory();
  return <CompanionDirectoryList
    directory={directory}
    emptyLabel={t('companion.directory.emptyShell')}
    onSelectItem={(item) => props.onSelectNode(item.nodeId)}
    sections={props.items.length ? [{ id: 'current', items: props.items.map((item) => ({ ...item, id: item.nodeId, source: 'internal' })) }] : []}
    snapshot={props.snapshot}
  />;
}
