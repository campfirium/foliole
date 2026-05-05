import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';

const EXTERNAL_SETUP_ROW_ID = 'external-library-setup';

export function ExternalLibrarySetupRow(props: { isSelected: boolean; onOpenSettings: () => void }) {
  const rowSpacing = getNodeListRowSpacing();

  return (
    <section aria-label="External folder tree" className="flex flex-col pb-2 pt-1" role="tree">
      <NodeTreeRow
        depth={0}
        hasChildren={false}
        isActive={props.isSelected}
        isCollapsed={false}
        isSelected={props.isSelected}
        label="External"
        nodeId={EXTERNAL_SETUP_ROW_ID}
        rowSpacing={rowSpacing}
        showIcon={false}
        onSelect={props.onOpenSettings}
        onToggleCollapse={() => undefined}
      />
    </section>
  );
}
