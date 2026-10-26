// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';

import { textBranch, textDevice } from '../../../../../electron/database/topicTextState.testSupport.js';
import type { DbPort } from '../../../../../lib/core/sync/dbPort.js';
import { companionWorkspaceSnapshots } from '../companionWorkspaceSnapshotStore.js';
import { invalidateCompanionReadingScope } from '../reading/companionReadingScope.js';

import { loadCompanionNodeTextAlternative, updateCompanionNodeTextAlternativeStatus } from './companionNodeTextAlternativeRepository.js';

const runtime = vi.hoisted(() => ({ db: null as DbPort | null }));
vi.mock('./iosCompanionActiveDatabase', () => ({ writeIosCompanionDatabase: (write: (db: DbPort) => unknown) => write(runtime.db!) }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({ isAvailableNativeCompanionRuntime: () => true }));

afterEach(() => { vi.useRealTimers(); invalidateCompanionReadingScope(); runtime.db = null; });

it.each(['dismissed', 'promoted'] as const)('registers committed %s alternatives and excludes a rejected mutation', async status => {
  const device = textDevice();
  runtime.db = device.db;
  invalidateCompanionReadingScope();
  try {
    device.sqlite.exec("CREATE TABLE companion_meta (key TEXT PRIMARY KEY, value TEXT); INSERT INTO companion_meta VALUES ('host_name', 'mobile')");
    const base = textBranch('base', 'Base');
    await device.receive([base, textBranch('main', 'Long main body', base)]);
    await device.receive([textBranch('other', 'Other', base)]);
    const alternative = await loadCompanionNodeTextAlternative('topic');
    expect(alternative).not.toBeNull();
    const read = vi.fn(async () => null);
    await companionWorkspaceSnapshots.refresh(read);
    expect(read).not.toHaveBeenCalled();
    await expect(updateCompanionNodeTextAlternativeStatus('topic', 'unknown', status)).rejects.toThrow('text_alternative_unavailable');
    await companionWorkspaceSnapshots.refresh(read);
    expect(read).not.toHaveBeenCalled();
    await updateCompanionNodeTextAlternativeStatus('topic', alternative!.alternative_id, status);
    await companionWorkspaceSnapshots.refresh(read);
    expect(read).toHaveBeenCalledExactlyOnceWith({ current: null, scope: { kind: 'full' } });
    if (status === 'promoted') expect((await device.current()).body_text).toBe(alternative!.body_text);
  } finally { device.sqlite.close(); }
});

it('registers expiry committed while loading alternatives', async () => {
  const device = textDevice();
  runtime.db = device.db;
  invalidateCompanionReadingScope();
  try {
    const base = textBranch('base', 'Base');
    await device.receive([base, textBranch('main', 'Long main body', base)]);
    const current = await device.receive([textBranch('other', 'Other', base)]);
    const expiry = current.snapshot.text_alternatives![0]!.expires_at;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(expiry).getTime() + 1);
    expect(await loadCompanionNodeTextAlternative('topic')).toBeNull();
    const read = vi.fn(async () => null);
    await companionWorkspaceSnapshots.refresh(read);
    expect(read).toHaveBeenCalledExactlyOnceWith({ current: null, scope: { kind: 'full' } });
    expect((await device.current()).snapshot.text_alternatives).toEqual([]);
  } finally { device.sqlite.close(); }
});
