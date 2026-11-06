import { act } from '@testing-library/react';
import { expect, it } from 'vitest';

import { createEditorHandoffFixture, transport } from './editorHandoff.test-support.js';

export function registerUnprotectedEditorTests() {
  it.each([false, true])('opens an existing document with only its business read-only state (%s)', async readOnly => {
    let release!: () => void;
    transport.holdGate = new Promise(resolve => { release = resolve; });
    try {
      const app = await createEditorHandoffFixture(true, true, undefined, () => ({ isEditorReadOnly: readOnly }));
      expect(app.view.result.current.isEditorReadOnly).toBe(readOnly);
      if (!readOnly) {
        await act(async () => { app.input('Immediate input'); expect(await app.drain()).toBe(true); });
        expect((await app.current()).body_text).toBe('Immediate input');
        expect(app.view.result.current.isEditorReadOnly).toBe(false);
      }
      expect(app.heldBases()).toEqual([]);
    } finally { await act(async () => { release(); }); }
  });

  it('adopts a remote document while idle without waiting for a collection hold', async () => {
    let release!: () => void;
    transport.remoteGate = new Promise(resolve => { release = resolve; });
    try {
      const app = await createEditorHandoffFixture(true, true);
      await act(async () => { await app.remote(); });
      expect(app.view.result.current.editorContent).toBe('Remote');
      await act(async () => { app.input('Remote continued'); expect(await app.drain()).toBe(true); });
      expect((await app.current()).body_text).toBe('Remote continued');
      expect(transport.submitted[0]?.baseVersionId).toBe('remote');
      expect(app.heldBases()).toEqual([]);
    } finally { await act(async () => { release(); }); }
  });
}
