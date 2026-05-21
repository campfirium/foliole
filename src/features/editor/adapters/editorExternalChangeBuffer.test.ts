import { describe, expect, it, vi } from 'vitest';

import { EditorExternalChangeBuffer } from './editorExternalChangeBuffer';

describe('EditorExternalChangeBuffer', () => {
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
});
