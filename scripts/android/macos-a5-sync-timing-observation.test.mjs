// @vitest-environment node
import { expect, it } from 'vitest';

import { prepareAndroidEdit, replaceAndroidTimingBody } from './macos-a5-sync-timing-scenario.mjs';
import { assertTimingOverlap, hasActiveTimingTransfer, openTimingReader, waitForTimingBody } from './macos-a5-sync-timing-observation.mjs';

it('accepts only the complete persisted body and records its version', async () => {
  let index = 0;
  const result = await waitForTimingBody(async () => (++index === 1
    ? { content: 'prefix', current_version_id: 'old' }
    : { content: 'prefix and complete tail', current_version_id: 'new' }),
  'prefix and complete tail', { limitMs: 500 });
  expect(index).toBe(2);
  expect(result.versionId).toBe('new');
  expect(result.body).toBe('prefix and complete tail');
  expect(result.bodySha256).toHaveLength(64);
});

it('rejects late completion instead of reporting a slow sample as passed', async () => {
  let now = 1000;
  await expect(waitForTimingBody(async () => {
    now = 6001;
    return { content: 'complete', current_version_id: 'new' };
  }, 'complete', { startedAt: 1000, now: () => now })).rejects.toThrow('sync_timing_deadline_exceeded');
});

it('stops a hung read at the measurement deadline', async () => {
  await expect(waitForTimingBody(() => new Promise(() => {}), 'body', { limitMs: 20 }))
    .rejects.toThrow('sync_timing_deadline_exceeded');
});

it('does not count queued, already finished, tiny or failed responses as an in-flight sample', () => {
  const good = { startedAt: 10, endedAt: 30, bytes: 1024 * 1024 };
  expect(assertTimingOverlap([good], 20)).toBe(good);
  for (const change of [{ startedAt: 21 }, { endedAt: 19 }, { bytes: 123 }, { failed: true }]) {
    expect(() => assertTimingOverlap([{ ...good, ...change }], 20)).toThrow();
  }
});

it('opens a separate readonly connection only for the isolated Android database', async () => {
  const calls = [];
  const sqlite = {
    getUrl: async () => ({ url: 'file:///data/user/0/com.campfirium.foliole.android.acceptance/databases/foliole-companionSQLite.db' }),
    query: async options => { calls.push(options); return { values: [{ user_version: 92 }] }; },
    createNCConnection: async options => calls.push(options),
    open: async options => calls.push(options),
    closeNCConnection: async options => calls.push(options)
  };
  const previous = globalThis.Capacitor;
  globalThis.Capacitor = { Plugins: { CapacitorSQLite: sqlite } };
  try {
    const page = { evaluate: (callback, args) => callback(args) };
    const reader = await openTimingReader(page);
    await reader.read('topic'); await reader.close();
    expect(calls.find(value => value.statement?.includes('SELECT'))).toMatchObject({ readonly: true, values: ['topic'] });
    expect(calls.find(value => value.databasePath)).toMatchObject({ version: 92 });
    sqlite.getUrl = async () => ({ url: '/data/user/0/com.campfirium.foliole.android/databases/foliole-companionSQLite.db' });
    await expect(openTimingReader(page)).rejects.toThrow('timing_reader_requires_isolated_application');
  } finally { globalThis.Capacitor = previous; }
});

it.each([true, false])('opens editing without hiding already visible controls: %s', async initiallyVisible => {
  let visible = initiallyVisible;
  let editing = false;
  let body;
  const edit = { isVisible: async () => visible, click: async () => {
    if (!visible) throw new Error('edit_controls_hidden');
    editing = true;
  } };
  const page = { getByTestId: () => edit, locator: () => ({
    click: async () => { visible = !visible; },
    waitFor: async () => { if (!editing) throw new Error('not_editing'); },
    evaluate: async () => ({ selected: 'Old body', body: 'Old body' }),
    press: async () => { if (!editing) throw new Error('not_editing'); }
  }), keyboard: { insertText: async value => { body = value; } } };
  await prepareAndroidEdit(page);
  await replaceAndroidTimingBody(page, 'Complete body');
  expect(body).toBe('Complete body');
});

it('refuses to type over a partial selection instead of corrupting the timing fixture', async () => {
  let typed = false;
  const page = { locator: () => ({ waitFor: async () => {}, press: async () => {},
    evaluate: async () => ({ selected: 'Sync', body: 'Sync timing old body' })
  }), keyboard: { insertText: async () => { typed = true; } } };
  await expect(replaceAndroidTimingBody(page, 'New body')).rejects.toThrow('timing_input_requires_full_body_selection');
  expect(typed).toBe(false);
});

it('waits past short control requests but still requires completed byte evidence', () => {
  expect(hasActiveTimingTransfer([{ startedAt: 10 }], 50)).toBe(false);
  expect(hasActiveTimingTransfer([{ startedAt: 10, endedAt: 40 }], 150)).toBe(false);
  expect(hasActiveTimingTransfer([{ startedAt: 10 }], 150)).toBe(true);
  expect(() => assertTimingOverlap([{ startedAt: 10, endedAt: 200, bytes: 163 }], 150)).toThrow();
});
