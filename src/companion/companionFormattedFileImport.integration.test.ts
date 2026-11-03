// @vitest-environment node
import { File } from 'node:buffer';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createSearchLibrary, reopenSearchLibrary } from '../shared/platform/companion/runtime/companionSearchSnapshot.testSupport';
import { loadCompanionWorkspaceNode } from '../shared/platform/companion/runtime/companionWorkspaceNodeStore';
import { loadCompanionWorkspaceSyncState } from '../shared/platform/companionWorkspaceSync';

import { createCompanionFileImportHandler } from './companionFileImportActions';

vi.mock('@capacitor/core', async () => {
  const { createCompanionNativeSyncStub } = await import('../shared/platform/companion/runtime/companionNativeSync.testSupport');
  return { Capacitor: { getPlatform: () => 'android', isNativePlatform: () => true }, registerPlugin: createCompanionNativeSyncStub };
});

let library: Awaited<ReturnType<typeof createSearchLibrary>>;
beforeEach(async () => { library = await createSearchLibrary(0); });
afterEach(async () => { await library.close(); });

async function importFile(body: string | Uint8Array, name: string) {
  let current = await loadCompanionWorkspaceSyncState();
  const workspace = { refreshAfterMutation: async () => {
    current = await loadCompanionWorkspaceSyncState();
    return current.workspace_snapshot;
  } };
  const source = new File([typeof body === 'string' ? body : Uint8Array.from(body)], name);
  const bytes = await source.arrayBuffer();
  const result = await createCompanionFileImportHandler(workspace)(source);
  expect(await source.arrayBuffer()).toEqual(bytes);
  return { result, current };
}

it.each(['md', 'markdown', 'MD'])('imports .%s with the shared frontmatter, headings and inline formatting rules', async extension => {
  const { result, current } = await importFile('---\ntitle: My source\n---\r\n# Heading\r\n\r\n**Bold** and [a link](https://example.com).', `source.${extension}`);
  expect(result).toMatchObject({ nodeId: expect.any(String) });
  if ('error' in result) throw new Error(result.error);
  const node = await loadCompanionWorkspaceNode(result.nodeId);
  expect(node).toMatchObject({ title: 'My source', hideTitleHeading: true,
    content: '# My source\n\n## Heading\n\n**Bold** and [a link](https://example.com).' });
  expect(current.workspace_snapshot?.nodesById[result.nodeId]).toBeDefined();
  const run = library.database.prepare('SELECT source_kind,result_status FROM import_runs').get();
  expect(run).toEqual({ source_kind: 'markdown', result_status: 'imported' });
  await reopenSearchLibrary(library.root, '2026-11-03T04:00:00Z');
  expect(await loadCompanionWorkspaceNode(result.nodeId)).toMatchObject({ title: node!.title, content: node!.content });
});

it.each(['html', 'htm', 'HTML'])('converts .%s to readable Markdown and reopens the durable result', async extension => {
  const { result } = await importFile('<html><head><meta charset="utf-8"></head><body><h1>Saved page</h1><p><b>Bold</b> and <a href="https://example.com">a link</a>.</p><ul><li>First</li><li>Second</li></ul><script>Never import this script</script></body></html>', `source.${extension}`);
  if ('error' in result) throw new Error(result.error);
  const node = await loadCompanionWorkspaceNode(result.nodeId);
  expect(node).toMatchObject({ title: 'Saved page', hideTitleHeading: true });
  expect(node!.content).toContain('**Bold** and [a link](https://example.com).');
  expect(Array.from(node!.content.matchAll(/^[-*] (.+)$/gmu), match => match[1])).toEqual(['First', 'Second']);
  expect(node!.content).not.toContain('Never import this script');
  expect(library.database.prepare('SELECT source_kind,result_status FROM import_runs').get())
    .toEqual({ source_kind: 'html', result_status: 'imported' });
  await reopenSearchLibrary(library.root, '2026-11-03T04:00:00Z');
  expect(await loadCompanionWorkspaceNode(result.nodeId)).toMatchObject({ title: node!.title, content: node!.content });
});

it('decodes the declared HTML charset before conversion through the same desktop decoder', async () => {
  const head = new TextEncoder().encode('<meta charset="Shift_JIS"><p>');
  const tail = new TextEncoder().encode('</p>');
  const bytes = new Uint8Array([...head, 0x93, 0xfa, 0x96, 0x7b, ...tail]);
  const { result } = await importFile(bytes, 'japanese.htm');
  if ('error' in result) throw new Error(result.error);
  expect(await loadCompanionWorkspaceNode(result.nodeId)).toMatchObject({ content: '日本' });
});

it.each([
  ['source.md', '# Imported\n\nReadable body\n\n![Figure](images/figure.png)'],
  ['source.html', '<h1>Imported</h1><p>Readable body</p><img src="images/figure.png" alt="Figure">']
])('keeps the body and unavailable local image reference from %s with a durable incomplete result', async (name, body) => {
  const { result } = await importFile(body, name);
  if ('error' in result) throw new Error(result.error);
  expect(result.importWarning).toBe('images');
  const node = await loadCompanionWorkspaceNode(result.nodeId);
  expect(node!.content).toContain('Readable body');
  expect(node!.content).toContain('![Figure](images/figure.png)');
  const run = library.database.prepare('SELECT result_status,degraded_reason FROM import_runs').get() as Record<string, string>;
  expect(run.result_status).toBe('degraded');
  expect(run.degraded_reason).toContain('local image import degraded: Missing local image: images/figure.png');
  await reopenSearchLibrary(library.root, '2026-11-03T04:00:00Z');
  expect(await loadCompanionWorkspaceNode(result.nodeId)).toMatchObject({ content: node!.content });
});

it('preserves inline and remote images without misreporting them as unavailable local files', async () => {
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yZB8AAAAASUVORK5CYII=';
  const { result } = await importFile(`# Images\n\n![Inline](${encodeURIComponent(image)})\n\n![Remote](https://example.com/figure.png)`, 'images.md');
  if ('error' in result) throw new Error(result.error);
  expect(result.importWarning).toBeUndefined();
  const node = await loadCompanionWorkspaceNode(result.nodeId);
  expect(node!.content).toContain(`![Inline](${image})`);
  expect(node!.content).toContain('![Remote](https://example.com/figure.png)');
  expect(library.database.prepare('SELECT result_status FROM import_runs').get()).toEqual({ result_status: 'imported' });
});

it('keeps extensionless Obsidian note embeds outside the image import path, as desktop does', async () => {
  const { result } = await importFile('# Notes\n\n![[Reference]]\n\n![[.png]]', 'notes.md');
  if ('error' in result) throw new Error(result.error);
  expect(result.importWarning).toBeUndefined();
  expect((await loadCompanionWorkspaceNode(result.nodeId))!.content).toContain('![[.png]]');
  expect(library.database.prepare('SELECT result_status FROM import_runs').get()).toEqual({ result_status: 'imported' });
});

it('warns about an unsupported HTML embed while retaining the converted body and placeholder', async () => {
  const { result } = await importFile('<p>Readable text</p><iframe src="https://example.com/embed"></iframe>', 'embedded.html');
  if ('error' in result) throw new Error(result.error);
  expect(result.importWarning).toBe('conversion');
  expect((await loadCompanionWorkspaceNode(result.nodeId))!.content).toContain('[Embedded iframe: https://example.com/embed]');
});

it.each([
  ['invalid.html', '<meta charset="not-an-encoding"><p>Readable</p>'],
  ['empty.html', '<script>Only executable markup</script>'],
  ['empty.md', '   \n\n']
])('rejects %s without leaving a topic or import event', async (name, body) => {
  const { result } = await importFile(body, name);
  expect(result).toEqual({ error: 'save-failed' });
  expect(library.database.prepare('SELECT * FROM import_runs').all()).toEqual([]);
  expect(library.database.prepare("SELECT id FROM nodes WHERE kind='topic'").all()).toEqual([]);
});
