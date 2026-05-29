import { useWorkspaceStore } from '../../store/workspaceStore';

export function useWorkspaceTopicTreeActions() {
  return {
    createChildNode: useWorkspaceStore((state) => state.createChildNode),
    createVirtualNode: useWorkspaceStore((state) => state.createVirtualNode),
    deleteNodes: useWorkspaceStore((state) => state.deleteNodes),
    deleteNodesPermanently: useWorkspaceStore((state) => state.deleteNodesPermanently),
    dismissNode: useWorkspaceStore((state) => state.dismissNode),
    moveNodes: useWorkspaceStore((state) => state.moveNodes),
    restoreNode: useWorkspaceStore((state) => state.restoreNode),
    returnNode: useWorkspaceStore((state) => state.relearnNode),
    setNodeSequentialReading: useWorkspaceStore((state) => state.setNodeSequentialReading),
    setFolderManualChildOrder: useWorkspaceStore((state) => state.setFolderManualChildOrder),
    shelveNode: useWorkspaceStore((state) => state.shelveNode),
    unshelveNode: useWorkspaceStore((state) => state.unshelveNode),
    updateNodePriority: useWorkspaceStore((state) => state.updateNodePriority),
    updateNodeShortTerm: useWorkspaceStore((state) => state.updateNodeShortTerm),
    updateNodeTitle: useWorkspaceStore((state) => state.updateNodeTitle)
  };
}
