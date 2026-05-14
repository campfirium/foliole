import { useMemo } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';

const EXTERNAL_SETUP_ROW_ID = 'external-library-setup';

export function ExternalLibrarySetupRow(props: { isSelected: boolean; onOpenSettings: () => void }) {
  const rowSpacing = getNodeListRowSpacing();
  const onRowKeyDown = useMemo(
    () =>
      createNodeListRowKeydownHandler({
        collapsedNodeIds: new Set(),
        onSelect: props.onOpenSettings,
        onToggleCollapse: () => undefined,
        rows: [{ depth: 0, hasChildren: false, id: EXTERNAL_SETUP_ROW_ID }]
      }),
    [props.onOpenSettings]
  );

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
        onKeyDown={onRowKeyDown}
        onSelect={props.onOpenSettings}
        onToggleCollapse={() => undefined}
      />
    </section>
  );
}
