import { act } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  documentPanelBodyMock,
  renderSectionWithProps
} from './DocumentPanelSection.testSupport';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('commits body editor input through node-aware draft flush only', () => {
  const onEditorChange = vi.fn();
  const onNodeContentChange = vi.fn();
  renderSectionWithProps({
    editorContent: 'Alpha body',
    editorNodeId: 'node-1',
    onEditorChange,
    onNodeContentChange
  });

  const bodyProps = documentPanelBodyMock.mock.calls.at(-1)?.[0] as {
    editorNodeId: string | null;
    onEditorChange: (content: string, meta?: { nodeId: string | null }) => void;
    onEditorInput: (meta: { contentLength: number; nodeId: string | null }) => void;
  };

  expect(bodyProps.editorNodeId).toBe('node-1');

  act(() => {
    bodyProps.onEditorInput({ contentLength: 'Alpha body draft'.length, nodeId: 'node-1' });
    bodyProps.onEditorChange('Alpha body draft', { nodeId: 'node-1' });
  });

  expect(onEditorChange).not.toHaveBeenCalled();
  expect(onNodeContentChange).not.toHaveBeenCalled();

  act(() => {
    vi.advanceTimersByTime(1200);
  });

  expect(onEditorChange).not.toHaveBeenCalled();
  expect(onNodeContentChange).toHaveBeenCalledWith('node-1', 'Alpha body draft', { publishLocal: false });
});

it('commits early body input to the active real node before editorNodeId is ready', () => {
  const onEditorChange = vi.fn();
  const onNodeContentChange = vi.fn();
  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorContent: '',
    editorNodeId: null,
    onEditorChange,
    onNodeContentChange
  });

  const bodyProps = documentPanelBodyMock.mock.calls.at(-1)?.[0] as {
    onEditorChange: (content: string, meta?: { nodeId: string | null }) => void;
    onEditorInput: (meta: { contentLength: number; nodeId: string | null }) => void;
  };

  act(() => {
    bodyProps.onEditorInput({ contentLength: '# New topic\n\nBody'.length, nodeId: null });
    bodyProps.onEditorChange('# New topic\n\nBody', { nodeId: null });
    vi.advanceTimersByTime(1200);
  });

  expect(onEditorChange).not.toHaveBeenCalled();
  expect(onNodeContentChange).toHaveBeenCalledWith('node-1', '# New topic\n\nBody', { publishLocal: false });
});
