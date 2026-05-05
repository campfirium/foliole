import { describe, expect, it, vi } from 'vitest';

import { EditorExternalChangeBuffer } from './editorExternalChangeBuffer';

describe('EditorExternalChangeBuffer', () => {
  it('coalesces rapid updates and flushes only the latest content', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const buffer = new EditorExternalChangeBuffer({
      getCurrentContent: () => 'abcde',
      isApplyingExternalContent: () => false,
      onFlush
    });

    buffer.handleDocumentChange('abcd', { isComposing: false });
    buffer.handleDocumentChange('abcde', { isComposing: false });

    expect(onFlush).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('abcde');
  });

  it('waits until composition ends before flushing composed text', () => {
    vi.useFakeTimers();
    const onFlush = vi.fn();
    const buffer = new EditorExternalChangeBuffer({
      getCurrentContent: () => 'ab中文',
      isApplyingExternalContent: () => false,
      onFlush
    });

    buffer.handleDocumentChange('ab中', { isComposing: true });
    vi.runAllTimers();

    expect(onFlush).not.toHaveBeenCalled();

    buffer.handleCompositionEnd();
    vi.runAllTimers();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('ab中文');
  });
});
