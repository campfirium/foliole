import { expect, it } from 'vitest';

import { createCompanionFramedSyncFiles } from './companionFramedSyncFiles';

const owner = { library_key: 'test-library', generation_id: 'test-generation' };

it.each([0, 256, 512 * 1024 + 19])('reads every byte of a %i-byte native file', async length => {
  const expected = Buffer.alloc(length);
  for (let index = 0; index < length; index += 1) expected[index] = index % 256;
  const files = createCompanionFramedSyncFiles({
    async accessFramedSyncFile(request) {
      expect(request).toEqual({ ...owner, key: 'requests/body', operation: 'read' });
      return { base64: expected.toString('base64') };
    }
  }, owner);

  const actual = await files.read('requests/body');
  expect(actual).not.toBeNull();
  if (!actual) throw new Error('Expected native file bytes');
  expect(Buffer.from(actual).equals(expected)).toBe(true);
});

it('preserves absent files and rejects malformed native responses', async () => {
  const absent = createCompanionFramedSyncFiles({ accessFramedSyncFile: async () => ({ base64: null }) }, owner);
  const missing = createCompanionFramedSyncFiles({ accessFramedSyncFile: async () => ({}) }, owner);
  const invalid = createCompanionFramedSyncFiles({ accessFramedSyncFile: async () => ({ base64: '%' }) }, owner);

  await expect(absent.read('requests/body')).resolves.toBeNull();
  await expect(missing.read('requests/body')).rejects.toThrow('framed_sync_file_response_invalid');
  await expect(invalid.read('requests/body')).rejects.toThrow();
});
