import { afterEach, describe, expect, it, vi } from 'vitest';

import { EDITOR_EXTERNAL_CHANGE_FLUSH_DELAY_MS } from './codeMirrorEditorControllers';
import { EditorExternalChangeBuffer } from './editorExternalChangeBuffer';

afterEach(() => {
  vi.useRealTimers();
});

describe('EditorExternalChangeBuffer coalescing', () => {
  it('coalesces rapid updates and flushes only the latest content', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const buffer = new EditorExternalChangeBuffer({
      getCurrentContent: () => 'abcde',
      getCurrentNodeId: () => 'node-1',
      isApplyingExternalContent: () => false,
      onFlush
    });

    buffer.handleDocumentChange('abcd', { isComposing: false, nodeId: 'node-1' });
    buffer.handleDocumentChange('abcde', { isComposing: false, nodeId: 'node-1' });

    expect(onFlush).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('abcde', 'node-1');
  });
});

describe('EditorExternalChangeBuffer lazy change resolution', () => {
  it('reads current editor content only when a same-node lazy change flushes', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const getCurrentContent = vi.fn(() => 'abcde');
    const buffer = new EditorExternalChangeBuffer({
      getCurrentContent,
      getCurrentNodeId: () => 'node-1',
      isApplyingExternalContent: () => false,
      onFlush
    });

    buffer.handleDocumentChange(null, { contentLength: 5, isComposing: false, nodeId: 'node-1' });

    expect(getCurrentContent).not.toHaveBeenCalled();
    vi.runAllTimers();

    expect(getCurrentContent).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('abcde', 'node-1');
  });

  it('uses supplied content when a lazy pending change no longer belongs to the current node', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const buffer = new EditorExternalChangeBuffer({
      getCurrentContent: () => 'Beta body',
      getCurrentNodeId: () => 'node-2',
      isApplyingExternalContent: () => false,
      onFlush
    });

    buffer.handleDocumentChange('Alpha draft', { isComposing: false, nodeId: 'node-1' });
    vi.runAllTimers();

    expect(onFlush).toHaveBeenCalledWith('Alpha draft', 'node-1');
  });

  it('waits until composition ends before flushing composed text', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const buffer = new EditorExternalChangeBuffer({
      getCurrentContent: () => 'ab中文',
      getCurrentNodeId: () => 'node-1',
      isApplyingExternalContent: () => false,
      onFlush
    });

    buffer.handleDocumentChange('ab中', { isComposing: true, nodeId: 'node-1' });
    vi.runAllTimers();

    expect(onFlush).not.toHaveBeenCalled();

    buffer.handleCompositionEnd();
    vi.runAllTimers();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('ab中文', 'node-1');
  });

});

describe('EditorExternalChangeBuffer composition boundaries', () => {
  it('keeps a composed change bound to its source content when the editor switches nodes before composition ends', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    let currentContent = 'Beta body';
    let currentNodeId = 'node-2';
    const buffer = new EditorExternalChangeBuffer({
      getCurrentContent: () => currentContent,
      getCurrentNodeId: () => currentNodeId,
      isApplyingExternalContent: () => false,
      onFlush
    });

    buffer.handleDocumentChange('Alpha draft', { isComposing: true, nodeId: 'node-1' });
    currentContent = 'Beta body';
    currentNodeId = 'node-2';
    buffer.handleCompositionEnd();
    vi.runAllTimers();

    expect(onFlush).toHaveBeenCalledWith('Alpha draft', 'node-1');
    expect(onFlush).not.toHaveBeenCalledWith('Beta body', 'node-1');
  });
  it('flushes pending content when destroyed', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const buffer = new EditorExternalChangeBuffer({
      flushDelayMs: 300,
      getCurrentContent: () => 'abcde',
      getCurrentNodeId: () => 'node-1',
      isApplyingExternalContent: () => false,
      onFlush
    });

    buffer.handleDocumentChange('abcde', { isComposing: false, nodeId: 'node-1' });
    buffer.destroy();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('abcde', 'node-1');
    vi.runAllTimers();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('does not flush stale pending content while external content is being applied during destroy', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const buffer = new EditorExternalChangeBuffer({
      flushDelayMs: 300,
      getCurrentContent: () => 'external content',
      getCurrentNodeId: () => 'node-1',
      isApplyingExternalContent: () => true,
      onFlush
    });

    buffer.handleDocumentChange('stale draft', { isComposing: false, nodeId: 'node-1' });
    buffer.destroy();
    vi.runAllTimers();

    expect(onFlush).not.toHaveBeenCalled();
  });
});

describe('EditorExternalChangeBuffer flush boundaries', () => {

  it('captures lazy pending content before an applying-external flush is deferred across node switch', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    let currentContent = 'Alpha draft';
    let currentNodeId = 'node-1';
    let applyingExternalContent = true;
    const buffer = new EditorExternalChangeBuffer({
      flushDelayMs: 300,
      getCurrentContent: () => currentContent,
      getCurrentNodeId: () => currentNodeId,
      isApplyingExternalContent: () => applyingExternalContent,
      onFlush
    });

    buffer.handleDocumentChange(null, { contentLength: 11, isComposing: false, nodeId: 'node-1' });
    buffer.flushNow();
    currentContent = 'Beta body';
    currentNodeId = 'node-2';
    applyingExternalContent = false;
    vi.runAllTimers();

    expect(onFlush).toHaveBeenCalledWith('Alpha draft', 'node-1');
    expect(onFlush).not.toHaveBeenCalledWith('Beta body', 'node-1');
  });

  it('flushes pending content synchronously through flushNow', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const buffer = new EditorExternalChangeBuffer({
      flushDelayMs: 300,
      getCurrentContent: () => 'abcde',
      getCurrentNodeId: () => 'node-1',
      isApplyingExternalContent: () => false,
      onFlush
    });

    buffer.handleDocumentChange('abcde', { isComposing: false, nodeId: 'node-1' });
    buffer.flushNow();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('abcde', 'node-1');
    vi.advanceTimersByTime(300);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('uses a non-zero app-level debounce window for editor external changes', () => {
    expect(EDITOR_EXTERNAL_CHANGE_FLUSH_DELAY_MS).toBeGreaterThanOrEqual(200);
  });
});
