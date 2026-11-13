import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../../../shared/localization/translations';
import { createEmptyReviewSession } from '../../../store/workspaceReviewReading';
import { useWorkspaceStore } from '../../../store/workspaceStore';

import { NodeListRows } from './NodeListTreeRows';

it.each([
  [false, '暂无主题', '创建或导入主题后即可开始编辑。'],
  [true, '暂无虚拟文件夹', '创建虚拟文件夹，保存可重复使用的筛选视图。']
])('localizes the empty list (virtual: %s)', async (isVirtualViewOpen, title, description) => {
  await preloadTranslationCatalog('zh-Hans');
  useWorkspaceStore.setState({ isHydrated: true, workspaceHydrationError: null });
  render(
    <LocalizationProvider initialLanguagePreference="zh-Hans">
      <NodeListRows
        activeNodeId={null}
        collapsedNodeIds={new Set()}
        drag={{
          dropTargetNodeId: null, dropIntent: null,
          isRootDropActive: false,
          onDragStartNode: vi.fn(), onDragEnd: vi.fn(), onDragEnterNode: vi.fn(), onDragOverNode: vi.fn(),
          onDragLeaveNode: vi.fn(), onDragOverRoot: vi.fn(), onDropOnNode: vi.fn(), onDropRoot: vi.fn()
        }}
        highlightedNodeId={null}
        isTrashViewOpen={false}
        isVirtualViewOpen={isVirtualViewOpen}
        nodesById={{}}
        onContextMenu={vi.fn()}
        onExpandCollapse={vi.fn()}
        onRename={vi.fn()}
        onSelect={vi.fn()}
        onToggleCollapse={vi.fn()}
        reviewSession={createEmptyReviewSession()}
        rows={[]}
        rowSpacing={0}
        scrollContainerRef={{ current: null }}
        scrollTargetNodeId={null}
        selectedNodeIds={[]}
        selectedTrashNodeId={null}
        virtualizeRows={false}
      />
    </LocalizationProvider>
  );
  expect(screen.getByText(title)).toBeInTheDocument();
  expect(screen.getByText(description)).toBeInTheDocument();
});
