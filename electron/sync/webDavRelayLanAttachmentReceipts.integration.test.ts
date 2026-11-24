// @vitest-environment node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, it } from 'vitest';

import { edit, relayFixture, storageKey } from './webDavRelayAttachmentFixture.testSupport.js';

it.each([0, 1] as const)('reports a completed LAN transfer when initiator %s cannot write a relay receipt', async initiator => {
  const fixture = await relayFixture({ mode: 'unlimited' });
  try {
    const [source, target] = fixture.peers;
    const bytes = Buffer.from('Image transferred with a failed relay receipt write');
    const key = storageKey(bytes);
    await writeFile(path.join(source.assets, key), bytes);
    await edit(source.peer, [key], 'image-with-unavailable-relay-receipt');
    const local = fixture.peers[initiator];
    await local.peer.db.run(`CREATE TEMP TRIGGER reject_lan_attachment_receipt
      BEFORE INSERT ON sync_group_metadata WHEN NEW.value = 'lan-covered'
      BEGIN SELECT RAISE(ABORT, 'test_lan_attachment_receipt_write_failed'); END`);

    const result = await fixture.lan(false, undefined, initiator);
    await target.reopen();
    expect(await readFile(path.join(target.assets, key))).toEqual(bytes);
    expect(result).toMatchObject({ complete: true, attachments: { transferred: 1, pending: 0 } });
  } finally { await fixture.close(); }
});
