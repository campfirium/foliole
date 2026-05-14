import { deriveNodeTitleFromContent } from '../../features/nodes/model/deriveNodeTitle';
import { useWorkspaceStore } from '../../store/workspaceStore';

export function forceUpdateDebugNodeContent(nodeId: string, content: string) {
  useWorkspaceStore.setState((currentState) => {
    const node = currentState.nodesById[nodeId];
    if (!node) return currentState;
    const hasContent = content.trim().length > 0;
    return {
      nodesById: {
        ...currentState.nodesById,
        [nodeId]: {
          ...node,
          bodyStatus: hasContent ? 'ready' : 'empty',
          content,
          hasContent,
          title: node.isTitleManual ? node.title : deriveNodeTitleFromContent(content),
          updatedAt: new Date().toISOString()
        }
      }
    };
  });
}
