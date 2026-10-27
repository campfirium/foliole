import { afterEach, expect, it, vi } from 'vitest';

import { loadCompanionNodeTextAlternative } from './companionNodeTextAlternativeRepository';
import { createSearchLibrary } from './companionSearchSnapshot.testSupport';
import { getIosCompanionDatabaseOwner } from './iosCompanionDatabaseBootstrap';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('./companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
afterEach(async () => { await library?.close(); });

it('keeps an in-flight speculative document read alive when opening a topic without expired alternatives', async () => {
  library = await createSearchLibrary(2, 32);
  const owner = getIosCompanionDatabaseOwner();
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>(done => { entered = done; });
  const gate = new Promise<void>(done => { release = done; });
  const background = owner.readBackgroundSnapshot(async db => {
    entered();
    await gate;
    return db.query('SELECT content FROM nodes WHERE id = ?', ['000001']);
  }).then(rows => ({ rows }), error => ({ error }));
  await started;
  try {
    expect(await loadCompanionNodeTextAlternative('000000')).toBeNull();
  } finally { release(); }
  const result = await background;
  expect(result).not.toHaveProperty('error');
  expect(result).toEqual({ rows: [{ content: expect.stringContaining('prefix alpha') }] });
});
