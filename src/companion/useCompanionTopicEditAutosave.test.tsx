import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { CompanionContentAcknowledgement } from '../shared/platform/companion/editing/companionContentEditContract';

import { createContentSaveMock, deferred } from './companionContentEditingTestSupport';
import { CompanionDraftProvider } from './CompanionDraftProvider';
import { useCompanionTopicEditAutosave } from './useCompanionTopicEditAutosave';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function mount(save = createContentSaveMock()) {
  const hook = renderHook(({ content, nodeId, canEdit }) => useCompanionTopicEditAutosave({
    canEdit, initialContent: content, initialVersionId: 'base', nodeId, onSaveContent: save
  }), { initialProps: { content: 'Original body', nodeId: 'n1', canEdit: true }, wrapper: CompanionDraftProvider });
  return { ...hook, save };
}

it('debounces input and preserves its original baseline across source refreshes', async () => {
  vi.useFakeTimers();
  const { result, rerender, save } = mount();
  act(() => result.current.handleChange('Draft'));
  save.setSource({ content: 'Remote', versionId: 'remote' });
  rerender({ content: 'Remote', nodeId: 'n1', canEdit: true });
  expect(result.current.value).toBe('Draft');
  await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
  expect(save).toHaveBeenCalledWith('n1', 'Draft', expect.objectContaining({ baseVersionId: 'base' }));
  expect(result.current.value).toBe('Draft');
});

it('awaits duplicate flushes and serializes continued input behind the actual acknowledgement', async () => {
  const save = createContentSaveMock();
  const gate = deferred<CompanionContentAcknowledgement>();
  save.mockImplementationOnce(() => gate.promise);
  const { result } = mount(save);
  act(() => result.current.handleChange('First'));
  let first!: Promise<void>;
  let second!: Promise<void>;
  let duplicate!: Promise<void>;
  let done = false;
  act(() => {
    first = result.current.flushPendingSave();
    duplicate = result.current.flushPendingSave().then(() => { done = true; });
    result.current.handleChange('Second');
    second = result.current.flushPendingSave();
  });
  expect(done).toBe(false);
  expect(save).toHaveBeenCalledTimes(1);
  const edit = save.mock.calls[0]![2]!;
  await act(async () => {
    gate.resolve({ content: 'First merged', currentVersionId: 'merge', submittedVersionId: edit.versionId });
    await Promise.all([first, second, duplicate]);
  });
  expect(save.mock.calls[1]![2]!.baseVersionId).toBe(edit.versionId);
  expect(result.current.value).toBe('Second');
});

it('rejects a failed flush, retains input across navigation and retries the identical version', async () => {
  const { result, rerender, save } = mount();
  save.mockRejectedValueOnce(new Error('Disk full'));
  act(() => result.current.handleChange('Draft'));
  await act(async () => { await expect(result.current.flushPendingSave()).rejects.toThrow('Disk full'); });
  const uncertain = save.mock.calls[0]![2];
  expect(result.current.error).toBe('Disk full');
  save.mockRejectedValueOnce(new Error('Still full'));
  rerender({ content: 'Other', nodeId: 'n2', canEdit: false });
  await act(async () => undefined);
  rerender({ content: 'Stale original', nodeId: 'n1', canEdit: true });
  expect(result.current.value).toBe('Draft');
  await act(async () => { await result.current.flushPendingSave(); });
  expect(save.mock.calls[1]![2]).toEqual(uncertain);
  expect(save.mock.calls[2]![2]).toEqual(uncertain);
  expect(result.current.error).toBe(null);
});

it('uses a fresh database read when stale UI snapshots arrive after a confirmed save', async () => {
  const { result, rerender, save } = mount();
  act(() => result.current.handleChange('Saved draft'));
  await act(async () => { await result.current.flushPendingSave(); });
  save.setSource({ content: 'Later remote merge', versionId: 'newest' });
  rerender({ content: 'Old remote snapshot', nodeId: 'n1', canEdit: true });
  await act(async () => undefined);
  expect(result.current.value).toBe('Later remote merge');
  act(() => result.current.handleChange('Next input'));
  await act(async () => { await result.current.flushPendingSave(); });
  expect(save.mock.calls[1]![2]!.baseVersionId).toBe('newest');
});

it('ignores a read that resolves after newer input and flushes when editing ends', async () => {
  const save = createContentSaveMock();
  const read = deferred<{ content: string; versionId: string }>();
  save.readSource.mockImplementationOnce(() => read.promise);
  const { result, rerender } = mount(save);
  act(() => result.current.handleChange('Typed during read'));
  await act(async () => { read.resolve({ content: 'Stale', versionId: 'stale' }); });
  expect(result.current.value).toBe('Typed during read');
  rerender({ content: 'Original body', nodeId: 'n1', canEdit: false });
  await act(async () => undefined);
  expect(save).toHaveBeenCalledWith('n1', 'Typed during read', expect.objectContaining({ baseVersionId: 'base' }));
});
