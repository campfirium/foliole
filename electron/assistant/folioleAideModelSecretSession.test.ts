// @vitest-environment node

import { expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  reads: 0,
  secrets: new Map<string, string>(),
  writes: 0
}));

vi.mock('../security/publishDeviceSecretStore.js', () => ({
  deletePublishDeviceSecret: (file: string) => state.secrets.delete(file),
  hasPublishDeviceSecret: (file: string) => state.secrets.has(file),
  readPublishDeviceSecret: (file: string) => {
    state.reads += 1;
    return state.secrets.get(file) ?? '';
  },
  writePublishDeviceSecret: (file: string, _label: string, value: string) => {
    state.writes += 1;
    state.secrets.set(file, value);
  }
}));

import {
  readFolioleAideModelSecret,
  writeFolioleAideModelSecret
} from './folioleAideModelSecretSession.js';

it('decrypts an existing key once per process and skips unchanged encryption writes', () => {
  state.secrets.set('existing.bin', 'existing-key');

  expect(readFolioleAideModelSecret('existing.bin')).toBe('existing-key');
  expect(readFolioleAideModelSecret('existing.bin')).toBe('existing-key');
  writeFolioleAideModelSecret('existing.bin', 'existing-key');

  expect(state.reads).toBe(1);
  expect(state.writes).toBe(0);

  writeFolioleAideModelSecret('new.bin', 'new-key');
  writeFolioleAideModelSecret('new.bin', 'new-key');
  expect(state.writes).toBe(1);
});
