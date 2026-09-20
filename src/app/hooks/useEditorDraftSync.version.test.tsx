import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useEditorDraftSync } from './useEditorDraftSync';

afterEach(() => vi.useRealTimers());

it('keeps the original version while incoming content changes during a draft', () => {
  vi.useFakeTimers();
  const onCommit = vi.fn();
  const { result, rerender } = renderHook((props) => useEditorDraftSync({
    ...props, nodeId: 'topic', onCommit
  }), { initialProps: { committedContent: 'Original', committedVersionId: 'ver_base' } });
  const input = (content: string) => act(() => {
    result.current.handleEditorInput({ contentLength: content.length, nodeId: 'topic' });
    result.current.handleEditorChange(content);
  });
  input('Local');
  rerender({ committedContent: 'Remote', committedVersionId: 'ver_remote' });
  input('Local continued');
  act(() => vi.advanceTimersByTime(1200));
  expect(onCommit).toHaveBeenCalledWith('topic', 'Local continued', {
    baseVersionId: 'ver_base', publishLocal: false
  });
});

it('does not create an edit when a new version arrives without input', () => {
  const onCommit = vi.fn();
  const { result, rerender } = renderHook((props) => useEditorDraftSync({
    ...props, nodeId: 'topic', onCommit
  }), { initialProps: { committedContent: 'Original', committedVersionId: 'ver_base' } });
  rerender({ committedContent: 'Remote', committedVersionId: 'ver_remote' });
  expect(result.current.editorContent).toBe('Remote');
  expect(onCommit).not.toHaveBeenCalled();
});
