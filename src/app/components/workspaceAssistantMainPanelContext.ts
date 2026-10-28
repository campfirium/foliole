import type { NativeAssistantWorkspaceContext } from '../../../lib/platform/nativeAssistantContract';
import { getStoredAppLocale } from '../../shared/localization/appLanguage';
import { resolveNodeDisplayTitle } from '../../shared/localization/systemEntryNames';

import type { WorkspaceGridContentProjectionSource } from './workspaceGridContentProps';
import type { WorkspaceLayoutProps } from './workspaceLayoutGroupedProps';

export function resolveAssistantMainPanelWorkspaceContext(args: {
  props: Pick<WorkspaceGridContentProjectionSource, 'nodeList' | 'trash' | 'virtualView'>;
}): NativeAssistantWorkspaceContext | undefined {
  const virtualNodeId = args.props.virtualView.activeVirtualNodeId;
  if (!args.props.virtualView.isVirtualViewOpen || !virtualNodeId) return undefined;
  const title = resolveVirtualPanelTitle(virtualNodeId, args.props);
  return {
    activeKind: 'folder',
    activeNodeId: virtualNodeId,
    activeTitle: title,
    path: [title],
    schemaVersion: 1,
    scope: 'node'
  };
}

function resolveVirtualPanelTitle(
  virtualNodeId: string,
  props: Pick<WorkspaceLayoutProps, 'nodeList' | 'virtualView'>
) {
  return resolveNodeDisplayTitle(
    getStoredAppLocale(),
    virtualNodeId,
    props.nodeList.nodesById[virtualNodeId]?.title || 'Virtual'
  );
}
