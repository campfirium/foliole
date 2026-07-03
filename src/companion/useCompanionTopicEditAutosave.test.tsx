import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COMPANION_TOPIC_EDIT_AUTOSAVE_DELAY_MS,
  useCompanionTopicEditAutosave
} from './useCompanionTopicEditAutosave';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCompanionTopicEditAutosave scheduling', () => {
  it('debounces changed content and saves only the latest draft', async () => {
    const onSaveContent = vi.fn(async () => undefined);
    const { result } = renderHook(() => useCompanionTopicEditAutosave({
      canEdit: true,
      initialContent: 'Original',
      nodeId: 'topic-1',
      onSaveContent
    }));

    act(() => {
      result.current.handleChange('Draft 1');
      result.current.handleChange('Draft 2');
    });
    expect(onSaveContent).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMPANION_TOPIC_EDIT_AUTOSAVE_DELAY_MS);
    });

    expect(onSaveContent).toHaveBeenCalledTimes(1);
    expect(onSaveContent).toHaveBeenCalledWith('Draft 2');
  });

  it('skips unchanged content at the save trigger layer', async () => {
    const onSaveContent = vi.fn(async () => undefined);
    const { result } = renderHook(() => useCompanionTopicEditAutosave({
      canEdit: true,
      initialContent: 'Original',
      nodeId: 'topic-1',
      onSaveContent
    }));

    act(() => {
      result.current.handleChange('Changed');
      result.current.handleChange('Original');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMPANION_TOPIC_EDIT_AUTOSAVE_DELAY_MS);
      await result.current.flushPendingSave();
    });

    expect(onSaveContent).not.toHaveBeenCalled();
  });
});

describe('useCompanionTopicEditAutosave mode changes', () => {
  it('flushes pending changes when editing is turned off', async () => {
    const onSaveContent = vi.fn(async () => undefined);
    let canEdit = true;
    const { rerender, result } = renderHook(() => useCompanionTopicEditAutosave({
      canEdit,
      initialContent: 'Original',
      nodeId: 'topic-1',
      onSaveContent
    }));

    act(() => {
      result.current.handleChange('Draft');
      canEdit = false;
      rerender();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(onSaveContent).toHaveBeenCalledWith('Draft');
  });
});

describe('useCompanionTopicEditAutosave flushing', () => {
  it('does not start a second save for content already being saved', async () => {
    const onSaveContent = vi.fn(() => new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    }));
    const { result } = renderHook(() => useCompanionTopicEditAutosave({
      canEdit: true,
      initialContent: 'Original',
      nodeId: 'topic-1',
      onSaveContent
    }));

    act(() => {
      result.current.handleChange('Draft');
    });
    await act(async () => {
      const firstFlush = result.current.flushPendingSave();
      const secondFlush = result.current.flushPendingSave();
      expect(onSaveContent).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10);
      await Promise.all([firstFlush, secondFlush]);
    });

    expect(onSaveContent).toHaveBeenCalledTimes(1);
  });

  it('flushes pending changes on demand and reports save failures', async () => {
    const onSaveContent = vi.fn(async () => {
      throw new Error('Native write failed.');
    });
    const { result } = renderHook(() => useCompanionTopicEditAutosave({
      canEdit: true,
      initialContent: 'Original',
      nodeId: 'topic-1',
      onSaveContent
    }));

    act(() => {
      result.current.handleChange('Draft');
    });
    await act(async () => {
      await result.current.flushPendingSave();
    });

    expect(onSaveContent).toHaveBeenCalledWith('Draft');
    expect(result.current.error).toBe('Native write failed.');
  });
});
