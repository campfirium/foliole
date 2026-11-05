import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { acknowledgeCreatedContentVersion } from '../../store/workspaceContentEditAcknowledgements';

import { useEditorDraftSync } from './useEditorDraftSync';

afterEach(() => vi.useRealTimers());

it.each(['input-evidence', 'pending-draft'] as const)('binds a new draft to its creation version during %s', stage => {
  vi.useFakeTimers();
  const onCommit = vi.fn();
  const { result, rerender } = renderHook(props => useEditorDraftSync({ ...props, nodeId: 'new', onCommit }),
    { initialProps: { committedContent: '', committedVersionId: null as string | null } });
  act(() => {
    result.current.handleEditorInput({ nodeId: 'new', contentLength: 'Local input'.length });
    if (stage === 'pending-draft') result.current.handleEditorChange('Local input');
    acknowledgeCreatedContentVersion('new', 'created');
  });
  // Creation is acknowledged before a later remote head is published.
  rerender({ committedContent: 'Remote input', committedVersionId: 'remote' });
  act(() => {
    if (stage === 'input-evidence') result.current.handleEditorChange('Local input');
    vi.advanceTimersByTime(0);
  });
  expect(onCommit).toHaveBeenCalledWith('new', 'Local input', {
    baseContent: '', baseVersionId: 'created', publishLocal: false
  });
});

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
    baseContent: 'Original', baseVersionId: 'ver_base', publishLocal: false
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

it('retains the original input basis while the editor buffer has not delivered its body', () => {
  vi.useFakeTimers();
  const onCommit = vi.fn();
  const { result, rerender } = renderHook(props => useEditorDraftSync({ ...props, nodeId: 'topic', onCommit }),
    { initialProps: { committedContent: 'Original', committedVersionId: 'ver_base' } });
  act(() => result.current.handleEditorInput({ nodeId: 'topic', contentLength: 'Local input'.length }));
  rerender({ committedContent: 'Remote', committedVersionId: 'ver_remote' });
  act(() => {
    result.current.handleEditorChange('Local input');
    vi.advanceTimersByTime(0);
  });
  expect(onCommit).toHaveBeenCalledWith('topic', 'Local input', {
    baseContent: 'Original', baseVersionId: 'ver_base', publishLocal: false
  });
});
