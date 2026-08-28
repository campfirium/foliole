// @vitest-environment node

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const javaRoot = path.resolve(
  import.meta.dirname, '../../android/app/src/main/java/com/foliole/android'
);

describe('retired companion pairing stores', () => {
  it('does not revive encrypted pairing credentials or a second protocol owner', async () => {
    expect(existsSync(path.join(javaRoot, 'FolioleCompanionPairingStore.java'))).toBe(false);
    expect(existsSync(path.join(javaRoot, 'FolioleCompanionPairingProtocolStore.java'))).toBe(false);
    const protocol = await readFile(
      path.join(javaRoot, 'FolioleCompanionSyncProtocolDefinitions.java'), 'utf8'
    );
    expect(protocol).toContain('currentProtocolVersion(Context context)');
    expect(protocol).toContain('section(context, "syncProtocol").getInt("version")');
  });
});
