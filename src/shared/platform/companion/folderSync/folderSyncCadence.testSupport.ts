import { textBranch } from '../../../../../electron/database/topicTextState.testSupport.js';
import { createFolderWriterFixture } from '../../../../../lib/core/sync/folderSync/writeRound.testSupport.js';
import { applyConvergentSyncNodesWithDbPort } from '../../../../../lib/core/sync/syncNodeConvergence.js';

import { createFolderSyncCadence } from './folderSyncCadence.js';
import { createFolderSyncService } from './folderSyncService.js';
import { folderNativeFixture } from './folderSyncService.testSupport.js';

export async function createCadenceFixture(enabled = true) {
  const f = await createFolderWriterFixture();
  const native = folderNativeFixture(f.root);
  const service = createFolderSyncService(native.plugin, async () => ({ sourceId: 'source', source: f.host,
    attachments: f.input.sourceAttachments, assertCurrent() {} }));
  await service.choose();
  if (enabled) await service.setEnabled(true);
  let active = true;
  let head = f.first;
  const cadence = createFolderSyncCadence({ service, readState: service.read, readActive: async () => active });
  return { ...f, native, service, cadence, setNativeActive: (value: boolean) => { active = value; },
    async edit(id: string) {
      const next = textBranch(id, `Body ${id}`, head);
      await applyConvergentSyncNodesWithDbPort(f.db, [next]);
      head = next;
    },
    async close() { cadence.stop(); await service.getActiveRun()?.catch(() => undefined); await f.close(); } };
}

export function nextCompletedWrite(f: Awaited<ReturnType<typeof createCadenceFixture>>) {
  return new Promise<void>(resolve => {
    const unsubscribe = f.service.subscribe(event => {
      if (event === 'activity' && !f.service.getActiveRun()) { unsubscribe(); resolve(); }
    });
  });
}

export function pauseNextObjectWrite(f: Awaited<ReturnType<typeof createCadenceFixture>>) {
  const access = f.native.plugin.access;
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let paused = false;
  f.native.plugin.access = async input => {
    if (!paused && input.operation === 'write' && input.key.startsWith('folder-sync/objects/')) {
      paused = true;
      entered();
      await gate;
    }
    return access(input);
  };
  return { started, release };
}
