import { useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

const EXTERNAL_SETUP_ROW_ID = 'external-library-setup';

export function ExternalLibrarySetupRow(props: {
  depth?: number;
  isSelected: boolean;
  label?: string;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onOpenRoot: () => void;
}) {
  const t = useTranslation();
  const rowSpacing = getNodeListRowSpacing();
  const onRowKeyDown = useMemo(
    () =>
      createNodeListRowKeydownHandler({
        collapsedNodeIds: new Set(),
        onSelect: props.onOpenRoot,
        onToggleCollapse: () => undefined,
        rows: [{ depth: props.depth ?? 0, hasChildren: false, id: EXTERNAL_SETUP_ROW_ID }]
      }),
    [props.depth, props.onOpenRoot]
  );

  return (
      <NodeTreeRow
        depth={props.depth ?? 0}
        hasChildren={false}
        isActive={props.isSelected}
        isCollapsed={false}
        isSelected={props.isSelected}
        label={props.label ?? t('desktop.externalLibrary.setupLabel')}
        nodeId={EXTERNAL_SETUP_ROW_ID}
        rowSpacing={rowSpacing}
        showIcon={false}
        showLeafChevronPlaceholder={false}
        onKeyDown={onRowKeyDown}
        {...(props.onContextMenu ? { onContextMenu: (_nodeId, event) => props.onContextMenu?.(event) } : {})}
        onSelect={props.onOpenRoot}
        onToggleCollapse={() => undefined}
      />
  );
}
