// @vitest-environment node
import { File } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { NativeCompanionFramedFileRequest } from '../../lib/platform/nativeCompanionFramedFilesContract';
import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { companionAttachmentNativeFiles } from '../shared/platform/companion/sync/framed/companionAttachmentNativeFiles.testSupport';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { createCompanionFileImportHandler } from './companionFileImportActions';

const native = vi.hoisted(() => ({ access: null as null | ((input: NativeCompanionFramedFileRequest) => Promise<unknown>), fail: false, platform: 'android' }));
vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => native.platform, isNativePlatform: () => true, isPluginAvailable: () => false }, registerPlugin: () => ({
    ...createCompanionNativeSyncStub(), accessFramedSyncFile: async (input: NativeCompanionFramedFileRequest) => {
      if (input.operation === 'remove') return {};
      if (native.fail && input.operation === 'attachment' && input.action === 'publish-received') throw new Error('Unavailable');
      return native.access!(input);
    }
  }) };
});

// BIG_PNG is a valid PNG header with enough bytes to exceed the body budget once encoded.
const SMALL_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yZB8AAAAASUVORK5CYII=', 'base64');
const BIG_PNG = Buffer.concat([SMALL_PNG, Buffer.alloc(1_500_000, 1)]);
const REFERENCE_PNG = Buffer.concat([SMALL_PNG, Buffer.from([2])]);
const HTML_PNG = Buffer.concat([SMALL_PNG, Buffer.from([3])]);
const url = (bytes: Buffer) => `data:image/png;base64,${bytes.toString('base64')}`;
const key = (bytes: Buffer) => `${createHash('sha256').update(bytes).digest('hex')}.png`;

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
let directory: string;
beforeEach(async () => {
  library = await createSearchLibrary(0);
  native.fail = false; native.platform = 'android';
  directory = path.join(library.root, 'attachments');
  await mkdir(directory);
  native.access = companionAttachmentNativeFiles(directory);
});
afterEach(async () => { await library.close(); });

function importFile(body: string, name: string) {
  return createCompanionFileImportHandler({ refreshAfterMutation: async () =>
    (await loadCompanionWorkspaceSyncState()).workspace_snapshot })(new File([body], name));
}
const published = async () => (await readdir(directory)).filter(name => !name.startsWith('.')).sort();
const run = () => library.database.prepare('SELECT result_status,degraded_reason FROM import_runs').get() as Record<string, string>;

it.each(['android', 'ios'])('stores all three inline image forms as attachments on %s, including one over the body budget', async platform => {
  native.platform = platform;
  const body = `# Images\n\n![Big](${url(BIG_PNG)})\n\n![Linked][one]\n\n<img src="${url(HTML_PNG)}" alt="Raw">\n\n` +
    `\`\`\`\n![Sample](${url(SMALL_PNG)})\n\`\`\`\n\n[one]: ${url(REFERENCE_PNG)}\n`;
  const result = await importFile(body, 'images.md');
  if ('error' in result) throw new Error(result.error);
  expect(result.importWarning).toBeUndefined();
  const node = (await loadCompanionWorkspaceNode(result.nodeId))!;
  expect(node.content).toContain(`![Big](asset://${key(BIG_PNG)})`);
  expect(node.content).toContain(`![Linked](asset://${key(REFERENCE_PNG)})`);
  expect(node.content).toContain(`![Raw](asset://${key(HTML_PNG)})`);
  expect(node.content).toContain(`![Sample](${url(SMALL_PNG)})`);
  expect(node.content).not.toContain('[one]:');
  const keys = [BIG_PNG, REFERENCE_PNG, HTML_PNG].map(key).sort();
  expect(node.resourceReferences!.map(reference => reference.storage_key)).toEqual(keys);
  expect(await published()).toEqual(keys);
  expect(await readFile(path.join(directory, key(BIG_PNG)))).toEqual(BIG_PNG);
  expect(run()).toEqual({ result_status: 'imported', degraded_reason: null });
  await reopenSearchLibrary(library.root, '2026-11-28T08:00:00Z');
  expect((await loadCompanionWorkspaceNode(result.nodeId))!.content).toBe(node.content);
});

it.each(['notes.txt', 'page.html'])('converts inline images from %s', async name => {
  const result = await importFile(name === 'page.html'
    ? `<p>Before</p><img src="${url(BIG_PNG)}" alt="Shot">` : `Before\n\n![Shot](${url(BIG_PNG)})`, name);
  if ('error' in result) throw new Error(result.error);
  expect((await loadCompanionWorkspaceNode(result.nodeId))!.content).toContain(`![Shot](asset://${key(BIG_PNG)})`);
  expect(await published()).toEqual([key(BIG_PNG)]);
});

it('imports the same image again without a second file', async () => {
  for (const name of ['first.md', 'second.md']) {
    const result = await importFile(`![One](${url(SMALL_PNG)})\n\n![Two](${url(SMALL_PNG)})`, name);
    expect(result).toHaveProperty('nodeId');
  }
  expect(await published()).toEqual([key(SMALL_PNG)]);
});

it.each(['broken.md', 'broken.txt'])('keeps an unreadable inline image in %s and reports the incomplete conversion', async name => {
  const result = await importFile('Text\n\n![Broken](data:image/png;base64,cG5n)', name);
  if ('error' in result) throw new Error(result.error);
  expect(result.importWarning).toBe('conversion');
  expect((await loadCompanionWorkspaceNode(result.nodeId))!.content).toContain('![Broken](data:image/png;base64,cG5n)');
  expect(run()).toEqual({ result_status: 'degraded', degraded_reason: 'Inline images kept as text data: 1' });
  expect(await published()).toEqual([]);
});

it('does not commit the topic when an inline image file cannot be published', async () => {
  native.fail = true;
  expect(await importFile(`![One](${url(SMALL_PNG)})`, 'images.md')).toEqual({ error: 'save-failed' });
  expect(library.database.prepare('SELECT * FROM import_runs').all()).toEqual([]);
  expect(library.database.prepare("SELECT * FROM nodes WHERE kind='topic'").all()).toEqual([]);
});
