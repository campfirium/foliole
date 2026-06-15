import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import './reactPdfMock';

vi.mock('../shared/platform/bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/platform/bridge')>();
  return {
    ...actual,
    getRuntimeInvoke: vi.fn()
  };
});
vi.mock('../shared/platform/runtimeInvoke', () => ({ getRuntimeInvoke: vi.fn() }));

import { EDITOR_DISPLAY_MODE_KEY } from '../features/editor/model/editorDisplayMode';
import { preloadTranslationCatalog } from '../shared/localization/translations';
import { getRuntimeInvoke as getBridgeRuntimeInvoke } from '../shared/platform/bridge';
import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';
import { useWorkspaceStore } from '../store/workspaceStore';

import { createDueReview, createReadingProfile } from './app-smoke-review-fixtures';
import { createNode, createSmokeRuntimeInvoke, FIXED_TIMESTAMP } from './app-smoke.shared';

vi.stubGlobal('ResizeObserver', class { disconnect() {} observe() {} unobserve() {} });

const { App } = await import('../app/App');

beforeAll(async () => {
  await preloadTranslationCatalog('en');
  await preloadTranslationCatalog('zh-Hans');
});

function expectReviewToolbarSummary(label: string) {
  expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0);
}

async function enterFlow() {
  fireEvent.click(await screen.findByRole('button', { name: 'Enter Flow' }));
}

beforeEach(() => {
  vi.mocked(getBridgeRuntimeInvoke).mockReset();
  vi.mocked(getRuntimeInvoke).mockReset();
  const invoke = createSmokeRuntimeInvoke();
  vi.mocked(getBridgeRuntimeInvoke).mockReturnValue(invoke);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
});

it('renders note list and single document panel', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Topics' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Content' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Workspace Ribbon' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Review mode toolbar')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create QA Node' })).not.toBeInTheDocument();
});

it('shows editor display mode entrypoint inside more menu trigger', () => {
  render(<App />);

  expect(screen.getByRole('button', { name: 'More editor options' })).toHaveAttribute('aria-haspopup', 'menu');
  expect(screen.queryByRole('button', { name: 'Switch to Source mode' })).not.toBeInTheDocument();
  expect(localStorage.getItem(EDITOR_DISPLAY_MODE_KEY)).toBeNull();
});

it('runs study flow with FSRS cards consumed before queued reading cards', async () => {
  const invoke = vi.fn().mockImplementation((command: string, args?: { nodeId?: string }) => {
    if (command === 'load_node_document' && args?.nodeId === 'node-2') {
      return Promise.resolve({
        nodeId: 'node-2',
        content: 'Prompt [...]',
        hideTitleHeading: false,
        reveal: 'Answer'
      });
    }
    return createSmokeRuntimeInvoke()(command, args);
  });
  vi.mocked(getBridgeRuntimeInvoke).mockReturnValue(invoke);
  vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-2',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({
        id: 'node-1',
        kind: 'topic',
        title: 'Reading 1',
        content: 'Read this first',
        reveal: null,
        review: null,
        reading: createReadingProfile(FIXED_TIMESTAMP)
      }),
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'QA 2',
        content: 'Prompt [...]',
        reveal: 'Answer',
        review: createDueReview()
      })
    }
  }));

  render(<App />);

  await enterFlow();
  await waitFor(() => expect(useWorkspaceStore.getState().reviewSession.queueNodeIds).toEqual(['node-2']));
  expectReviewToolbarSummary('i 0/1');
  expect(screen.getByRole('button', { name: 'Show Answer' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Again' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show Answer' }));
  expect(screen.queryByRole('button', { name: 'Show Answer' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Again' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByLabelText('Answer section')).toBeInTheDocument());
});

it('enters review mode with the reading queue when no FSRS cards are due', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({
        id: 'node-1',
        kind: 'topic',
        title: 'Reading 1',
        content: 'Read this first',
        reveal: null,
        review: null,
        reading: createReadingProfile(FIXED_TIMESTAMP)
      })
    }
  }));

  render(<App />);

  await enterFlow();

  await waitFor(() => expect(useWorkspaceStore.getState().reviewSession.queueNodeIds).toEqual(['node-1']));
  expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Good' })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Read' }));
  await waitFor(() => {
    expect(screen.getByTestId('app-runtime-notice')).toHaveTextContent('All clear for now.');
  });
  expect(screen.queryByRole('button', { name: 'Continue reading' })).not.toBeInTheDocument();
  expect(screen.queryByRole('toolbar', { name: 'Flow toolbar' })).not.toBeInTheDocument();
});

it('syncs node list selection when review grading advances active node', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({
        id: 'node-1',
        kind: 'item',
        title: 'Welcome to Foliole',
        content: '# Welcome to Foliole\n\nStart writing markdown here.',
        reveal: 'Answer 1',
        review: createDueReview()
      }),
      'node-2': createNode({
        id: 'node-2',
        parentNodeId: 'node-1',
        title: 'QA 2',
        content: 'Prompt 2',
        reveal: 'Answer 2',
        review: createDueReview()
      })
    }
  }));

  render(<App />);

  await enterFlow();
  expectReviewToolbarSummary('i 0/2');
  fireEvent.click(await screen.findByRole('button', { name: 'Show Answer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Good' }));
  await waitFor(() => {
    expectReviewToolbarSummary('i 1/2');
  });

  await waitFor(() => {
    expect(useWorkspaceStore.getState().activeNodeId).toBe('node-2');
  });
});

it('closes review toolbar and shows all-clear notice when the session completes', async () => {
  useWorkspaceStore.setState((state) => ({
    activeNodeId: 'node-1',
    nodeOrder: ['node-1'],
    nodesById: {
      ...state.nodesById,
      'node-1': createNode({
        id: 'node-1',
        kind: 'item',
        title: 'Welcome to Foliole',
        content: '# Welcome to Foliole\n\nStart writing markdown here.',
        reveal: 'Answer 1',
        review: createDueReview()
      })
    }
  }));

  render(<App />);

  await enterFlow();
  fireEvent.click(await screen.findByRole('button', { name: 'Show Answer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Good' }));

  await waitFor(() => {
    expect(screen.getByTestId('app-runtime-notice')).toHaveTextContent('All clear for now.');
  });
  expect(screen.queryByRole('button', { name: 'Continue reading' })).not.toBeInTheDocument();
  expect(screen.queryByRole('toolbar', { name: 'Flow toolbar' })).not.toBeInTheDocument();
});
