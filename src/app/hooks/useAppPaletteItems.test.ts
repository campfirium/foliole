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
      shortcutMap: {
        [APP_COMMAND_IDS.clipboardImport]: { primary: { altKey: true, ctrlKey: true, key: 'v' } },
        [APP_COMMAND_IDS.importSingleFile]: { primary: { ctrlKey: true, key: 'o' } }
      },
      updateShortcut: () => ({ status: 'applied' as const })
    },
    isCurrentReviewItemGradable: false,
    isImmersiveMode: false,
    isStudyMode: false,
    isViewingTrashNode: false,
    nav: { canGoBack: false, canGoForward: false, canGoParent: false },
    reviewSession: { isAnswerRevealed: false },
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
          parentNodeId: 'source-topic',
          content: '',
          bodyStatus: 'ready' as const
        }
      },
      trashedNodeIds: []
    }
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(LocalizationProvider, null, children);
}

function enabledState(activeNodeId: string | null, overrides: Record<string, unknown> = {}) {
  const { result } = renderHook(() =>
    useAppPaletteItems({
      ...createPaletteArgs(activeNodeId),
      ...overrides
    } as unknown as Parameters<typeof useAppPaletteItems>[0]), { wrapper }
  );
  return Object.fromEntries(result.current.map((item) => [item.id, item.enabled]));
}

function enabledStateForNode(node: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const args = createPaletteArgs('node-1');
  return enabledState('node-1', {
    ...overrides,
    ws: {
      ...args.ws,
      nodesById: { 'node-1': { ...args.ws.nodesById['node-1'], ...node } }
    }
  });
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
      study: { canStartStudyMode: true, isDevReviewStatusBarPersistenceEnabled: false }
    } as unknown as Parameters<typeof useAppPaletteItems>[0]), { wrapper }
  );

  expect(result.current.find((item) => item.id === APP_COMMAND_IDS.startStudyMode)).toMatchObject({
    enabled: true
  });
});

it('does not enable review mode without a startable review queue', () => {
  const { result } = renderHook(() =>
    useAppPaletteItems({
      ...createPaletteArgs(null),
      activeNodeId: null,
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

it('offers the custom copy manager as a localized settings command', () => {
  const { result } = renderHook(
    () => useAppPaletteItems(createPaletteArgs(null) as unknown as Parameters<typeof useAppPaletteItems>[0]),
    { wrapper }
  );

  expect(result.current.find((item) => item.id === APP_COMMAND_IDS.openCustomCopy)).toMatchObject({
    enabled: true,
    section: 'Settings',
    title: 'Open Custom Copy'
  });
});

it('keeps current-node commands disabled when a non-node surface owns the center panel', () => {
  for (const overrides of [
    { isExternalViewOpen: true },
    { isFoliolePublishedContext: true },
    { isViewingTrashNode: true }
  ]) {
    const state = enabledState(null, overrides);
    expect(state[APP_COMMAND_IDS.renameNode]).toBe(false);
    expect(state[APP_COMMAND_IDS.enterPriorityMode]).toBe(false);
    expect(state[APP_COMMAND_IDS.findInTopic]).toBe(false);
    expect(state[APP_COMMAND_IDS.addSelectionNote]).toBe(false);
  }
});

it('targets the active derived or review-only item without enabling topic-only commands', () => {
  const state = enabledState('node-1', { isReviewOnly: true });

  expect(state[APP_COMMAND_IDS.renameNode]).toBe(true);
  expect(state[APP_COMMAND_IDS.enterPriorityMode]).toBe(true);
  expect(state[APP_COMMAND_IDS.addSelectionNote]).toBe(true);
  expect(state[APP_COMMAND_IDS.findInTopic]).toBe(false);
  expect(state[APP_COMMAND_IDS.mergeHighlightsIntoTopic]).toBe(false);
});

it('keeps the current-node command matrix distinct from topic-only editor commands', () => {
  const topic = enabledStateForNode({ anchorLink: null, kind: 'topic' });
  const derived = enabledStateForNode({
    anchorLink: { id: 'anchor-1', kind: 'highlight', locator: { from: 0, originalText: 'x', to: 1 } },
    kind: 'item'
  });

  for (const commandId of [
    APP_COMMAND_IDS.renameNode,
    APP_COMMAND_IDS.enterPriorityMode,
    APP_COMMAND_IDS.exportCurrentArticle,
    APP_COMMAND_IDS.createSelectionHighlight,
    APP_COMMAND_IDS.createSelectionCloze,
    APP_COMMAND_IDS.addSelectionNote,
    APP_COMMAND_IDS.toggleImmersiveMode
  ]) {
    expect(topic[commandId], `topic ${commandId}`).toBe(true);
    expect(derived[commandId], `derived ${commandId}`).toBe(true);
  }

  for (const commandId of [
    APP_COMMAND_IDS.findInTopic,
    APP_COMMAND_IDS.splitTopic,
    APP_COMMAND_IDS.mergeHighlightsIntoTopic,
    APP_COMMAND_IDS.publishToFoliole,
    APP_COMMAND_IDS.publishToDiscourse,
    APP_COMMAND_IDS.publishToWordPress
  ]) {
    expect(topic[commandId], `topic ${commandId}`).toBe(true);
    expect(derived[commandId], `derived ${commandId}`).toBe(false);
  }
});

it('removes every current-node target when a non-node surface owns the workspace', () => {
  const commandIds = [
    APP_COMMAND_IDS.renameNode,
    APP_COMMAND_IDS.enterPriorityMode,
    APP_COMMAND_IDS.exportCurrentArticle,
    APP_COMMAND_IDS.findInTopic,
    APP_COMMAND_IDS.splitTopic,
    APP_COMMAND_IDS.mergeHighlightsIntoTopic,
    APP_COMMAND_IDS.createSelectionHighlight,
    APP_COMMAND_IDS.createSelectionCloze,
    APP_COMMAND_IDS.addSelectionNote,
    APP_COMMAND_IDS.toggleImmersiveMode
  ];

  for (const overrides of [
    { isExternalViewOpen: true },
    { isFoliolePublishedContext: true },
    { isViewingTrashNode: true }
  ]) {
    const state = enabledState(null, overrides);
    for (const commandId of commandIds) {
      expect(state[commandId], `${JSON.stringify(overrides)} ${commandId}`).toBe(false);
    }
  }
});
