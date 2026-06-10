import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { expect, it } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import { createInitialWorkspaceState } from '../../store/workspaceStore';

import { useAppPaletteItems } from './useAppPaletteItems';

function createPaletteArgs(activeNodeId: string | null) {
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
    reviewSession: { isAnswerRevealed: false },
    reviewDueCount: 0,
    study: { canStartStudyMode: false, isDevReviewStatusBarPersistenceEnabled: false },
    ws: {
      appActionHistory: initial.appActionHistory,
      editorOperationHistory: initial.editorOperationHistory,
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

function wrapper({ children }: { children: ReactNode }) {
  return createElement(LocalizationProvider, null, children);
}

it('enables developer source reimport for the current non-folder topic surface', () => {
  const { result } = renderHook(
    () => useAppPaletteItems(createPaletteArgs('node-1') as unknown as Parameters<typeof useAppPaletteItems>[0]),
    { wrapper }
  );

  expect(result.current.find((item) => item.id === APP_COMMAND_IDS.reimportSelectedTopic)).toMatchObject({
    enabled: true
  });
});

it('enables review mode from the directory list when the review queue can start without an active topic', () => {
  const { result } = renderHook(() =>
    useAppPaletteItems({
      ...createPaletteArgs(null),
      activeNodeId: null,
      reviewDueCount: 0,
      study: { canStartStudyMode: true, isDevReviewStatusBarPersistenceEnabled: false }
    } as unknown as Parameters<typeof useAppPaletteItems>[0]), { wrapper }
  );

  expect(result.current.find((item) => item.id === APP_COMMAND_IDS.startStudyMode)).toMatchObject({
    enabled: true
  });
});

it('does not enable review mode from due count alone', () => {
  const { result } = renderHook(() =>
    useAppPaletteItems({
      ...createPaletteArgs(null),
      activeNodeId: null,
      reviewDueCount: 2,
      study: { canStartStudyMode: false, isDevReviewStatusBarPersistenceEnabled: false }
    } as unknown as Parameters<typeof useAppPaletteItems>[0]), { wrapper }
  );

  expect(result.current.find((item) => item.id === APP_COMMAND_IDS.startStudyMode)).toMatchObject({
    enabled: false
  });
});

it('keeps immersive reading available while review mode is active', () => {
  const { result } = renderHook(() =>
    useAppPaletteItems({
      ...createPaletteArgs('node-1'),
      isStudyMode: true
    } as unknown as Parameters<typeof useAppPaletteItems>[0]), { wrapper }
  );

  expect(result.current.find((item) => item.id === APP_COMMAND_IDS.toggleImmersiveMode)).toMatchObject({
    enabled: true
  });
});

it('keeps import commands enabled for the unified shortcut and menu command path', () => {
  const { result } = renderHook(() =>
    useAppPaletteItems({
      ...createPaletteArgs('node-1'),
      formalImportAvailable: false
    } as unknown as Parameters<typeof useAppPaletteItems>[0]), { wrapper }
  );

  expect(result.current.find((item) => item.id === APP_COMMAND_IDS.importSingleFile)).toMatchObject({
    enabled: true,
    shortcuts: { primary: { ctrlKey: true, key: 'o' } }
  });
  expect(result.current.find((item) => item.id === APP_COMMAND_IDS.clipboardImport)).toMatchObject({
    enabled: true,
    shortcuts: { primary: { altKey: true, ctrlKey: true, key: 'v' } }
  });
});
