import { useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

const EXTERNAL_SETUP_ROW_ID = 'external-library-setup';

export function ExternalLibrarySetupRow(props: {
  isSelected: boolean;
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
        rows: [{ depth: 0, hasChildren: false, id: EXTERNAL_SETUP_ROW_ID }]
      }),
    [props.onOpenRoot]
  );

  return (
    <section aria-label={t('desktop.externalLibrary.folderTree')} className="flex flex-col pb-2 pt-1" role="tree">
      <NodeTreeRow
        depth={0}
        hasChildren={false}
        isActive={props.isSelected}
        isCollapsed={false}
        isSelected={props.isSelected}
        label={t('desktop.externalLibrary.setupLabel')}
        nodeId={EXTERNAL_SETUP_ROW_ID}
        rowSpacing={rowSpacing}
        showIcon={false}
        onKeyDown={onRowKeyDown}
        {...(props.onContextMenu ? { onContextMenu: (_nodeId, event) => props.onContextMenu?.(event) } : {})}
        onSelect={props.onOpenRoot}
        onToggleCollapse={() => undefined}
      />
    </section>
  );
}
