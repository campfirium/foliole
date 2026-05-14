import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, it } from 'vitest';

import {
  baseNode,
  documentPanelBodyMock,
  ensureWorkspaceNodeDocumentReady,
  renderSectionWithProps
} from './DocumentPanelSection.testSupport';

function getEmptyContent() {
  return documentPanelBodyMock.mock.calls.at(-1)?.[0] as {
    emptyContent?: ReactNode;
    emptyState?: { title: string };
  };
}

it('shows a loading state before workspace hydration finishes', () => {
  renderSectionWithProps({
    activeNodeId: null,
    editorNodeId: null,
    isWorkspaceHydrated: false,
    nodesById: {}
  });

  const bodyProps = getEmptyContent();
  expect(bodyProps.emptyState?.title).toBe('Loading workspace');
  expect(bodyProps.emptyContent).toBeTruthy();
});

it('shows an empty state after hydration when no note is selected', () => {
  renderSectionWithProps({
    activeNodeId: null,
    editorNodeId: null,
    isWorkspaceHydrated: true,
    nodesById: {}
  });

  const bodyProps = getEmptyContent();
  expect(bodyProps.emptyState?.title).toBe('No document selected');
  expect(bodyProps.emptyContent).toBeUndefined();
});

it('shows a retryable error state when the topic body failed to load', () => {
  renderSectionWithProps({
    nodesById: {
      'node-1': {
        ...baseNode,
        bodyStatus: 'failed',
        content: '',
        hasContent: true,
        reveal: null,
        hasReveal: false
      }
    }
  });

  const bodyProps = getEmptyContent();
  expect(bodyProps.emptyState?.title).toBe('Topic body unavailable');
  render(<>{bodyProps.emptyContent}</>);

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

  expect(screen.getByRole('alert')).toHaveTextContent('The topic body could not be loaded.');
  expect(ensureWorkspaceNodeDocumentReady).toHaveBeenCalledWith('node-1', { forceLoad: true });
});

it('shows a retryable missing state when the topic body is not on this device', () => {
  renderSectionWithProps({
    nodesById: {
      'node-1': {
        ...baseNode,
        bodyStatus: 'missing',
        content: '',
        hasContent: true,
        reveal: null,
        hasReveal: false
      }
    }
  });

  render(<>{getEmptyContent().emptyContent}</>);

  expect(screen.getByRole('alert')).toHaveTextContent('This topic body has not reached this device yet.');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});
