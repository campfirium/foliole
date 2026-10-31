import { describe, expect, it, vi } from 'vitest';

import { createEditorTextReplaySave } from './editorTextReplaySave';

describe('text replay save confirmation', () => {
  it('keeps the replay pending on failure and retries the same submission', async () => {
    const notify = vi.fn();
    const persist = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const save = createEditorTextReplaySave(notify);
    save.submit(persist);
    await vi.waitFor(() => expect(save.status).toBe('failed'));
    let completed = false;
    void save.completion.then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    notify.mock.calls[0]![0]();
    await expect(save.completion).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(save.status).toBe('saved');
  });

  it('accepts confirmation when a close drain saves a previously failed replay', async () => {
    const save = createEditorTextReplaySave(vi.fn());
    save.submit(async () => false);
    await vi.waitFor(() => expect(save.status).toBe('failed'));
    save.confirm(true);
    await expect(save.completion).resolves.toBe(true);
    save.confirm(false);
    expect(save.status).toBe('saved');
  });

  it('rejects an unapplied replay without invoking storage', async () => {
    const save = createEditorTextReplaySave(vi.fn());
    save.reject();
    await expect(save.completion).resolves.toBe(false);
    expect(save.status).toBe('rejected');
  });
});
