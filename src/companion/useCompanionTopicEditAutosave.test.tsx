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

describe('useCompanionTopicEditAutosave flushing', () => {
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
