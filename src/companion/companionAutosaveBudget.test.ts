import { afterEach, expect, it, vi } from 'vitest';

import { EDITOR_EXTERNAL_CHANGE_FLUSH_DELAY_MS } from '../features/editor/adapters/codeMirrorEditorControllers';
import { EditorExternalChangeBuffer } from '../features/editor/adapters/editorExternalChangeBuffer';
import { ContentDraftSession } from '../shared/platform/companion/editing/contentDraftSession';

import { createContentSaveMock, deferred } from './companionContentEditingTestSupport';
import { COMPANION_TOPIC_EDIT_AUTOSAVE_DELAY_MS } from './useCompanionTopicEditAutosave';

afterEach(() => vi.useRealTimers());

function fixture() {
  const save = createContentSaveMock();
  const session = new ContentDraftSession('n1', { content: 'Original body', versionId: 'base' },
    save, COMPANION_TOPIC_EDIT_AUTOSAVE_DELAY_MS);
  let content = 'Original body';
  const buffer = new EditorExternalChangeBuffer({
    getCurrentContent: () => content, getCurrentNodeId: () => 'n1', isApplyingExternalContent: () => false,
    flushDelayMs: EDITOR_EXTERNAL_CHANGE_FLUSH_DELAY_MS,
    onFlush: value => session.change(value)
  });
  return { save, session, buffer, input(value: string) {
    content = value;
    session.markBufferedInput();
    buffer.handleDocumentChange(value, { nodeId: 'n1', isComposing: false });
  } };
}

it('saves immediately when the production editor buffer delivers the body', async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.input('Complete new body');
  await vi.advanceTimersByTimeAsync(1200);
  expect(f.session.value).toBe('Complete new body');
  expect(f.save).toHaveBeenCalledTimes(1);
  expect(f.save.mock.calls[0]?.[1]).toBe('Complete new body');
  f.buffer.destroy();
});

it('records that continuous input has no save deadline at either buffer boundary', async () => {
  vi.useFakeTimers();
  const f = fixture();
  for (let index = 0; index < 20; index++) {
    f.input(`Body ${index}`);
    await vi.advanceTimersByTimeAsync(500);
  }
  expect(f.save).not.toHaveBeenCalled();
  expect(f.session.value).toBe('Original body');
  await vi.advanceTimersByTimeAsync(1900);
  expect(f.save).toHaveBeenCalledTimes(1);
  expect(f.save.mock.calls[0]?.[1]).toBe('Body 19');
  f.buffer.destroy();
});

it('holds outdated queued content when raw input arrives during an earlier save', async () => {
  const save = createContentSaveMock();
  const complete = save.getMockImplementation()!;
  const gate = deferred<void>();
  save.mockImplementationOnce((...args) => gate.promise.then(() => complete(...args)));
  const session = new ContentDraftSession('n1', { content: 'Original body', versionId: 'base' }, save);
  session.change('First');
  session.change('Outdated');
  session.markBufferedInput();
  gate.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(save).toHaveBeenCalledTimes(1);
  session.change('Latest');
  await session.flush();
  expect(save.mock.calls.map(call => call[1])).toEqual(['First', 'Latest']);
  expect(save.mock.calls[1]?.[2]?.baseVersionId).toBe(save.mock.calls[0]?.[2]?.versionId);
});
