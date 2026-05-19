import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { createInitialWorkspaceState } from '../../store/workspaceStore';

import { useAppPaletteItems } from './useAppPaletteItems';

function createPaletteArgs(activeNodeId: string) {
  const initial = createInitialWorkspaceState(new Date('2026-05-18T00:00:00.000Z'));
  return {
    activeNodeId,
    formalImportAvailable: true,
    hasReviewCard: false,
    hotkeys: {
      overrides: {},
      resetAllShortcuts: () => undefined,
      resetShortcut: () => undefined,
      shortcutMap: {},
      updateShortcut: () => ({ status: 'applied' as const })
    },
    isCurrentReviewItemGradable: false,
    isImmersiveMode: false,
    isStudyMode: false,
    isViewingTrashNode: false,
    nav: { canGoBack: false, canGoForward: false, canGoParent: false },
    resolvedBaseColorMode: 'light' as const,
    reviewSession: { isAnswerRevealed: false },
    study: { canStartStudyMode: false },
    ws: {
      nodeOrder: ['node-1'],
      nodesById: {
        'node-1': {
          ...initial.nodesById['node-1']!,
          id: 'node-1',
          kind: 'item' as const,
          parentNodeId: 'source-topic'
        }
      },
      trashedNodeIds: []
    }
  };
}

it('enables developer source reimport for the current non-folder topic surface', () => {
  const { result } = renderHook(() =>
    useAppPaletteItems(createPaletteArgs('node-1') as unknown as Parameters<typeof useAppPaletteItems>[0])
  );

  expect(result.current.find((item) => item.id === APP_COMMAND_IDS.reimportSelectedTopic)).toMatchObject({
    enabled: true
  });
});
