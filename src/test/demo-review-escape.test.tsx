import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, expect, it } from 'vitest';

import './app-smoke.shared';

import { App } from '../app/App';
import { createDemoWorkspaceSnapshot } from '../demo/demoWorkspaceSnapshot';
import { preloadTranslationCatalog } from '../shared/localization/translations';
import { installDemoRuntimeController, type DemoRuntimeController } from '../shared/platform/runtime/demoRuntime';
import { useWorkspaceStore } from '../store/workspaceStore';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

function installDemoRuntime() {
  const state = {
    clearError: null,
    importError: null,
    importedTopicCount: 0,
    isDemo: true,
    manualAdvanceDays: 0,
    previewDay: 0,
    startedAt: null
  };
  installDemoRuntimeController({
    clearLocalData: async () => true,
    continueToNextPreviewDay: () => undefined,
    getNowIso: (now) => now.toISOString(),
    getState: () => state,
    importMarkdown: async () => ({ ignoredCount: 0, importedTopicCount: 0 }),
    subscribe: () => () => undefined
  } satisfies DemoRuntimeController);
}

function seedDemoWorkspace() {
  const snapshot = createDemoWorkspaceSnapshot('/demo/', new Date('2026-06-17T00:00:00.000Z'));
  useWorkspaceStore.setState({
    ...snapshot,
    isHydrated: true
  });
  return snapshot.activeNodeId!;
}

it('leaves Demo Flow editing with Escape before running reading shortcuts', async () => {
  installDemoRuntime();
  seedDemoWorkspace();

  render(<App />);

  expect(await screen.findByRole('button', { name: 'Read' })).toBeInTheDocument();
  await act(async () => {});
  const reviewNodeId = useWorkspaceStore.getState().reviewSession.currentNodeId!;
  const editor = screen.getByTestId('editor-value');
  expect(editor.closest('.markdown-editor-host')).toHaveAttribute('data-review-escape-blur', 'true');
  const initialNextAt = useWorkspaceStore.getState().nodesById[reviewNodeId]?.reading?.nextAt;
  expect(initialNextAt).toBeTruthy();

  editor.focus();
  fireEvent.focusIn(editor);
  expect(document.activeElement).toBe(editor);
  fireEvent.keyDown(window, { code: 'Digit2', key: '2' });
  expect(useWorkspaceStore.getState().nodesById[reviewNodeId]?.reading?.nextAt).toBe(initialNextAt);

  const activeEditor = screen.getByTestId('editor-value');
  expect(document.body.contains(activeEditor)).toBe(true);
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'Escape', key: 'Escape' }));
  await waitFor(() => expect(document.activeElement).not.toBe(activeEditor));
  fireEvent.keyDown(window, { code: 'Digit2', key: '2' });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().nodesById[reviewNodeId]?.reading?.nextAt).not.toBe(initialNextAt);
  });
});
