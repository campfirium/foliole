import { MarkdownEditor } from '../features/editor/components/MarkdownEditor';
import type { Node } from '../features/nodes/model/nodeTypes';
import { Button, EmptyState, Panel } from '../shared/ui';
import { useWorkspaceStore } from '../store/workspaceStore';

export function App() {
  const activeNodeId = useWorkspaceStore((state) => state.activeNodeId);
  const nodeOrder = useWorkspaceStore((state) => state.nodeOrder);
  const nodesById = useWorkspaceStore((state) => state.nodesById);
  const updateNodeContent = useWorkspaceStore((state) => state.updateNodeContent);
  const setActiveNode = useWorkspaceStore((state) => state.setActiveNode);

  const activeNode = activeNodeId ? nodesById[activeNodeId] : undefined;
  const editorContent = activeNode?.content ?? '';

  const handleEditorChange = (content: string) => {
    if (!activeNode) {
      return;
    }
    updateNodeContent(activeNode.id, content);
  };

  return (
    <main aria-label="Foliole workspace" className="workspace-shell">
      <div className="workspace-grid">
        <Panel
          ariaLabel="Node list panel"
          as="aside"
          bodyClassName="node-list"
          className="panel-list"
          scrollBody
          title="Nodes"
        >
          {nodeOrder.length === 0 ? (
            <EmptyState description="Create or import a node to start editing." title="No nodes" />
          ) : (
            nodeOrder.map((nodeId) => (
              <NodeRow
                isActive={activeNodeId === nodeId}
                key={nodeId}
                node={nodesById[nodeId]}
                onSelect={setActiveNode}
              />
            ))
          )}
        </Panel>

        <section aria-label="Document area" className="panel-document-shell">
          <Panel
            ariaLabel="Document panel"
            bodyClassName="editor-body"
            className="panel-editor"
            title="Document"
          >
            <MarkdownEditor
              onChange={handleEditorChange}
              value={editorContent}
            />
          </Panel>
        </section>
      </div>
    </main>
  );
}

interface NodeRowProps {
  isActive: boolean;
  node: Node | undefined;
  onSelect: (nodeId: string) => void;
}

function NodeRow({ isActive, node, onSelect }: NodeRowProps) {
  if (!node) {
    return null;
  }

  return (
    <Button
      active={isActive}
      aria-pressed={isActive}
      className="node-row"
      onClick={() => onSelect(node.id)}
      variant="list"
    >
      {node.title}
    </Button>
  );
}
